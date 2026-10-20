import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {schema,fixture,invoke,env,slugs} from './reward-choice-fixture.mjs';

async function setup(t,slug){
 const db=schema();t.after(()=>db.close());
 const f=await fixture(db,slug),other=await fixture(db,slugs[(slugs.indexOf(slug)+1)%slugs.length]);
 return{db,f,other};
}
const readCard=(db,f)=>invoke(db,f.slug,'/api/card',{cookie:f.customer.cookie});
const counter=(db,f,id=f.card.id)=>invoke(db,f.slug,'/api/staff/card?value='+encodeURIComponent(id),{cookie:f.staff.cookie});
const dashboard=(db,f)=>invoke(db,f.slug,'/api/admin/dashboard',{cookie:f.admin.cookie});
const clients=(db,f)=>invoke(db,f.slug,'/api/admin/export/clients',{cookie:f.admin.cookie});
const preview=(db,f,id=f.customer.data.user.id)=>invoke(db,f.slug,`/api/admin/customers/${id}/stamps/preview?quantity=1`,{cookie:f.admin.cookie});
const state=db=>({cards:db.prepare('SELECT id,business_id,customer_id,stamps,rewards_pending,reward_choices_pending,redeemed_count,reward_version FROM loyalty_cards ORDER BY id').all().map(row=>({...row})),events:db.prepare('SELECT COUNT(*) n FROM loyalty_events').get().n,audits:db.prepare('SELECT COUNT(*) n FROM admin_audit_log').get().n,operations:db.prepare('SELECT COUNT(*) n FROM per_item_reward_operations').get().n,choices:db.prepare('SELECT COUNT(*) n FROM reward_choice_operations').get().n});
function extraCustomer(db,f){
 const id='unassigned-fictional-'+f.slug;
 db.prepare(`INSERT INTO users(id,business_id,role,name,secret_hash,secret_salt)
 SELECT ?,business_id,'customer','Otra persona ficticia',secret_hash,secret_salt FROM users WHERE id=?`).run(id,f.customer.data.user.id);
 return id;
}
function event(db,f,{business='business_'+f.slug,customer=f.customer.data.user.id,actor=f.staff.data.user.id,at=new Date().toISOString(),id=crypto.randomUUID(),card=f.card.id,voided=0}={}){
 db.prepare(`INSERT INTO loyalty_events(id,business_id,card_id,customer_id,employee_id,event_type,business_day,created_at,daily_limited,voided)
 VALUES(?,?,?,?,?,'stamp',?,?,0,?)`).run(id,business,card,customer,actor,new Intl.DateTimeFormat('en-CA',{timeZone:'America/Tijuana',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at)),at,voided);
 return id;
}
function poisonEvents(db,f,other){
 const foreign=event(db,f,{business:'business_'+other.slug,customer:other.customer.data.user.id,actor:other.staff.data.user.id});
 const wrongOwner=event(db,f,{customer:extraCustomer(db,f)});
 return{foreign,wrongOwner};
}
async function mutate(db,f,kind,body={},cookie=f.staff.cookie){
 return invoke(db,f.slug,'/api/staff/'+kind,{cookie,body:{cardId:f.card.id,expectedVersion:f.card.rewardVersion,operationId:crypto.randomUUID(),...body}});
}

