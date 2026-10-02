import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{testables} from '../worker/index.js';
import {schema,fixture,invoke,action,env,slugs} from './reward-choice-fixture.mjs';

const password='Fictitious-team-local-4832!';
const profile=(db,f,account,body)=>invoke(db,f.slug,'/api/account/profile',{method:'PATCH',cookie:account.cookie,body});
const create=(db,f,body,cookie=f.admin.cookie)=>invoke(db,f.slug,'/api/admin/employees',{cookie,body});
const row=(db,id)=>db.prepare('SELECT * FROM users WHERE id=?').get(id);
const count=(db,table)=>db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;
const noSecrets=value=>{for(const secret of ['secret_hash','secret_salt','secret_iterations','session_hash',password])assert.ok(!JSON.stringify(value).includes(secret));};

test('All four tenants: each authenticated role changes only its own Unicode name, preserving sessions, credentials, QR and rewards',async()=>{
 const db=schema();try{for(const slug of slugs){const f=await fixture(db,slug);
  await action(db,f,'stamp',{quantity:3});
  for(const account of [f.customer,f.staff,f.admin]){
   const id=account.data.user.id,before=row(db,id),others=db.prepare('SELECT * FROM users WHERE id<>? ORDER BY id').all(id),sessions=db.prepare('SELECT * FROM sessions WHERE user_id=?').all(id),cards=db.prepare('SELECT * FROM loyalty_cards ORDER BY id').all(),events=db.prepare('SELECT * FROM loyalty_events ORDER BY id').all();
   const result=await profile(db,f,account,{name:'  María José O’Neill  '});assert.equal(result.status,200);assert.equal(result.data.user.name,'María José O’Neill');
   const {name,updated_at,...rest}=row(db,id),{name:oldName,updated_at:oldDate,...old}=before;assert.deepEqual(rest,old);assert.deepEqual(db.prepare('SELECT * FROM users WHERE id<>? ORDER BY id').all(id),others);
   assert.deepEqual(db.prepare('SELECT * FROM sessions WHERE user_id=?').all(id),sessions);assert.deepEqual(db.prepare('SELECT * FROM loyalty_cards ORDER BY id').all(),cards);assert.deepEqual(db.prepare('SELECT * FROM loyalty_events ORDER BY id').all(),events);
   assert.equal((await invoke(db,slug,'/api/me',{cookie:account.cookie})).data.user.name,name);noSecrets(result.data);
  }
  const dashboard=(await invoke(db,slug,'/api/admin/dashboard',{cookie:f.admin.cookie})).data;
  assert.ok(dashboard.employees.every(u=>u.name==='María José O’Neill'));assert.equal((await invoke(db,slug,'/api/card',{cookie:f.customer.cookie})).data.card.qrValue,f.card.qrValue);
 }}finally{db.close();}
});

test('Own-name requests reject every privileged field, another user/tenant, malformed names and anonymous access without partial writes',async()=>{
 const db=schema();try{for(const slug of slugs){const f=await fixture(db,slug);
  assert.equal((await profile(db,f,{}, {name:'Ana María'})).status,401);
  for(const account of [f.customer,f.staff,f.admin]){
   const users=db.prepare('SELECT * FROM users ORDER BY id').all(),audits=count(db,'admin_audit_log');
   for(const field of ['id','user_id','username','phone','role','business_id','active','must_change_secret','secret_hash','secret_salt','secret_iterations','permissions'])assert.equal((await profile(db,f,account,{name:'Ana María',[field]:field==='role'?'admin':'foreign'})).status,400,field);
   for(const name of ['', 'A','0','<script>alert(1)</script>','Bad\nName','Bad\tName','a'.repeat(61),null,33,{}])assert.equal((await profile(db,f,account,{name})).status,400);
   for(const body of [[],{}, {name:['Ana']}])assert.equal((await profile(db,f,account,body)).status,400);
   assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(),users);assert.equal(count(db,'admin_audit_log'),audits);
  }
 }}finally{db.close();}
});

