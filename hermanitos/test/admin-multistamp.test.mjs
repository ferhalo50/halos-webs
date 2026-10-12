import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {hashPassword} from '../worker/index.js';
let mf,db,secret,adminCookie,serial=0;
const base='https://hermanitos.test',password='Local-fictitious-only-4826!';
async function request(path,{cookie=adminCookie,data,method=data===undefined?'GET':'POST'}={}){
 const res=await mf.dispatchFetch(base+'/api'+path,{method,headers:{origin:base,'content-type':'application/json',...(cookie?{cookie}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
 return{status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
async function person(){const id='local-'+(++serial),qr=crypto.randomUUID().replaceAll('-','').padEnd(43,'a');await db.prepare('INSERT INTO users(id,name,username,role,password_hash,password_salt,qr_token,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,'Ejemplo '+serial,id,'member',secret.hash,secret.salt,qr,new Date().toISOString()).run();const login=await request('/login',{data:{name:id,password}});assert.equal(login.status,200);return{id,qr,cookie:login.cookie};}
async function add(p,quantity,extra={},cookie=adminCookie){const preview=await request('/admin/users/'+p.id+'/stamps/preview?quantity=1');const payload={quantity,reason:'Corrección administrativa local',request_id:crypto.randomUUID(),confirm:true,expectedStamps:preview.body.preview?.expectedStamps,expectedSpent:preview.body.preview?.expectedSpent,...extra};const result=await request('/admin/users/'+p.id+'/stamps',{cookie,data:payload});return{...result,payload};}
before(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../worker/index.js',import.meta.url)),compatibilityDate:'2026-09-14',d1Databases:{DB:'admin-tests'},bindings:{APP_TIMEZONE:'America/Tijuana'}}));db=await mf.getD1Database('DB');
 for(const name of ['0001_initial.sql','0002_admin_multistamp.sql']){const source=(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8')).replace(/^--.*$/gm,'');for(const sql of source.split(/;\s*(?=CREATE (?:TABLE|INDEX|UNIQUE|TRIGGER)|DROP TRIGGER|ALTER TABLE|PRAGMA|$)/).map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();}
 secret=await hashPassword(password);await db.prepare("INSERT INTO users(id,name,username,role,password_hash,password_salt,qr_token,created_at) VALUES('admin','Admin ficticio','admin','admin',?,?,?,'2026-01-01T00:00:00Z')").bind(secret.hash,secret.salt,'z'.repeat(43)).run();adminCookie=(await request('/login',{data:{name:'admin',password}})).cookie;
});
after(async()=>{await mf?.dispose();});
test('one +1/+2/+5 row per operation; reason, actor, quantity and monthly history are audited',async()=>{
 const p=await person();for(const quantity of [1,2,5]){const result=await add(p,quantity,{reason:'  Corrección válida  '});assert.equal(result.status,201);const row=await db.prepare('SELECT * FROM stamps WHERE id=?').bind(result.payload.request_id).first();assert.equal(row.quantity,quantity);assert.equal(row.admin_id,'admin');assert.equal(row.reason,'Corrección válida');const audit=await db.prepare("SELECT * FROM audit WHERE action='admin-stamps-added' AND entity_id=?").bind(row.id).first();assert.equal(audit.actor_id,'admin');assert.equal(JSON.parse(audit.details).quantity,quantity);}
 const dashboard=(await request('/me',{cookie:p.cookie})).body;assert.equal(dashboard.stats.stamps,8);assert.equal(dashboard.stats.progress,8);assert.equal(dashboard.stats.credits,0);assert.equal(dashboard.stats.cooldown_until,60000);
 const history=(await request('/history',{cookie:p.cookie})).body;assert.equal(history.summary.stamps,8);assert.equal(history.stamps.length,3);
});
test('multi-goal adjustment keeps surplus, grants credits and does not auto-complete favors',async()=>{
 const p=await person(),other=await person();assert.equal((await add(p,8)).status,201);assert.equal((await add(p,25)).status,201);
 let stats=(await request('/me',{cookie:p.cookie})).body.stats;assert.equal(stats.stamps,33);assert.equal(stats.progress,3);assert.equal(stats.credits,3);assert.equal(stats.owed,0);
 for(let i=0;i<3;i++)assert.equal((await request('/favors',{cookie:p.cookie,data:{debtor_id:other.id,request_id:crypto.randomUUID()}})).status,201);
 assert.equal((await request('/favors',{cookie:p.cookie,data:{debtor_id:other.id,request_id:crypto.randomUUID()}})).status,409);
 stats=(await request('/me',{cookie:p.cookie})).body.stats;assert.equal(stats.stamps,33);assert.equal(stats.credits,0);
});
test('strict quantity/reason bounds, confirmation, unavailable member and backend permission checks',async()=>{
 const p=await person();for(const quantity of [0,-1,1.1,'5','bad',null,100,1e15])assert.equal((await add(p,quantity)).status,400);
 for(const reason of ['', '     ','abcd','x'.repeat(201),{}])assert.equal((await add(p,2,{reason})).status,400);
 assert.equal((await add(p,2,{confirm:false})).status,400);assert.equal((await add(p,2,{},p.cookie)).status,403);assert.equal((await add(p,2,{},null)).status,401);
 assert.equal((await request('/admin/users/missing/stamps',{data:{quantity:1}})).status,404);assert.equal((await request('/admin/users/admin/stamps',{data:{quantity:1}})).status,404);
 await db.prepare('UPDATE users SET active=0 WHERE id=?').bind(p.id).run();assert.equal((await add(p,2)).status,404);
});
test('99 is accepted, duplicate operation cannot be replayed and manual entries cannot be rewritten',async()=>{
 const p=await person(),result=await add(p,99);assert.equal(result.status,201);assert.equal((await add(p,99,result.payload)).status,409);
 assert.equal((await request('/admin/stamps/'+result.payload.request_id,{method:'PATCH',data:{target_id:p.id,created_at:new Date().toISOString()}})).status,409);
 assert.equal((await request('/admin/stamps/'+result.payload.request_id,{method:'DELETE'})).status,200);assert.equal((await request('/me',{cookie:p.cookie})).body.stats.stamps,0);
});
test('concurrent admins/snapshots apply exactly one complete operation',async()=>{
 const p=await person(),results=await Promise.all([add(p,2,{expectedStamps:0,expectedSpent:0}),add(p,5,{expectedStamps:0,expectedSpent:0})]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 const applied=results.find(r=>r.status===201);assert.equal((await request('/me',{cookie:p.cookie})).body.stats.stamps,applied.payload.quantity);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM stamps WHERE scanner_id=?').bind(p.id).first()).n,1);
});
test('failed audit aborts stamps and notification together',async()=>{
 const p=await person();await db.prepare("CREATE TRIGGER fail_test_audit BEFORE INSERT ON audit WHEN NEW.action='admin-stamps-added' AND json_extract(NEW.details,'$.user_id')='"+p.id+"' BEGIN SELECT RAISE(ABORT,'simulated audit failure'); END").run();assert.equal((await add(p,5)).status,500);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM stamps WHERE scanner_id=?').bind(p.id).first()).n,0);assert.equal((await db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=?').bind(p.id).first()).n,0);
});
test('normal minute cooldown is unchanged; admin addition never consumes the scanning window',async()=>{
 const p=await person(),other=await person();assert.equal((await add(p,2)).status,201);
 const scan=()=>request('/scan',{cookie:p.cookie,data:{qr:'hermanitos:v1:'+other.qr,request_id:crypto.randomUUID(),quantity:99,admin_id:'admin'}});
 assert.equal((await scan()).status,201);assert.equal((await scan()).status,429);assert.equal((await add(p,2)).status,201);assert.equal((await scan()).status,429);assert.equal((await request('/me',{cookie:p.cookie})).body.stats.stamps,5);
});
test('forward migration preserves populated history, foreign keys and unit quantities',async()=>{
 const local=new DatabaseSync(':memory:');try{local.exec(await readFile(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));for(const [id,role] of [['x','member'],['y','member'],['z','admin']])local.prepare('INSERT INTO users(id,name,username,role,password_hash,password_salt,qr_token,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,id,id,role,'fictitious-hash','fictitious-salt',id.repeat(43),'2026-01-01');local.exec("INSERT INTO stamps(id,scanner_id,target_id,created_at) VALUES('historical','x','y','2026-01-01');");const before=local.prepare('SELECT * FROM stamps').get();local.exec(await readFile(new URL('../migrations/0002_admin_multistamp.sql',import.meta.url),'utf8'));const after=local.prepare('SELECT * FROM stamps').get();for(const [key,value] of Object.entries(before))assert.equal(after[key],value);assert.equal(after.quantity,1);assert.deepEqual(local.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(local.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{local.close();}
});
