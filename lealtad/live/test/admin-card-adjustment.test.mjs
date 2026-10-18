import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.js';
import {schema,fixture,invoke,env,action,slugs} from './reward-choice-fixture.mjs';
const raw=(db,f)=>db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(f.card.id);
const snapshot=c=>({expectedStamps:c.stamps,expectedVersion:c.reward_version,expectedUpdatedAt:c.updated_at});
async function adjust(db,f,type,quantity,extra={},cookie=f.admin.cookie){
 const payload={action:type,quantity,reason:'Corrección administrativa ficticia',operationId:crypto.randomUUID(),...snapshot(raw(db,f)),...extra};
 const result=await invoke(db,f.slug,'/api/admin/customers/'+f.customer.data.user.id+'/stamps',{cookie,body:payload});
 return {...result,payload};
}
for(const slug of slugs)test(slug+': multi-removal/clear audited once, no purchase/history/reward loss',async()=>{
 const db=schema();try{
  const f=await fixture(db,slug);
  for(const quantity of [1,2,5]){
   db.prepare('UPDATE loyalty_cards SET stamps=7 WHERE id=?').run(f.card.id);
   const r=await adjust(db,f,'remove',quantity);assert.equal(r.status,200);assert.equal(r.data.card.stamps,7-quantity);
   const audit=db.prepare('SELECT * FROM admin_audit_log WHERE id=?').get(r.payload.operationId),m=JSON.parse(audit.metadata);
   assert.equal(audit.admin_id,f.admin.data.user.id);assert.equal(audit.business_id,'business_'+slug);assert.equal(m.quantity,quantity);assert.equal(m.progress_before,7);assert.equal(m.progress_after,7-quantity);assert.equal(m.reason,r.payload.reason);
  }
  db.prepare('UPDATE loyalty_cards SET stamps=6 WHERE id=?').run(f.card.id);
  assert.equal((await adjust(db,f,'clear',6)).data.card.stamps,0);
  assert.equal(db.prepare('SELECT count(*) n FROM loyalty_events WHERE card_id=?').get(f.card.id).n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM admin_audit_log WHERE target_user_id=?').get(f.customer.data.user.id).n,4);
  const dash=(await invoke(db,slug,'/api/admin/dashboard?eventType=progress_cleared',{cookie:f.admin.cookie})).data;
  assert.equal(dash.events.length,1);assert.equal(dash.events[0].quantity,6);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});

test('daily completed rewards protected; removal does not cancel today; ABA versions and normal redemption',async()=>{
 for(const slug of slugs.filter(s=>s!=='santofe')){const db=schema();try{
  const f=await fixture(db,slug);assert.equal((await action(db,f,'stamp')).status,200);
  const old=raw(db,f);assert.equal((await adjust(db,f,'remove',1)).status,200);
  assert.equal((await action(db,f,'stamp')).status,409,'ordinary daily purchase still limited');
  assert.equal((await adjust(db,f,'add',1)).status,200);
  assert.equal(raw(db,f).stamps,old.stamps);assert.equal(raw(db,f).reward_version,old.reward_version+2);
  assert.equal((await adjust(db,f,'add',1,snapshot(old))).status,409,'ABA rejects old admin snapshot');
  assert.equal((await action(db,f,'redeem',{}, {...f.card,stamps:f.card.goal})).status,409);
  db.prepare('UPDATE loyalty_cards SET stamps=? WHERE id=?').run(f.card.goal,f.card.id);
  const full=raw(db,f);for(const [type,quantity] of [['add',1],['remove',1],['clear',f.card.goal]])assert.notEqual((await adjust(db,f,type,quantity)).status,200);
  assert.deepEqual(raw(db,f),full);
  f.card=(await invoke(db,slug,'/api/card',{cookie:f.customer.cookie})).data.card;
  assert.equal((await action(db,f,'redeem')).status,200);assert.equal(f.card.stamps,0);assert.equal(f.card.redeemed,1);
 }finally{db.close();}}
});

test('Santofé saved rewards +1/+5/-1/-2/clear preserve choices, progress and historical redemptions',async()=>{
 const db=schema();try{const f=await fixture(db,'santofe');db.prepare('UPDATE loyalty_cards SET stamps=3,rewards_pending=2,reward_choices_pending=2,redeemed_count=4 WHERE id=?').run(f.card.id);
  for(const [type,q,balance] of [['reward_add',1,3],['reward_add',5,8],['reward_remove',1,7],['reward_remove',2,5],['reward_clear',5,0]]){
   const before=raw(db,f),r=await adjust(db,f,type,q);assert.equal(r.status,200);const c=raw(db,f);
   assert.equal(c.rewards_pending,balance);assert.equal(c.reward_choices_pending,2);assert.equal(c.stamps,3);assert.equal(c.redeemed_count,4);assert.equal(c.reward_version,before.reward_version+1);
   assert.equal((await adjust(db,f,type,q,r.payload)).status,409,'same key/snapshot cannot repeat');
  }
  assert.equal((await adjust(db,f,'reward_remove',1)).status,400);
  assert.equal((await adjust(db,f,'remove',2)).status,200);assert.equal(raw(db,f).reward_choices_pending,2);
  f.card=(await invoke(db,f.slug,'/api/card',{cookie:f.customer.cookie})).data.card;
  assert.equal((await action(db,f,'reward-choice',{decision:'save'})).status,200);assert.equal(f.card.rewardsPending,1);assert.equal(f.card.rewardChoicesPending,1);
  assert.equal(db.prepare('SELECT count(*) n FROM loyalty_events WHERE card_id=?').get(f.card.id).n,0);
 }finally{db.close();}
});

test('invalid actions, strict quantities/reasons, roles and cross-tenant targets denied without mutation',async()=>{
 const db=schema();try{const f=await fixture(db,'santofe'),other=await fixture(db,'renace');db.prepare('UPDATE loyalty_cards SET stamps=7,rewards_pending=8 WHERE id=?').run(f.card.id);const before=raw(db,f);
  for(const type of ['remove','clear','reward_add','reward_remove','reward_clear']){
   for(const n of [0,-1,1.5,null,'2','bad',100,Number.MAX_SAFE_INTEGER])assert.notEqual((await adjust(db,f,type,n)).status,200);
   for(const reason of ['', '    ', 'abcd', 'x'.repeat(201), {}])assert.equal((await adjust(db,f,type,type==='clear'?7:type==='reward_clear'?8:1,{reason})).status,400);
   for(const cookie of [f.staff.cookie,f.customer.cookie,other.admin.cookie,null])assert.notEqual((await adjust(db,f,type,1,{},cookie)).status,200);
  }
  for(const type of ['unknown',null,5,{},''])assert.equal((await adjust(db,f,type,1)).status,400);assert.equal((await adjust(db,f,'remove',8)).status,400);
  assert.equal((await adjust(db,f,'reward_remove',9)).status,400);
  assert.equal((await invoke(db,f.slug,'/api/admin/customers/missing/stamps',{cookie:f.admin.cookie,body:{action:'remove',quantity:1}})).status,404);
  assert.equal((await invoke(db,f.slug,'/api/admin/customers/'+other.customer.data.user.id+'/stamps',{cookie:f.admin.cookie,body:{action:'remove',quantity:1}})).status,404);
  for(const type of ['reward_add','reward_remove','reward_clear'])assert.equal((await adjust(db,other,type,1)).status,403);
  assert.deepEqual(raw(db,f),before);
  db.prepare('UPDATE users SET must_change_secret=1 WHERE id=?').run(f.admin.data.user.id);assert.equal((await adjust(db,f,'reward_add',1)).status,403);
 }finally{db.close();}
});

test('same snapshot concurrent adjustments, counter conflicts and idempotency including lost response',async()=>{
 const db=schema();try{const f=await fixture(db,'santofe');db.prepare('UPDATE loyalty_cards SET stamps=7,rewards_pending=5 WHERE id=?').run(f.card.id);const snap=snapshot(raw(db,f));
  const results=await Promise.all([adjust(db,f,'reward_add',3,snap),adjust(db,f,'reward_remove',2,snap)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const done=results.find(r=>r.status===200),after=raw(db,f);
  assert.equal((await adjust(db,f,done.payload.action,done.payload.quantity,{...done.payload,...snapshot(after)})).status,409,'idempotency key blocks replay even with fresh snapshot');assert.deepEqual(raw(db,f),after);
  assert.equal((await action(db,f,'stamp',{quantity:2})).status,409,'counter stale version denied');
 }finally{db.close();}
});

test('daily counter/admin race and old operation key never duplicate a completed reward',async()=>{
 const db=schema();try{const f=await fixture(db,'renace');db.prepare('UPDATE loyalty_cards SET stamps=8 WHERE id=?').run(f.card.id);
  f.card=(await invoke(db,f.slug,'/api/card',{cookie:f.customer.cookie})).data.card;
  const results=await Promise.all([adjust(db,f,'add',1),action(db,f,'stamp')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(raw(db,f).stamps,9);
  f.card=(await invoke(db,f.slug,'/api/card',{cookie:f.customer.cookie})).data.card;const key=crypto.randomUUID();assert.equal((await action(db,f,'redeem',{operationId:key})).status,200);
  await adjust(db,f,'add',9);f.card=(await invoke(db,f.slug,'/api/card',{cookie:f.customer.cookie})).data.card;
  assert.equal((await action(db,f,'redeem',{operationId:key})).status,409);assert.equal(raw(db,f).stamps,9);assert.equal(raw(db,f).redeemed_count,1);
 }finally{db.close();}
});

test('audit or daily event failure rolls back state and version together',async()=>{
 const db=schema();try{const f=await fixture(db,'renace');db.prepare('UPDATE loyalty_cards SET stamps=5 WHERE id=?').run(f.card.id);const before=raw(db,f);
  db.exec("CREATE TRIGGER fail_adjust BEFORE INSERT ON admin_audit_log BEGIN SELECT RAISE(ABORT,'local forced audit failure'); END;");
  assert.equal((await adjust(db,f,'remove',2)).status,500);assert.deepEqual(raw(db,f),before);
  db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON loyalty_events BEGIN SELECT RAISE(ABORT,'local forced event failure'); END;");
  f.card=(await invoke(db,f.slug,'/api/card',{cookie:f.customer.cookie})).data.card;
  assert.equal((await action(db,f,'stamp')).status,500);assert.deepEqual(raw(db,f),before);
  db.prepare('UPDATE loyalty_cards SET stamps=9 WHERE id=?').run(f.card.id);const full=raw(db,f);
  f.card=(await invoke(db,f.slug,'/api/card',{cookie:f.customer.cookie})).data.card;
  assert.equal((await action(db,f,'redeem')).status,500);assert.deepEqual(raw(db,f),full);
 }finally{db.close();}
});

test('0015 no historical rewrite; no heartbeat/loop; exact daily/per-item version increments and ABA',async()=>{
 const db=schema('0015');try{const fixtures=[];for(const slug of slugs)fixtures.push(await fixture(db,slug));
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const dump=()=>JSON.stringify(tables.map(({name})=>[name,db.prepare('SELECT * FROM '+name).all()]));const before=dump();
  db.exec(readFileSync(new URL('../migrations/0015_daily_card_version.sql',import.meta.url),'utf8'));assert.equal(dump(),before);
  db.exec('PRAGMA recursive_triggers=ON');
  for(const f of fixtures){const original=raw(db,f).reward_version;
   db.prepare('UPDATE loyalty_cards SET updated_at=updated_at,stamps=stamps WHERE id=?').run(f.card.id);assert.equal(raw(db,f).reward_version,original);
   db.prepare('UPDATE loyalty_cards SET stamps=stamps+1 WHERE id=?').run(f.card.id);assert.equal(raw(db,f).reward_version,original+1);
   db.prepare('UPDATE loyalty_cards SET stamps=stamps-1 WHERE id=?').run(f.card.id);assert.equal(raw(db,f).reward_version,original+2);
  }
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close();}
});

test('conditional sync authenticates every read, no D1 writes, notices all changes and scopes ETags',async()=>{
 const db=schema();try{const f=await fixture(db,'renace'),other=await fixture(db,'mooncoffee');
  db.exec("UPDATE sessions SET last_seen_at='2000-01-01 00:00:00'");const before=db.prepare('SELECT * FROM sessions').all();let reads=0,writes=0;
  const environment=env(db,f.slug),prepare=environment.DB.prepare.bind(environment.DB);environment.DB.prepare=sql=>{if(/^\s*SELECT/i.test(sql))reads++;else writes++;return prepare(sql);};
  const get=(path,cookie,etag)=>worker.fetch(new Request('http://127.0.0.1'+path,{headers:{...(cookie?{cookie}:{}),...(etag?{'if-none-match':etag}:{})}}),environment);
  const r=await get('/api/card',f.customer.cookie),etag=r.headers.get('etag');assert.equal(r.status,200);assert.ok(etag);assert.equal(reads,2);
  assert.equal((await get('/api/card',f.customer.cookie,etag)).status,304);assert.equal(reads,4);assert.equal(writes,0);assert.deepEqual(db.prepare('SELECT * FROM sessions').all(),before);
  assert.equal((await get('/api/card',null,etag)).status,401);assert.equal((await get('/api/card',other.customer.cookie,etag)).status,401);
  db.prepare('UPDATE loyalty_cards SET stamps=1 WHERE id=?').run(f.card.id);assert.equal((await get('/api/card',f.customer.cookie,etag)).status,200);
  const next=await get('/api/card',f.customer.cookie);db.prepare("UPDATE users SET name='Cliente actualizado' WHERE id=?").run(f.customer.data.user.id);assert.equal((await get('/api/card',f.customer.cookie,next.headers.get('etag'))).status,200);
  const staffPath='/api/staff/card?value='+f.card.id;const sr=await get(staffPath,f.staff.cookie);assert.equal(sr.status,200);assert.equal((await get(staffPath,f.staff.cookie,sr.headers.get('etag'))).status,304);
  assert.equal((await get('/api/staff/card?value='+other.card.id,f.staff.cookie,sr.headers.get('etag'))).status,404);
  db.prepare("UPDATE sessions SET expires_at='2000-01-01' WHERE user_id=?").run(f.staff.data.user.id);assert.equal((await get(staffPath,f.staff.cookie,sr.headers.get('etag'))).status,401);
 }finally{db.close();}
});