test('Renaming is idempotent; activity resolves current team names by tenant while historical IDs, metadata and times stay untouched',async()=>{
 const db=schema();try{for(const slug of slugs){const f=await fixture(db,slug);await action(db,f,'stamp',{quantity:1});
  const made=await create(db,f,{name:'Equipo Nuevo',username:'audit_team',password,role:'employee'});assert.equal(made.status,201);
  const history=db.prepare('SELECT * FROM admin_audit_log WHERE business_id=? ORDER BY id').all('business_'+slug),events=db.prepare('SELECT * FROM loyalty_events WHERE business_id=?').all('business_'+slug);
  for(const [account,name] of [[f.admin,'Ana Administradora'],[f.staff,'José Mostrador']]){
   const n=count(db,'admin_audit_log');assert.equal((await profile(db,f,account,{name})).status,200);const first=row(db,account.data.user.id);
   for(let i=0;i<3;i++)assert.equal((await profile(db,f,account,{name})).status,200);
   assert.equal(count(db,'admin_audit_log'),n+1);assert.deepEqual(row(db,account.data.user.id),first);
  }
  for(const original of history)assert.deepEqual(db.prepare('SELECT * FROM admin_audit_log WHERE id=?').get(original.id),original);
  assert.deepEqual(db.prepare('SELECT * FROM loyalty_events WHERE business_id=?').all('business_'+slug),events);
  const dash=(await invoke(db,slug,'/api/admin/dashboard',{cookie:f.admin.cookie})).data;assert.equal(dash.events.find(e=>e.event_type==='stamp').employee,'José Mostrador');assert.equal(dash.events.find(e=>e.event_type==='team_staff_created').employee,'Ana Administradora');
  for(const type of ['team_staff_created','profile_name_changed']){const filtered=await invoke(db,slug,'/api/admin/dashboard?eventType='+type,{cookie:f.admin.cookie});assert.ok(filtered.data.events.length>0);assert.ok(filtered.data.events.every(e=>e.event_type===type));}
  const exported=await invoke(db,slug,'/api/admin/export/activity',{cookie:f.admin.cookie});assert.equal(exported.data.rows.find(e=>e.event_type==='stamp').employee,'José Mostrador');noSecrets(exported.data);
 }}finally{db.close();}
});

test('Each tenant admin creates Staff and another Admin through official credentials; new roles log in, rename and receive only normal permissions',async()=>{
 const db=schema();try{for(const slug of slugs){const f=await fixture(db,slug);
  for(const role of ['employee','admin']){
   const username='shared_'+role,result=await create(db,f,{name:'  José Luis  ',username:'  '+username.toUpperCase()+'  ',password,role});assert.equal(result.status,201);assert.equal(result.data.employee.role,role);assert.equal(result.data.employee.username,username);noSecrets(result.data);
   const u=row(db,result.data.employee.id);assert.equal(u.business_id,'business_'+slug);assert.equal(u.active,1);assert.equal(u.must_change_secret,0);assert.equal(u.secret_iterations,100000);assert.equal(await testables.verifySecret(password,u.secret_salt,u.secret_hash,u.secret_iterations),true);assert.match(u.id,/^[a-f0-9-]{36}$/);assert.ok(u.created_at&&u.updated_at);
   const login=await invoke(db,slug,'/api/login/staff',{body:{username,password}});assert.equal(login.status,200);assert.equal(login.data.user.id,u.id);assert.equal((await profile(db,f,login,{name:'Ana Sofía'})).status,200);
   assert.equal((await invoke(db,slug,'/api/admin/dashboard',{cookie:login.cookie})).status,role==='admin'?200:403);
   assert.equal((await invoke(db,slug,'/api/staff/card?value='+f.phone,{cookie:login.cookie})).status,200);
   for(const childRole of ['employee','admin'])assert.equal((await create(db,f,{name:'Equipo Secundario',username:'child_'+childRole,password,role:childRole},login.cookie)).status,role==='admin'&&childRole==='employee'?201:403);
  }
  const dash=(await invoke(db,slug,'/api/admin/dashboard',{cookie:f.admin.cookie})).data;
  for(const type of ['team_admin_created','team_staff_created'])assert.ok(dash.events.some(e=>e.event_type===type));noSecrets(dash);
  const defaultStaff=await create(db,f,{name:'Equipo Predeterminado',username:'default_staff',password});assert.equal(defaultStaff.data.employee.role,'employee');
  // Unique usernames belong to a tenant; the same username above exists once in each.
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE username='shared_admin' AND business_id=?").get('business_'+slug).n,1);
 }}finally{db.close();}
});