for(const slug of slugs){
 test(slug+': latest stamp requires matching business AND owner in customer, counter, admin and export reads',async t=>{
  const {db,f,other}=await setup(t,slug),yesterday=new Date(Date.now()-86400000).toISOString();
  event(db,f,{at:yesterday});const poisoned=poisonEvents(db,f,other);
  event(db,f,{voided:1});
  const before=state(db);
  for(const result of [await readCard(db,f),await counter(db,f)]){
   assert.equal(result.status,200);assert.equal(result.data.card.lastStampAt,yesterday);assert.equal(result.data.card.customerId,f.customer.data.user.id);
  }
  const admin=await dashboard(db,f),exported=await clients(db,f);
  assert.equal(admin.data.customers[0].last_stamp_at,yesterday);
  assert.equal(exported.data.rows[0].last_stamp_at,yesterday);assert.equal(exported.data.rows[0].id,f.card.id);
  assert.equal((await preview(db,f)).status,200);
  assert.deepEqual(state(db),before,'all reads leave balances, events and audit unchanged');
  // Cancellation must never select an unrelated customer's event on the same card.
  db.prepare('UPDATE loyalty_cards SET stamps=1 WHERE id=?').run(f.card.id);
  const beforeCancel=state(db),path=`/api/admin/customers/${f.customer.data.user.id}/stamps`;
  const input={delta:-1,expectedStamps:1,cancelToday:true,reason:'Corrección ficticia local de atribución'};
  const denied=await invoke(db,slug,path,{cookie:f.admin.cookie,body:input});assert.equal(denied.status,409);assert.equal(denied.data.error.code,'no_visit_today');assert.deepEqual(state(db),beforeCancel);
  const legitimate=event(db,f);
  const cancelled=await invoke(db,slug,path,{cookie:f.admin.cookie,body:input});assert.equal(cancelled.status,200);assert.equal(cancelled.data.card.stamps,0);
  assert.equal(db.prepare('SELECT voided FROM loyalty_events WHERE id=?').get(legitimate).voided,1);
  for(const id of [poisoned.foreign,poisoned.wrongOwner])assert.equal(db.prepare('SELECT voided FROM loyalty_events WHERE id=?').get(id).voided,0);
 });

 test(slug+': cross-business card owner is rejected before preview, stamp, redeem or reward choice; exports and reward-ready metric exclude it',async t=>{
  const {db,f,other}=await setup(t,slug);
  // Corruption exists only in the test database; ordinary APIs never perform this reassignment.
  db.prepare('UPDATE loyalty_cards SET business_id=?,stamps=?,rewards_pending=1,reward_version=reward_version+1 WHERE id=?')
   .run('business_'+other.slug,other.card.goal,f.card.id);
  const before=state(db);
  assert.equal((await readCard(db,f)).status,404);
  for(const owner of [f,other]){
   assert.equal((await counter(db,owner,f.card.id)).status,404);
   assert.equal((await preview(db,owner,f.customer.data.user.id)).status,404);
   for(const kind of ['stamp','redeem','reward-choice']){
    const r=await invoke(db,owner.slug,'/api/staff/'+kind,{cookie:owner.staff.cookie,body:{cardId:f.card.id,quantity:1,decision:'save',expectedVersion:0,operationId:crypto.randomUUID()}});
    assert.equal(r.status,404,kind);assert.equal(r.data.card,undefined);assert.equal(r.data.preview,undefined);
   }
   const exported=await clients(db,owner),admin=await dashboard(db,owner);
   assert.equal(exported.status,200);assert.equal(exported.data.rows.some(c=>c.id===f.card.id),false);
   assert.equal(admin.data.customers.some(c=>c.id===f.card.id),false);assert.equal(admin.data.metrics.rewards_ready,0);
  }
  assert.deepEqual(state(db),before,'rejected operations perform no state changes');
  // A same-business owner with an invalid role is not a customer card either.
  db.prepare('UPDATE loyalty_cards SET business_id=? WHERE id=?').run('business_'+slug,f.card.id);
  db.prepare("UPDATE users SET role='employee' WHERE id=?").run(f.customer.data.user.id);
  const invalidRole=state(db);
  assert.equal((await counter(db,f)).status,404);assert.equal((await preview(db,f)).status,404);
  assert.equal((await clients(db,f)).data.rows.length,0);assert.equal((await dashboard(db,f)).data.metrics.rewards_ready,0);
  assert.deepEqual(state(db),invalidRole);
 });

 test(slug+': missing records, unauthorized sessions and foreign identifiers never bypass the tenant or role',async t=>{
  const {db,f,other}=await setup(t,slug),before=state(db);
  for(const [path,cookies] of [
   ['/api/card',[[undefined,401],[f.staff.cookie,403],[f.admin.cookie,403],[other.customer.cookie,401]]],
   ['/api/staff/card?value='+f.card.id,[[undefined,401],[f.customer.cookie,403],[other.staff.cookie,401]]],
   ['/api/admin/export/clients',[[undefined,401],[f.customer.cookie,403],[f.staff.cookie,403],[other.admin.cookie,401]]],
   [`/api/admin/customers/${f.customer.data.user.id}/stamps/preview?quantity=1`,[[undefined,401],[f.staff.cookie,403],[other.admin.cookie,401]]]
  ])for(const [cookie,status] of cookies){const r=await invoke(db,slug,path,{cookie});assert.equal(r.status,status,path);assert.equal(r.data.card,undefined);assert.equal(r.data.rows,undefined);assert.equal(r.data.preview,undefined);}
  for(const id of ['fictional-missing-card',other.card.id]){
   assert.equal((await counter(db,f,id)).status,404);
   for(const kind of ['stamp','redeem','reward-choice']){
    const r=await invoke(db,slug,'/api/staff/'+kind,{cookie:f.staff.cookie,body:{cardId:id,quantity:1,decision:'save',operationId:crypto.randomUUID()}});assert.equal(r.status,404,kind);
   }
  }
  for(const id of ['fictional-missing-customer',other.customer.data.user.id])assert.equal((await preview(db,f,id)).status,404);
  for(const cookie of [undefined,f.customer.cookie,other.staff.cookie])for(const kind of ['stamp','redeem','reward-choice']){
   const r=await mutate(db,f,kind,{quantity:1,decision:'save'},cookie||'');assert.equal(r.status,cookie===f.customer.cookie?403:401);
  }
  // Own session cannot override its owner via arbitrary browser query parameters.
  const own=await invoke(db,slug,`/api/card?customer_id=${other.customer.data.user.id}&business_id=business_${other.slug}`,{cookie:f.customer.cookie});
  assert.equal(own.data.card.id,f.card.id);assert.deepEqual(state(db),before);
  // Missing own card, constructed only in this disposable in-memory fixture.
  db.prepare('DELETE FROM loyalty_cards WHERE id=?').run(f.card.id);
  const absent=await readCard(db,f);assert.equal(absent.status,404);assert.equal(absent.data.card,undefined);
 });

 test(slug+': valid stamp and redemption preserve daily/per-item rules despite foreign and wrong-owner stamp references',async t=>{
  const {db,f,other}=await setup(t,slug);poisonEvents(db,f,other);
  const added=await mutate(db,f,'stamp',{quantity:1});assert.equal(added.status,200);assert.equal(added.data.card.stamps,1);
  f.card=added.data.card;
  if(slug!=='santofe')assert.equal((await mutate(db,f,'stamp',{quantity:1})).status,409);
  if(slug==='santofe'){
   const completed=await mutate(db,f,'stamp',{quantity:9});assert.equal(completed.status,200);f.card=completed.data.card;
   assert.equal(f.card.rewardChoicesPending,1);assert.equal(f.card.stamps,0);
   const saved=await mutate(db,f,'reward-choice',{decision:'save'});assert.equal(saved.status,200);f.card=saved.data.card;assert.equal(f.card.rewardsPending,1);
  }else{
   db.prepare('UPDATE loyalty_cards SET stamps=? WHERE id=?').run(f.card.goal,f.card.id);
   f.card=(await counter(db,f)).data.card;assert.equal(f.card.stamps,f.card.goal);
  }
  const redeemed=await mutate(db,f,'redeem');assert.equal(redeemed.status,200);assert.equal(redeemed.data.card.stamps,0);assert.equal(redeemed.data.card.redeemed,1);
  if(slug==='santofe'){assert.equal(redeemed.data.card.rewardsPending,0);assert.equal(redeemed.data.card.rewardChoicesPending,0);}
  const redeemedEvent=db.prepare("SELECT quantity FROM loyalty_events WHERE card_id=? AND event_type='redeem'").get(f.card.id);assert.equal(redeemedEvent.quantity,1);
 });

 test(slug+': owner reassignment between read and write aborts stamp and redeem atomically',async t=>{
  const {db,f}=await setup(t,slug),replacement=extraCustomer(db,f);
  for(const kind of ['stamp','redeem']){
   const stamps=kind==='redeem'&&slug!=='santofe'?f.card.goal:0;
   db.prepare('UPDATE loyalty_cards SET customer_id=?,stamps=?,rewards_pending=?,reward_choices_pending=0,reward_version=reward_version+1 WHERE id=?')
    .run(f.customer.data.user.id,stamps,kind==='redeem'&&slug==='santofe'?1:0,f.card.id);
   const e=env(db,slug),before=state(db),prepare=e.DB.prepare.bind(e.DB),batch=e.DB.batch.bind(e.DB);let injected=false;
   const reassign=()=>{assert.equal(injected,false);injected=true;db.prepare('UPDATE loyalty_cards SET customer_id=? WHERE id=?').run(replacement,f.card.id);};
   if(slug==='santofe')e.DB.prepare=sql=>{const stmt=prepare(sql);if(sql.includes('INSERT INTO per_item_reward_operations')){const run=stmt.run.bind(stmt);stmt.run=async()=>{reassign();return run();};}return stmt;};
   else e.DB.batch=async statements=>{reassign();return batch(statements);};
   const response=await worker.fetch(new Request('http://127.0.0.1/api/staff/'+kind,{method:'POST',headers:{cookie:f.staff.cookie,'content-type':'application/json'},body:JSON.stringify({cardId:f.card.id,quantity:1,expectedVersion:before.cards.find(c=>c.id===f.card.id).reward_version,operationId:crypto.randomUUID()})}),e);
   assert.equal(response.status,409,kind);assert.equal(injected,true);
   const after=state(db),expected=structuredClone(before);expected.cards.find(c=>c.id===f.card.id).customer_id=replacement;
   assert.deepEqual(after,expected,'only the simulated concurrent owner update survives; no partial operation');
   const body=await response.json();assert.equal(body.card,undefined);
  }
 });
}

