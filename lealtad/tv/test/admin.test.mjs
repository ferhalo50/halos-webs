import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../worker/index.js';
import {
  authenticate, checkRateLimit, createSession, hashPassword, normalizeUsername,
  recordLoginFailure, revokeSession, verifyPassword,
} from '../worker/admin-auth.js';
import { safeStorageKey, storageState, validateUploadMetadata, verifyFileSignature } from '../worker/admin-media.js';
import { handlePlaylist, objectResponse, parseRange } from '../worker/media.js';

const origin = 'https://renacecafetv.haloswebs.com';
const legacy = JSON.parse(await readFile(new URL('../public/media.json', import.meta.url)));

class AuthDb {
  constructor() { this.users = new Map(); this.sessions = new Map(); this.rates = new Map(); }
  prepare(sql) {
    const db = this;
    return { bind(...args) { return { first: () => first(sql,args), run: () => run(sql,args) }; } };
    async function first(query,args) {
      if (query.includes('FROM sessions s JOIN admin_users')) {
        const session=db.sessions.get(args[0]),user=session&&db.users.get(session.user_id);
        return session&&!session.revoked_at&&new Date(session.expires_at)>new Date()&&user?.active ? {token_hash:args[0],user_id:user.id,username:user.username,display_name:user.display_name}:null;
      }
      if (query.includes('FROM login_limits')) return db.rates.get(args[0])||null;
      throw new Error(`Consulta first no simulada: ${query}`);
    }
    async function run(query,args) {
      if (query.startsWith('INSERT INTO sessions')) { db.sessions.set(args[0],{token_hash:args[0],user_id:args[1],expires_at:args[2],user_agent:args[3],revoked_at:null}); return {meta:{changes:1}}; }
      if (query.startsWith('UPDATE sessions SET revoked_at') && query.includes('token_hash')) { const row=db.sessions.get(args[0]); if(row)row.revoked_at='now'; return {meta:{changes:row?1:0}}; }
      if (query.startsWith('INSERT INTO login_limits')) { db.rates.set(args[0],{failures:0,window_started_at:args[1],blocked_until:null}); return {meta:{changes:1}}; }
      if (query.startsWith('UPDATE login_limits SET failures')) { const row=db.rates.get(args[2]); row.failures++; if(row.failures>=args[0])row.blocked_until=args[1]; return {meta:{changes:1}}; }
      if (query.startsWith('DELETE FROM login_limits')) { db.rates.delete(args[0]); return {meta:{changes:1}}; }
      throw new Error(`Consulta run no simulada: ${query}`);
    }
  }
}

function assets() {
  return { async fetch(request) {
    const pathname=new URL(request.url).pathname;
    if(pathname==='/media.json') return Response.json(legacy);
    if(pathname==='/') return new Response('TV actual',{headers:{'content-type':'text/html'}});
    return new Response('Missing',{status:404});
  }};
}

test('hash de contraseña, sesión HttpOnly y revocación independiente', async () => {
  const encoded=await hashPassword('Una-contraseña-segura-2026');
  assert.equal(await verifyPassword('Una-contraseña-segura-2026',encoded),true);
  assert.equal(await verifyPassword('incorrecta',encoded),false);
  assert.equal(normalizeUsername('  Admin.Renace '),'admin.renace');
  assert.equal(normalizeUsername('usuario con espacios'),null);
  const db=new AuthDb();db.users.set('u1',{id:'u1',username:'admin',display_name:'Renace',active:1});
  const env={TV_DB:db};
  const req=new Request(`${origin}/admin/api/login`,{headers:{'user-agent':'test'}});
  const session=await createSession(req,env,'u1');
  assert.match(session.setCookie,/HttpOnly/);assert.match(session.setCookie,/SameSite=Strict/);assert.match(session.setCookie,/; Secure/);
  const cookie=session.setCookie.split(';')[0];
  const auth=await authenticate(new Request(`${origin}/admin/api/session`,{headers:{cookie}}),env);
  assert.equal(auth.user_id,'u1');
  await revokeSession(env,auth.tokenHash);
  assert.equal(await authenticate(new Request(`${origin}/admin/api/session`,{headers:{cookie}}),env),null);
});

test('rate limit bloquea después de cinco fallos durante quince minutos', async () => {
  const db=new AuthDb(),env={TV_DB:db},request=new Request(`${origin}/admin/api/login`,{headers:{'cf-connecting-ip':'203.0.113.7'}});
  let rate=await checkRateLimit(request,env,'admin');
  for(let index=0;index<5;index++) await recordLoginFailure(env,rate.key);
  rate=await checkRateLimit(request,env,'admin');
  assert.equal(rate.allowed,false);assert.ok(rate.retryAfter>0&&rate.retryAfter<=900);
});

