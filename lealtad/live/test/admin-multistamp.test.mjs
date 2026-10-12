import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {schema,fixture,env,invoke,action} from './reward-choice-fixture.mjs';
const queues=new WeakMap();
async function add(db,f,quantity,extra={},cookie=f.admin.cookie){
 const card=(await invoke(db,f.slug,'/api/card',{cookie:f.customer.cookie})).data.card;
 const raw=db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(card.id);
 const payload={quantity,reason:'Corrección por compra anterior',expectedStamps:raw.stamps,expectedVersion:raw.reward_version,expectedUpdatedAt:raw.updated_at,operationId:crypto.randomUUID(),...extra};
 const config=env(db,f.slug),batch=config.DB.batch.bind(config.DB);
 config.DB.batch=statements=>{const task=(queues.get(db)||Promise.resolve()).catch(()=>{}).then(()=>batch(statements));queues.set(db,task);return task;};
 const response=await worker.fetch(new Request('http://127.0.0.1/api/admin/customers/'+f.customer.data.user.id+'/stamps',{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(payload)}),config);
 return{status:response.status,data:await response.json(),payload};
}
for(const slug of ['renace','mooncoffee','vainillacoffee'])test(slug+': +1/+2/+5, state-dependent cap, daily limit and redemption remain intact',async()=>{
 const db=schema();try{
  const f=await fixture(db,slug);
  for(const quantity of [1,2,5,f.card.goal]){db.prepare('UPDATE loyalty_cards SET stamps=0 WHERE id=?').run(f.card.id);const result=await add(db,f,quantity);assert.equal(result.status,200);assert.equal(result.data.card.stamps,quantity);assert.equal(result.data.card.canStampToday,true);}
  const goal=f.card.goal;db.prepare('UPDATE loyalty_cards SET stamps=? WHERE id=?').run(goal-2,f.card.id);
  assert.equal((await add(db,f,3)).status,400);assert.equal((await add(db,f,2)).data.card.stamps,goal);assert.equal((await add(db,f,1)).status,400);
  f.card=(await invoke(db,slug,'/api/card',{cookie:f.customer.cookie})).data.card;
  assert.equal((await action(db,f,'redeem')).data.card.stamps,0);
  assert.equal((await add(db,f,2)).status,200);assert.equal((await action(db,f,'stamp')).status,200);assert.equal((await action(db,f,'stamp')).status,409);
  assert.equal((await add(db,f,1)).status,200);assert.equal((await action(db,f,'stamp')).status,409);
  const raw=db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(f.card.id);assert.equal(raw.stamps,4);assert.equal(raw.reward_choices_pending,0);assert.equal(raw.rewards_pending,0);
 }finally{db.close();}
});
test('Santofé: multiple goals preserve all units, saved rewards and required decisions',async()=>{
 const db=schema();try{
  const f=await fixture(db,'santofe');db.prepare('UPDATE loyalty_cards SET stamps=7,rewards_pending=2 WHERE id=?').run(f.card.id);
  const result=await add(db,f,25);assert.equal(result.status,200);assert.equal(result.data.card.stamps,2);assert.equal(result.data.card.rewardChoicesPending,3);assert.equal(result.data.card.rewardsPending,2);
  assert.equal(result.data.card.stamps+10*result.data.card.rewardChoicesPending,32);assert.equal((await add(db,f,1)).status,409);
  f.card=result.data.card;for(let i=0;i<3;i++)assert.equal((await action(db,f,'reward-choice',{decision:'save'})).status,200);
  assert.equal(f.card.rewardsPending,5);assert.equal((await add(db,f,5)).data.card.stamps,7);
  f.card=(await invoke(db,f.slug,'/api/card',{cookie:f.customer.cookie})).data.card;assert.equal((await action(db,f,'redeem')).status,200);assert.equal(f.card.stamps,7);assert.equal(f.card.rewardsPending,4);
 }finally{db.close();}
});
test('backend validation, required reason, unknown customers and cross-tenant/role denial',async()=>{
 const db=schema();try{
  const f=await fixture(db,'renace'),other=await fixture(db,'mooncoffee');
  for(const quantity of [0,-1,1.5,'5','invalid',null,100,Number.MAX_SAFE_INTEGER])assert.equal((await add(db,f,quantity)).status,400);
  for(const reason of ['', '     ', 'abcd', 'x'.repeat(201),{}])assert.equal((await add(db,f,1,{reason})).status,400);
  for(const cookie of [f.staff.cookie,f.customer.cookie,other.admin.cookie])assert.notEqual((await add(db,f,2,{},cookie)).status,200);
  assert.equal((await add(db,f,2,{},null)).status,401);
  const unknown=await invoke(db,'renace','/api/admin/customers/unknown/stamps',{cookie:f.admin.cookie,body:{quantity:2,reason:'Motivo válido'}});assert.equal(unknown.status,404);
  const foreign=await invoke(db,'renace','/api/admin/customers/'+other.customer.data.user.id+'/stamps',{cookie:f.admin.cookie,body:{quantity:2,reason:'Motivo válido'}});assert.equal(foreign.status,404);
  assert.equal((await add(db,f,2,{reason:'  Motivo válido  '})).status,200);
 }finally{db.close();}
});
test('one audited operation, retry denial, actual post-trigger state and tenant/admin attribution',async()=>{
 const db=schema();try{
  const f=await fixture(db,'santofe');db.prepare('UPDATE loyalty_cards SET stamps=7 WHERE id=?').run(f.card.id);
  const r=await add(db,f,5);assert.equal(r.status,200);const audit=db.prepare('SELECT * FROM admin_audit_log WHERE id=?').get(r.payload.operationId),data=JSON.parse(audit.metadata);
  assert.equal(audit.admin_id,f.admin.data.user.id);assert.equal(audit.business_id,'business_santofe');assert.equal(audit.target_user_id,f.customer.data.user.id);
  assert.equal(data.quantity,5);assert.equal(data.reason,r.payload.reason);assert.equal(data.progress_before,7);assert.equal(data.progress_after,2);assert.equal(data.rewards_generated,1);
  const history=(await invoke(db,f.slug,'/api/admin/dashboard',{cookie:f.admin.cookie})).data.events.find(e=>e.id===audit.id);assert.equal(history.event_type,'stamp_added');assert.equal(history.quantity,5);assert.equal(history.reason,r.payload.reason);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM loyalty_events WHERE card_id=? AND event_type='stamp'").get(f.card.id).n,0,'adjustments are not purchases');
  assert.equal((await add(db,f,5,r.payload)).status,409);assert.equal(db.prepare('SELECT COUNT(*) n FROM admin_audit_log WHERE id=?').get(audit.id).n,1);
 }finally{db.close();}
});
test('concurrent snapshots cannot lose updates or create duplicate rewards',async()=>{
 const db=schema();try{
  const f=await fixture(db,'santofe');db.prepare('UPDATE loyalty_cards SET stamps=7 WHERE id=?').run(f.card.id);const raw=db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(f.card.id);
  const snapshot={expectedStamps:7,expectedVersion:raw.reward_version};const results=await Promise.all([add(db,f,5,snapshot),add(db,f,5,snapshot)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const c=db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(f.card.id);assert.equal(c.stamps,2);assert.equal(c.reward_choices_pending,1);
 }finally{db.close();}
});
test('audit failure rolls back the whole adjustment including reward trigger changes',async()=>{
 const db=schema();try{
  const f=await fixture(db,'santofe');db.prepare('UPDATE loyalty_cards SET stamps=7 WHERE id=?').run(f.card.id);const before=db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(f.card.id);
  db.exec("CREATE TRIGGER simulated_audit_failure BEFORE INSERT ON admin_audit_log WHEN json_extract(NEW.metadata,'$.kind')='stamp_added' BEGIN SELECT RAISE(ABORT,'simulated failure'); END;");
  assert.equal((await add(db,f,5)).status,500);assert.deepEqual(db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(f.card.id),before);
 }finally{db.close();}
});