test('reinforced reads keep the existing D1 query budgets, indexes and no-write behavior',async t=>{
 const {db,f}=await setup(t,'renace');
 for(const [path,cookie,budget] of [['/api/card',f.customer.cookie,2],['/api/staff/card?value='+f.card.id,f.staff.cookie,2],['/api/admin/dashboard',f.admin.cookie,9],['/api/admin/export/clients',f.admin.cookie,3],[`/api/admin/customers/${f.customer.data.user.id}/stamps/preview?quantity=1`,f.admin.cookie,2]]){
  const e=env(db,f.slug),prepare=e.DB.prepare.bind(e.DB);let reads=0,writes=0;const plans=[];
  e.DB.prepare=sql=>{const stmt=prepare(sql),bind=stmt.bind.bind(stmt);let args=[];stmt.bind=(...values)=>{args=values;bind(...values);return stmt;};
   for(const method of ['first','all','run']){const fn=stmt[method].bind(stmt);stmt[method]=async(...values)=>{if(method==='run')writes++;else reads++;if(sql.includes('MAX(created_at)')&&sql.includes('loyalty_cards'))plans.push(...db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args));return fn(...values);};}return stmt;};
  const response=await worker.fetch(new Request('http://127.0.0.1'+path,{headers:{cookie}}),e);assert.equal(response.status,200,path);assert.equal(reads,budget,path);assert.equal(writes,0,path);
  assert.ok(plans.some(p=>p.detail.includes('loyalty_events_card_type_created')),path+' retains indexed stamp lookup');
  t.diagnostic(JSON.stringify({path,reads,writes,stampIndex:'loyalty_events_card_type_created'}));
 }
});
