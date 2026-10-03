import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activitySource} from '../worker/activity.js';
import worker from '../worker/index.js';
import {schema,fixture,invoke,action,slugs,assets} from './reward-choice-fixture.mjs';

test('Current production schema 0013 remains readable as a public shell under maintenance with zero API or scheduled database access',async()=>{
 const db=schema('0014');try{
  assert.equal(db.prepare('PRAGMA table_info(loyalty_cards)').all().some(r=>r.name==='reward_choices_pending'),false);
  let reads=0;
  for(const slug of slugs){const environment={DEV_TENANT:slug,ASSETS:assets,MAINTENANCE_MODE:'ON',DB:{prepare(){reads++;throw Error('No old-schema SQL');},batch(){reads++;throw Error('No old-schema SQL');}}};
   assert.equal((await worker.fetch(new Request('http://127.0.0.1/'),environment)).status,200);
   for(const path of ['/api/card','/api/account/profile','/api/staff/reward-choice','/api/admin/dashboard'])assert.equal((await worker.fetch(new Request('http://127.0.0.1'+path),environment)).status,503);
   await worker.scheduled({},environment,{waitUntil(){throw Error('No scheduled operations during migration');}});
  }assert.equal(reads,0);
 }finally{db.close();}
});

test('0014 adds zero decisions without changing existing progress, saved rewards, QR, users, sessions, preferences or history',async()=>{
 const db=schema('0014');try{
  for(const slug of slugs){
   db.prepare("INSERT INTO users(id,business_id,role,name,secret_hash,secret_salt) VALUES(?,?,'customer','Local old customer','local','local')").run(slug,'business_'+slug);
   db.prepare('INSERT INTO loyalty_cards(id,business_id,customer_id,qr_token,stamps,rewards_pending,redeemed_count,reward_version) VALUES(?,?,?,?,3,2,4,7)').run(slug,'business_'+slug,slug,'local-qr-'+slug);
   db.prepare('INSERT INTO loyalty_card_preferences(card_id,business_id,stamp_style) VALUES(?,?,?)').run(slug,'business_'+slug,slug==='vainillacoffee'?'flower':'classic');
   db.prepare('INSERT INTO sessions(id,token_hash,user_id,expires_at) VALUES(?,?,?,?)').run(slug,'local-token-'+slug,slug,'2030-01-01');
  }
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
  const before=tables.map(name=>({name,columns:db.prepare('PRAGMA table_info('+name+')').all().map(r=>r.name),rows:db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()}));
  db.exec(readFileSync(new URL('../migrations/0014_reward_choices.sql',import.meta.url),'utf8'));
  for(const t of before)assert.deepEqual(db.prepare('SELECT '+t.columns.join(',')+' FROM '+t.name+' ORDER BY rowid').all(),t.rows,t.name);
  assert.equal(db.prepare('SELECT SUM(reward_choices_pending) AS n FROM loyalty_cards').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reward_choice_operations').get().n,0);
  assert.throws(()=>db.exec('UPDATE loyalty_cards SET reward_choices_pending=-1'),/CHECK/);
 }finally{db.close();}
});

for(const slug of ['santofe'])test(slug+': crossing goals generates decisions, preserves saved rewards and persistently blocks paid purchases',async()=>{
 const db=schema();try{
  const goal=slug==='vainillacoffee'?9:10;
  for(const [before,quantity,progress,choices]of [[goal-1,1,0,1],[8,slug==='vainillacoffee'?4:5,3,1],[goal-1,goal*2+1,0,3]]){
   const f=await fixture(db,slug);assert.equal((await action(db,f,'stamp',{quantity:before})).status,200);
   db.prepare('UPDATE loyalty_cards SET rewards_pending=2 WHERE id=?').run(f.card.id);
   const result=await action(db,f,'stamp',{quantity});assert.equal(result.status,200);assert.equal(f.card.stamps,progress);assert.equal(f.card.rewardChoicesPending,choices);assert.equal(f.card.rewardsPending,2);assert.equal(f.card.canStampToday,false);assert.equal(result.data.operation.freeCoffees,0);assert.equal(result.data.operation.rewardChoicesPendingAfter,choices);
   const snapshot={...f.card};const rejected=await action(db,f,'stamp',{quantity:1});assert.equal(rejected.status,409);assert.equal(rejected.data.error.code,'reward_decision_required');
   assert.deepEqual((await invoke(db,slug,'/api/card',{cookie:f.customer.cookie})).data.card,snapshot);
   const logged=await invoke(db,slug,'/api/login/customer',{body:{phone:f.phone,pin:'4826'}});assert.equal(logged.status,200);assert.equal((await invoke(db,slug,'/api/card',{cookie:logged.cookie})).data.card.rewardChoicesPending,choices);
   const second=await fixture(db,slug);const scanned=await invoke(db,slug,'/api/staff/card?value='+encodeURIComponent(f.card.qrValue),{cookie:second.staff.cookie});assert.equal(scanned.data.card.canStampToday,false);assert.equal((await action(db,f,'stamp',{quantity:1},scanned.data.card,second.staff.cookie)).status,409);
   const row=db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(f.card.id),eventCount=db.prepare('SELECT COUNT(*) AS n FROM loyalty_events').get().n;
   assert.throws(()=>db.prepare("INSERT INTO per_item_reward_operations(id,business_id,card_id,customer_id,employee_id,kind,paid_items,before_stamps,before_rewards,before_choices,before_version,business_day,created_at) VALUES(?,?,?,?,?,'purchase',1,?,?,?,?,?,?)").run(crypto.randomUUID(),'business_'+slug,row.id,row.customer_id,second.staff.data.user.id,row.stamps,row.rewards_pending,row.reward_choices_pending,row.reward_version,'2026-10-01','2026-10-01T00:00:00Z'),/reward_decision_required/);
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM loyalty_events').get().n,eventCount);
  }
 }finally{db.close();}
});

test('Decisions resolve one at a time: save, redeem now and saved redemption preserve progress and never add a free-drink stamp',async()=>{
 const db=schema();try{for(const slug of ['santofe']){
  const f=await fixture(db,slug),goal=f.card.goal;await action(db,f,'stamp',{quantity:goal-1});await action(db,f,'stamp',{quantity:2*goal+1});assert.equal(f.card.rewardChoicesPending,3);
  await action(db,f,'reward-choice',{decision:'save'});assert.equal(f.card.rewardChoicesPending,2);assert.equal(f.card.rewardsPending,1);assert.equal(f.card.redeemed,0);assert.equal((await action(db,f,'stamp',{quantity:1})).status,409);
  await action(db,f,'redeem');assert.equal(f.card.rewardChoicesPending,2);assert.equal(f.card.rewardsPending,0);assert.equal(f.card.redeemed,1);assert.equal(f.card.stamps,0);
  await action(db,f,'reward-choice',{decision:'redeem_now'});assert.equal(f.card.rewardChoicesPending,1);assert.equal(f.card.redeemed,2);assert.equal(f.card.stamps,0);assert.equal((await action(db,f,'stamp',{quantity:1})).status,409);
  await action(db,f,'reward-choice',{decision:'save'});assert.equal(f.card.rewardChoicesPending,0);assert.equal(f.card.rewardsPending,1);assert.equal(f.card.stamps,0);assert.equal(f.card.canStampToday,true);assert.equal((await action(db,f,'stamp',{quantity:1})).status,200);assert.equal(f.card.stamps,1);
  const rows=db.prepare(activitySource()).all(...Array(4).fill('business_'+slug)).filter(r=>r.card_id===f.card.id);for(const type of ['reward_generated','reward_saved','reward_redeemed_now','saved_reward_redeemed'])assert.ok(rows.some(r=>r.event_type===type),type);
  assert.equal(rows.filter(r=>r.event_type==='reward_saved').length,2);assert.ok(rows.filter(r=>r.event_type!=='stamp').every(r=>/progreso|guardadas/.test(r.reason)));
 }}finally{db.close();}
});

test('Concurrent decisions, stale versions, replay and reused cross-action keys cannot consume a reward twice',async()=>{
 const db=schema();try{const f=await fixture(db,'santofe');await action(db,f,'stamp',{quantity:21});const card={...f.card},keys=[crypto.randomUUID(),crypto.randomUUID()];
  const race=await Promise.all(keys.map((operationId,i)=>action(db,f,'reward-choice',{decision:i?'redeem_now':'save',operationId},card)));assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  f.card=(await invoke(db,f.slug,'/api/card',{cookie:f.customer.cookie})).data.card;assert.equal(f.card.rewardChoicesPending,1);assert.equal(f.card.rewardsPending+f.card.redeemed,1);assert.equal(f.card.stamps,1);
  const snapshot={...f.card},id=keys[race.findIndex(r=>r.status===200)];assert.equal((await action(db,f,'reward-choice',{decision:'save',operationId:id})).status,409);assert.deepEqual((await invoke(db,f.slug,'/api/card',{cookie:f.customer.cookie})).data.card,snapshot);
  assert.equal((await action(db,f,'reward-choice',{decision:'save'},card)).status,409);
  await action(db,f,'reward-choice',{decision:'save'});assert.equal((await action(db,f,'stamp',{quantity:1,operationId:id})).status,409);assert.equal(f.card.rewardChoicesPending,0);
  assert.equal((await action(db,f,'reward-choice',{decision:'unknown'})).status,400);assert.equal((await action(db,f,'reward-choice',{decision:'save'})).status,409);
 }finally{db.close();}
});

test('Decision routes enforce staff role, business isolation and daily-tenant rules; administrative additions cannot bypass the block',async()=>{
 const db=schema();try{const records=[];for(const slug of slugs){const f=await fixture(db,slug);records.push(f);if(f.card.stampPolicy==='per_item')await action(db,f,'stamp',{quantity:f.card.goal});}
  for(const f of records){assert.equal((await action(db,f,'reward-choice',{decision:'save'},f.card,f.customer.cookie)).status,403);const foreign=records.find(r=>r.slug!==f.slug);assert.equal((await action(db,f,'reward-choice',{decision:'save'},foreign.card)).status,404);
   if(f.card.stampPolicy==='per_item'){
    const r=await invoke(db,f.slug,'/api/admin/customers/'+f.card.customerId+'/stamps',{method:'POST',cookie:f.admin.cookie,body:{delta:1,expectedStamps:f.card.stamps,reason:'Local test adjustment'}});assert.equal(r.status,409);assert.equal(r.data.error.code,'reward_decision_required');
    assert.throws(()=>db.prepare('UPDATE loyalty_cards SET stamps=stamps+1 WHERE id=?').run(f.card.id),/reward_decision_required/);
   }else{
    assert.equal((await action(db,f,'reward-choice',{decision:'save'})).status,409);assert.equal((await action(db,f,'stamp',{quantity:1})).status,200);assert.equal((await action(db,f,'stamp',{quantity:1})).status,409);assert.equal(f.card.stamps,1);assert.equal(f.card.goal,f.slug==='mooncoffee'?8:9);
   }
  }
 }finally{db.close();}
});

test('All four tenants change only the customer name without relogin; current-name activity, searches and exports preserve phone, QR and balances',async()=>{
 const db=schema();try{for(const slug of slugs){const f=await fixture(db,slug);await action(db,f,'stamp',{quantity:f.card.stampPolicy==='per_item'?f.card.goal+3:1});
  const userBefore=db.prepare('SELECT * FROM users WHERE id=?').get(f.card.customerId),cardBefore=db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(f.card.id),sessions=db.prepare('SELECT * FROM sessions WHERE user_id=?').all(f.card.customerId),logs=db.prepare('SELECT * FROM loyalty_events WHERE customer_id=?').all(f.card.customerId);
  for(const name of ['', 'A','1','<script>','a'.repeat(61),null,'Bad\nName'])assert.equal((await invoke(db,slug,'/api/account/profile',{method:'PATCH',cookie:f.customer.cookie,body:{name}})).status,400);
  assert.equal((await invoke(db,slug,'/api/account/profile',{method:'PATCH',cookie:f.customer.cookie,body:{name:'Fer',role:'admin'}})).status,400);
  for(const cookie of [f.staff.cookie,f.admin.cookie])assert.equal((await invoke(db,slug,'/api/account/profile',{method:'PATCH',cookie,body:{name:'Fer'}})).status,200);
  const changed=await invoke(db,slug,'/api/account/profile',{method:'PATCH',cookie:f.customer.cookie,body:{name:'  María José O’Neill  '}});assert.equal(changed.status,200);assert.equal(changed.data.user.name,'María José O’Neill');
  const {name,updated_at,...after}=db.prepare('SELECT * FROM users WHERE id=?').get(f.card.customerId);const {name:oldName,updated_at:oldDate,...before}=userBefore;assert.deepEqual(after,before);assert.deepEqual(db.prepare('SELECT * FROM loyalty_cards WHERE id=?').get(f.card.id),cardBefore);assert.deepEqual(db.prepare('SELECT * FROM sessions WHERE user_id=?').all(f.card.customerId),sessions);assert.deepEqual(db.prepare('SELECT * FROM loyalty_events WHERE customer_id=?').all(f.card.customerId),logs);
  assert.equal((await invoke(db,slug,'/api/me',{cookie:f.customer.cookie})).data.user.name,name);assert.equal((await invoke(db,slug,'/api/card',{cookie:f.customer.cookie})).data.card.name,name);
  const lookup=await invoke(db,slug,'/api/staff/card?value='+f.phone,{cookie:f.staff.cookie});assert.equal(lookup.data.card.name,name);assert.equal(lookup.data.card.qrValue,f.card.qrValue);
  const dash=await invoke(db,slug,'/api/admin/dashboard?q='+encodeURIComponent('María José'),{cookie:f.admin.cookie});assert.equal(dash.data.customers[0].name,name);assert.ok(dash.data.events.filter(r=>r.card_id===f.card.id).every(r=>r.customer===name&&r.customer_phone===f.phone));
  for(const kind of ['clients','activity']){const e=await invoke(db,slug,'/api/admin/export/'+kind,{cookie:f.admin.cookie});const row=e.data.rows.find(r=>kind==='clients'?r.id===f.card.id:r.card_id===f.card.id);assert.equal(kind==='clients'?row.name:row.customer,name);}
  const duplicate=await fixture(db,slug);assert.equal((await invoke(db,slug,'/api/account/profile',{method:'PATCH',cookie:duplicate.customer.cookie,body:{name}})).status,200);
 }}finally{db.close();}
});