test('Creation rejects customers/staff, foreign sessions/businesses, forbidden roles/fields and invalid usernames with no users or audits left behind',async()=>{
 const db=schema();try{const records=[];for(const slug of slugs)records.push(await fixture(db,slug));
  for(const f of records){const original=count(db,'users'),audits=count(db,'admin_audit_log'),base={name:'Nombre Seguro',username:'valid_team',password};
   for(const cookie of [f.staff.cookie,f.customer.cookie])for(const role of ['employee','staff','admin'])assert.equal((await create(db,f,{...base,role},cookie)).status,403);
   assert.equal((await create(db,f,base,undefined)).status,201); // Default cookie is the authenticated admin.
   const afterDefault=count(db,'users'),afterAudits=count(db,'admin_audit_log');
   for(const role of ['customer','staff','root','owner','superadmin','manager','',null,{},1])assert.equal((await create(db,f,{...base,role})).status,400);
   for(const username of ['<admin>','<admin_vainilla>','a b','<>','ab','a'.repeat(31),'José','foo@bar',null,{}])assert.equal((await create(db,f,{...base,username})).status,400);
   for(const name of ['', '<b>Ana</b>','a'.repeat(61)])assert.equal((await create(db,f,{...base,name})).status,400);
   for(const field of ['id','business_id','active','must_change_secret','secret_hash','secret_salt','secret_iterations','phone'])assert.equal((await create(db,f,{...base,[field]:'business_santofe'})).status,400);
   for(const body of [[],{}, {...base,password:3},{...base,role:'admin',password:'short888'}])assert.equal((await create(db,f,body)).status,400);
   for(const foreign of records.filter(x=>x.slug!==f.slug))assert.equal((await create(db,f,{...base,username:'foreign'},foreign.admin.cookie)).status,401);
   assert.equal(count(db,'users'),afterDefault);assert.equal(count(db,'admin_audit_log'),afterAudits);assert.equal(afterDefault,original+1);assert.equal(afterAudits,audits+1);
  }
 }finally{db.close();}
});

test('Concurrent creates and rename retries honor serialized atomic D1 batches, UNIQUE constraints and rollback without duplicate audit',async()=>{
 const db=schema();try{for(const slug of slugs){const f=await fixture(db,slug),environment=env(db,slug),originalBatch=environment.DB.batch;let tail=Promise.resolve();
  // D1 executes a batch as one transaction; serialize our in-memory adapter likewise.
  environment.DB.batch=statements=>{const pending=tail.then(()=>originalBatch(statements));tail=pending.catch(()=>{});return pending;};
  async function request(path,method,body){const result=await worker.fetch(new Request('http://127.0.0.1'+path,{method,headers:{cookie:f.admin.cookie,'content-type':'application/json'},body:JSON.stringify(body)}),environment);return{status:result.status,data:await result.json()};}
  const audits=count(db,'admin_audit_log');
  const results=await Promise.all(Array.from({length:4},()=>request('/api/admin/employees','POST',{name:'Admin Concurrente',username:'concurrent_admin',role:'admin',password})));
  assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===409&&r.data.error.code==='username_exists').length,3);assert.equal(count(db,'admin_audit_log'),audits+1);
  const renames=await Promise.all(Array.from({length:4},()=>request('/api/account/profile','PATCH',{name:'Ana Concurrente'})));assert.ok(renames.every(r=>r.status===200));assert.equal(count(db,'admin_audit_log'),audits+2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE username=? AND business_id=?').get('concurrent_admin','business_'+slug).n,1);
 }}finally{db.close();}
});

test('Current actor joins exclude malformed cross-tenant history; no actor name leaks through activity or XLSX source',async()=>{
 const db=schema();try{const a=await fixture(db,'mooncoffee'),b=await fixture(db,'santofe');await action(db,a,'stamp');
  db.prepare('UPDATE loyalty_events SET employee_id=? WHERE card_id=?').run(b.admin.data.user.id,a.card.id);
  db.prepare("INSERT INTO admin_audit_log(id,business_id,admin_id,actor_id,target_user_id,action,created_at,metadata) VALUES('foreign-audit','business_mooncoffee',?,?,?,'employee_updated','2026-10-02','{}')").run(b.admin.data.user.id,b.admin.data.user.id,a.staff.data.user.id);
  for(const path of ['/api/admin/dashboard','/api/admin/export/activity']){const result=await invoke(db,'mooncoffee',path,{cookie:a.admin.cookie});assert.equal(result.status,200);const rows=result.data.events||result.data.rows;assert.ok(!rows.some(r=>r.id==='foreign-audit'||r.card_id===a.card.id));}
 }finally{db.close();}
});
