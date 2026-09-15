import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { hashPassword, monthKey, monthStart } from '../worker/index.js';
let mf, db;
const sessions = {};
const base = 'https://hermanitos.test';
async function request(path, { as, data, method, origin = base } = {}) {
  const headers = {};
  if(as)headers.cookie=sessions[as];
  if(data !== undefined)headers['content-type']='application/json';
  if(origin)headers.origin=origin;
  const res=await mf.dispatchFetch(`${base}/hermanitos/api${path}`,{method:method||(data!==undefined?'POST':'GET'),headers,body:data!==undefined?JSON.stringify(data):undefined});
  const payload=await res.json();return {status:res.status,body:payload,cookie:res.headers.get('set-cookie')};
}
async function scan(as,target,id=crypto.randomUUID()) { return request('/scan',{as,data:{qr:`hermanitos:v1:${target.repeat(43)}`,request_id:id}}); }
async function unlock(id){await db.prepare('UPDATE users SET last_scan_ms=0 WHERE id=?').bind(id).run();}
async function earn(as,target,count){for(let i=0;i<count;i++){await unlock(as);assert.equal((await scan(as,target)).status,201);}}
before(async()=>{
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:fileURLToPath(new URL('../worker/index.js',import.meta.url)),compatibilityDate:'2026-09-14',d1Databases:{DB:'tests'},bindings:{APP_TIMEZONE:'America/Tijuana'}}));
  db=await mf.getD1Database('DB');
  const schema=await readFile(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
  // D1 exec splits on newlines; keep complete trigger definitions on one line.
  const statements=schema.replace(/^--.*$/gm,'').split(/;\s*(?=CREATE (?:TABLE|INDEX|UNIQUE|TRIGGER)|PRAGMA|$)/).map(s=>s.trim()).filter(Boolean);
  for(const sql of statements)await db.prepare(sql).run();
  for(const [id,name,role] of [['a','Ana','member'],['b','Beto','member'],['c','Caro','member'],['z','admin','admin']]){
    const secret=await hashPassword('test-only-secret');
    await db.prepare('INSERT INTO users(id,name,username,role,password_hash,password_salt,qr_token,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,name,name.toLowerCase(),role,secret.hash,secret.salt,id.repeat(43),'2026-01-01T00:00:00.000Z').run();
    const login=await request('/login',{data:{name,password:'test-only-secret'}});assert.equal(login.status,200);sessions[id]=login.cookie.split(';')[0];
  }
});
after(async()=>{await mf?.dispose();});
test('local month boundaries include DST and rollover',()=>{
  assert.equal(monthStart('2026-11'),'2026-11-01T07:00:00.000Z');
  assert.equal(monthStart('2026-12'),'2026-12-01T08:00:00.000Z');
  assert.equal(monthKey(new Date('2026-10-01T06:59:59Z')),'2026-09');
  assert.equal(monthKey(new Date('2026-10-01T07:00:00Z')),'2026-10');
});
test('authentication, cookie isolation, CSRF and roles',async()=>{
  assert.equal((await request('/me')).status,401);
  assert.equal((await request('/admin',{as:'a'})).status,403);
  assert.equal((await request('/scan',{as:'z',data:{}})).status,403);
  assert.equal((await request('/logout',{as:'a',data:{},origin:'https://evil.test'})).status,403);
  const login=await request('/login',{data:{name:'ANA',password:'test-only-secret'}});
  assert.match(login.cookie,/HttpOnly; Secure; SameSite=Strict/);assert.match(login.cookie,/Path=\/hermanitos/);
  assert.equal((await request('/me',{as:'a'})).body.user.name,'Ana');
});
test('self scan and unrelated QR rejected; scanner alone receives stamp; target notified',async()=>{
  assert.equal((await scan('a','a')).body.code,'self_scan');
  assert.equal((await request('/scan',{as:'a',data:{qr:'renace:abc',request_id:crypto.randomUUID()}})).body.code,'invalid_qr');
  const id=crypto.randomUUID();assert.equal((await scan('a','b',id)).status,201);
  assert.equal((await scan('a','b',id)).body.duplicate,true);
  const a=(await request('/me',{as:'a'})).body,b=(await request('/me',{as:'b'})).body;
  assert.equal(a.stats.stamps,1);assert.equal(b.stats.stamps,0);assert.equal(b.notifications[0].kind,'stamp');assert.equal(b.notifications[0].actor_name,'Ana');
  assert.equal((await scan('a','c')).status,429);
});
test('concurrent scans and exact cooldown boundary are protected in database',async()=>{
  await unlock('a');const results=await Promise.all([scan('a','b'),scan('a','c'),scan('a','b')]);
  assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===429).length,2);
  await db.prepare('UPDATE users SET last_scan_ms=? WHERE id=?').bind(Date.now()-59000,'a').run();assert.equal((await scan('a','b')).status,429);
  await db.prepare('UPDATE users SET last_scan_ms=? WHERE id=?').bind(Date.now()-60100,'a').run();assert.equal((await scan('a','b')).status,201);
});
test('ten stamps earn a credit; simultaneous redemption cannot double spend',async()=>{
  await earn('a','b',7);
  assert.equal((await request('/me',{as:'a'})).body.stats.credits,1);
  const results=await Promise.all(['b','c'].map(debtor_id=>request('/favors',{as:'a',data:{debtor_id,request_id:crypto.randomUUID()}})));
  assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.body.code==='no_credit').length,1);
  assert.equal((await request('/me',{as:'a'})).body.stats.credits,0);
});
test('only creditor confirms and repeated completion cannot count twice',async()=>{
  const f=await db.prepare("SELECT * FROM favors WHERE status='pending'").first();
  assert.equal((await request(`/favors/${f.id}/complete`,{as:f.debtor_id,data:{}})).status,404);
  const results=await Promise.all([request(`/favors/${f.id}/complete`,{as:'a',data:{}}),request(`/favors/${f.id}/complete`,{as:'a',data:{}})]);
  assert.equal(results.filter(r=>r.status===200).length,1);
  const debtor=(await request('/me',{as:f.debtor_id})).body;
  assert.equal(debtor.stats.owed,0);assert.equal(debtor.stats.completed,1);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit WHERE action='favor-completed' AND entity_id=?").bind(f.id).first()).n,1);
});
test('admin clear completed resets only the meter and preserves monthly history',async()=>{
  const f=await db.prepare("SELECT * FROM favors WHERE status='completed'").first();
  assert.equal((await request(`/admin/users/${f.debtor_id}/clear-completed`,{as:'a',data:{confirm:true}})).status,403);
  assert.equal((await request(`/admin/users/${f.debtor_id}/clear-completed`,{as:'z',data:{confirm:true}})).status,200);
  assert.equal((await request('/me',{as:f.debtor_id})).body.stats.completed,0);
  assert.equal((await request('/history',{as:f.debtor_id})).body.summary.completed,1);
});
test('pending favor survives month boundary; historical closing debt is preserved',async()=>{
  await earn('a','b',20);
  for(let i=0;i<2;i++)assert.equal((await request('/favors',{as:'a',data:{debtor_id:'b',request_id:crypto.randomUUID()}})).status,201);
  const current=monthKey(), start=monthStart(current), past=new Date(Date.parse(start)-1000).toISOString();
  const previous=monthKey(new Date(past));
  await db.prepare("UPDATE favors SET created_at=? WHERE status='pending'").bind(past).run();
  await db.prepare("UPDATE favor_events SET created_at=?,recorded_at=? WHERE favor_id IN (SELECT id FROM favors WHERE status='pending')").bind(past,past).run();
  assert.equal((await request('/me',{as:'b'})).body.stats.owed,2);
  assert.equal((await request(`/history?month=${previous}`,{as:'b'})).body.summary.pending_at_end,2);
  assert.equal((await request('/admin/users/b/clear-pending',{as:'z',data:{confirm:true}})).status,200);
  assert.equal((await request('/me',{as:'b'})).body.stats.owed,0);
  assert.equal((await request(`/history?month=${previous}`,{as:'b'})).body.summary.pending_at_end,2);
  assert.equal((await request('/me',{as:'a'})).body.stats.credits,0);
});
test('admin editing, cancellation, deleted accounts and audit trail',async()=>{
  const stamp=await db.prepare('SELECT * FROM stamps LIMIT 1').first();
  assert.equal((await request(`/admin/stamps/${stamp.id}`,{as:'z',method:'PATCH',data:{target_id:'c',created_at:stamp.created_at}})).status,200);
  assert.equal((await request(`/admin/stamps/${stamp.id}`,{as:'z',method:'DELETE'})).status,200);
  const favor=await db.prepare("SELECT * FROM favors WHERE status='cleared' LIMIT 1").first();
  assert.equal((await request(`/admin/favors/${favor.id}`,{as:'z',method:'DELETE'})).status,200);
  assert.equal((await request('/admin/users/c',{as:'z',method:'PATCH',data:{name:'Carolina',phone:'6641234567',active:true}})).status,200);
  assert.equal((await request('/me',{as:'c'})).status,401);
  assert.equal((await request('/admin/users/c',{as:'z',method:'DELETE'})).status,200);
  assert.equal((await request('/login',{data:{name:'Carolina',password:'test-only-secret'}})).status,401);
  const logs=(await request('/admin',{as:'z'})).body.audit;
  assert.ok(logs.some(l=>l.action==='clear-pending'));assert.ok(logs.some(l=>l.action==='delete-user'));
});
test('signup is member only; normalized duplicate and login throttling',async()=>{
  assert.equal((await request('/signup',{data:{name:'Dani',phone:'6641234567',password:'testing123',role:'admin'}})).status,201);
  assert.equal((await db.prepare("SELECT role FROM users WHERE username='dani'").first()).role,'member');
  assert.equal((await request('/signup',{data:{name:'DÁNI',phone:'6641234567',password:'testing123'}})).status,409);
  for(let i=0;i<5;i++)assert.equal((await request('/login',{data:{name:'NoExiste',password:'incorrecta'}})).status,401);
  assert.equal((await request('/login',{data:{name:'NoExiste',password:'incorrecta'}})).status,429);
});