test('validación backend cubre formatos, firmas, tamaño, cuota y claves seguras', async () => {
  const storage=storageState(100,1000);
  for(const [name,type,bytes] of [
    ['foto.jpg','image/jpeg',[0xff,0xd8,0xff]], ['foto.png','image/png',[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]],
    ['foto.webp','image/webp',[82,73,70,70,0,0,0,0,87,69,66,80]], ['promo.mp4','video/mp4',[0,0,0,20,102,116,121,112]],
  ]) {
    const file={name,type,size:bytes.length,slice(){return new Blob([Uint8Array.from(bytes)]);}};
    const checked=validateUploadMetadata(file,storage,100);
    assert.equal(checked.valid,true,name);assert.equal(await verifyFileSignature(file,checked),true,name);
  }
  assert.equal(validateUploadMetadata({name:'mal.exe',type:'image/png',size:10},storage,100).status,415);
  assert.equal(validateUploadMetadata({name:'foto.png',type:'image/png',size:101},storage,100).status,413);
  assert.equal(validateUploadMetadata({name:'foto.png',type:'image/png',size:901},storage,1000).status,413);
  assert.equal(safeStorageKey('12345678-1234-1234-1234-123456789abc','.png'),'library/12/12345678-1234-1234-1234-123456789abc.png');
  assert.throws(()=>safeStorageKey('../escape','.png'));
});

test('Range devuelve 206, Content-Range y nunca carga el objeto completo', async () => {
  assert.deepEqual(parseRange('bytes=10-19',100),{offset:10,length:10,start:10,end:19});
  assert.deepEqual(parseRange('bytes=-8',100),{offset:92,length:8,start:92,end:99});
  assert.equal(parseRange('bytes=100-101',100).invalid,true);
  let options;
  const env={MEDIA_BUCKET:{async get(key,value){options=value;return {body:new Uint8Array(value.range.length),httpEtag:'"etag"',writeHttpMetadata(headers){headers.set('content-type','video/mp4');}};}}};
  const row={id:'id',storage_key:'safe/video.mp4',mime_type:'video/mp4',size_bytes:100,active:1,deleting:0};
  const response=await objectResponse(new Request(`${origin}/media/item/id`,{headers:{range:'bytes=10-19'}}),env,row);
  assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 10-19/100');assert.equal(response.headers.get('content-length'),'10');assert.deepEqual(options,{range:{offset:10,length:10}});
});

test('playlist R2 solo contiene activos ordenados y falla de forma segura al sistema anterior', async () => {
  const db={prepare(){return {async all(){return {results:[{id:'b',display_name:'Segundo',media_type:'video'},{id:'a',display_name:'Primero',media_type:'image'}]};}};}};
  const env={R2_MEDIA_ENABLED:'true',TV_DB:db,MEDIA_BUCKET:{},ASSETS:assets()};
  const response=await handlePlaylist(new Request(`${origin}/playlist.json`),env);
  const playlist=await response.json();assert.equal(response.headers.get('x-renace-playlist-source'),'r2');assert.deepEqual(playlist.items.map(item=>item.id),['b','a']);
  const fallback=await handlePlaylist(new Request(`${origin}/playlist.json`),{...env,TV_DB:{prepare(){throw new Error('D1 caída');}}});
  assert.equal(fallback.headers.get('x-renace-playlist-source'),'fallback');assert.deepEqual((await fallback.json()).items,legacy.items);
});

test('flags apagados preservan la TV y bloquean admin y R2', async () => {
  const env={ASSETS:assets(),TV_ADMIN_ENABLED:'false',R2_MEDIA_ENABLED:'false'};
  assert.equal(await (await worker.fetch(new Request(`${origin}/`),env)).text(),'TV actual');
  assert.equal((await worker.fetch(new Request(`${origin}/admin`),env)).status,404);
  const playlist=await worker.fetch(new Request(`${origin}/playlist.json`),env);
  assert.equal(playlist.headers.get('x-renace-playlist-source'),'fallback');assert.equal((await playlist.json()).items.length,legacy.items.length);
  assert.equal((await worker.fetch(new Request(`${origin}/media/item/12345678-1234-1234-1234-123456789abc`),env)).status,404);
});
