import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.js';
import { saveDuration } from '../worker/photo-duration.js';
import { createSession, authenticate, sameOrigin } from '../worker/admin-auth.js';
import { handlePlaylist } from '../worker/media.js';

function database(migrate = true) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_tv_admin.sql',import.meta.url),'utf8'));
  if (migrate) sqlite.exec(readFileSync(new URL('../migrations/0002_photo_duration.sql',import.meta.url),'utf8'));
  sqlite.exec(`INSERT INTO admin_users(id,username,display_name,password_hash) VALUES('admin','demo','Ficticio','not-a-real-hash');
    INSERT INTO media(id,original_filename,display_name,storage_key,media_type,mime_type,size_bytes,sort_order,created_by)
    VALUES('photo','photo.png','Foto ficticia','photo.png','image','image/png',10,1,'admin'),('video','video.mp4','Video ficticio','video.mp4','video','video/mp4',10,2,'admin');`);
  const db = {
    sqlite,
    prepare(sql) {
      const statement = args => ({
        bind: (...values) => statement(values),
        first: async () => sqlite.prepare(sql).get(...args) || null,
        all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
        run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }),
      });
      return statement([]);
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const result=[]; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
      catch(error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  return db;
}
function environment(db, site = 'renace') {
  return { TV_DB: db, TV_SITE: site, TV_ADMIN_ENABLED:'true',R2_MEDIA_ENABLED:'true',MEDIA_BUCKET:{},
    ASSETS:{ fetch:async()=>Response.json({slideDurationSeconds:10,items:[]}) } };
}
for (const value of [1,5,10,15,300]) test(`photo duration ${value}: one update + atomic audit; video untouched`,async()=>{
  const db=database(),env=environment(db);
  assert.equal((await saveDuration(env,'admin','photo',{durationSeconds:value,revision:0})).status,200);
  assert.equal(db.sqlite.prepare("SELECT duration_seconds FROM media WHERE id='photo'").get().duration_seconds,value);
  assert.equal(db.sqlite.prepare("SELECT duration_seconds FROM media WHERE id='video'").get().duration_seconds,null);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM audit_log').get().n,1);
  assert.equal(db.sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(db.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  db.sqlite.close();
});
for (const value of [0,-1,1.5,301,'5','invalid',null,NaN,Infinity]) test(`reject invalid duration ${String(value)} without writes`,async()=>{
  const db=database(); assert.equal((await saveDuration(environment(db),'admin','photo',{durationSeconds:value,revision:0})).status,400);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM audit_log').get().n,0); db.sqlite.close();
});
test('stale simultaneous editor cannot overwrite first save; missing/deleted/video rejected',async()=>{
  const db=database(),env=environment(db);
  assert.equal((await saveDuration(env,'admin','photo',{durationSeconds:8,revision:0})).status,200);
  assert.equal((await saveDuration(env,'admin','photo',{durationSeconds:9,revision:0})).status,409);
  for(const id of ['missing','video']) assert.equal((await saveDuration(env,'admin',id,{durationSeconds:9,revision:0})).status,409);
  db.sqlite.exec("UPDATE media SET deleting=1 WHERE id='photo'");
  assert.equal((await saveDuration(env,'admin','photo',{durationSeconds:9,revision:1})).status,409);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM audit_log').get().n,1); db.sqlite.close();
});
test('failed audit rolls back duration and revision',async()=>{
  const db=database();
  await assert.rejects(saveDuration(environment(db),'nonexistent-admin','photo',{durationSeconds:8,revision:0}));
  assert.equal(db.sqlite.prepare("SELECT duration_revision FROM media WHERE id='photo'").get().duration_revision,0);
  assert.equal(db.sqlite.prepare("SELECT duration_seconds FROM media WHERE id='photo'").get().duration_seconds,null); db.sqlite.close();
});
test('old schema playlist stays usable; migrated null retains 10 seconds; no private fields leak',async()=>{
  for(const migrated of [false,true]) {
    const db=database(migrated), env=environment(db);
    const response=await handlePlaylist(new Request('https://tv.test/playlist.json'),env),body=await response.json();
    assert.equal(response.headers.get('x-renace-playlist-source'),'r2');
    assert.equal(body.slideDurationSeconds,10); assert.equal(body.items.length,2);
    assert.equal(body.items[0].durationSeconds,null); assert.equal('durationSeconds' in body.items[1],false);
    assert.equal(JSON.stringify(body).includes('storage_key'),false); db.sqlite.close();
  }
});
test('independent databases, cookies, auth and origins reject cross-site mutation',async()=>{
  const a=database(),b=database(),ea=environment(a),eb=environment(b,'santofe');
  const make=(site,cookie,origin=`https://${site}.test`)=>new Request(`https://${site}.test/admin/api/content/photo/duration`,{method:'PATCH',headers:{cookie:cookie||'',origin,'content-type':'application/json'},body:JSON.stringify({durationSeconds:7,revision:0})});
  const sa=await createSession(new Request('https://renace.test/admin/api/login'),ea,'admin');
  const sb=await createSession(new Request('https://santofe.test/admin/api/login'),eb,'admin');
  assert.match(sa.setCookie,/^renace_tv_session=/); assert.match(sb.setCookie,/^santofe_tv_session=/);
  assert.equal((await worker.fetch(make('renace'),ea)).status,401);
  assert.equal((await worker.fetch(make('santofe',sa.setCookie),eb)).status,401);
  assert.equal((await worker.fetch(make('renace',sb.setCookie),ea)).status,401);
  // Even renaming a copied cookie cannot authenticate against a separate DB.
  assert.equal(await authenticate(make('santofe',sa.setCookie.replace('renace_tv_session','santofe_tv_session')),eb),null);
  assert.equal((await worker.fetch(make('renace',sa.setCookie,'https://santofe.test'),ea)).status,403);
  assert.equal((await worker.fetch(make('renace',sa.setCookie),ea)).status,200);
  assert.equal(b.sqlite.prepare("SELECT duration_seconds FROM media WHERE id='photo'").get().duration_seconds,null);
  assert.equal(sameOrigin(new Request('http://localhost:8791/admin',{headers:{origin:'http://localhost:8792'}}),{TV_ADMIN_LOCAL_HTTP:'true'}),false);
  a.sqlite.close();b.sqlite.close();
});
