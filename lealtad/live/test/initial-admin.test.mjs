import test from 'node:test';
import assert from 'node:assert/strict';
import {schema,fixture,invoke,slugs} from './reward-choice-fixture.mjs';
const password='Fictitious-secondary-local-4832!';
const create=(db,f,role,username,cookie=f.admin.cookie)=>invoke(db,f.slug,'/api/admin/employees',{cookie,body:{role,username,name:'Equipo Local',password}});
const manage=(db,f,id,method,body,cookie=f.admin.cookie)=>invoke(db,f.slug,'/api/admin/employees/'+id,{method,body,cookie});
const dashboard=(db,f,cookie=f.admin.cookie)=>invoke(db,f.slug,'/api/admin/dashboard?eventPerPage=100',{cookie});

test('Team edits/deletions clear only literal tenant and username login keys, including long keys and underscores',async()=>{
 const db=schema();try{for(const slug of slugs){const f=await fixture(db,slug),oldName='admin_'+ 'a'.repeat(24),newName='admin_'+ 'b'.repeat(24);
  const created=await create(db,f,'admin',oldName);assert.equal(created.status,201);const id=created.data.employee.id,business=db.prepare('SELECT business_id FROM users WHERE id=?').get(id).business_id;
  const keys=[`${business}:staff:${oldName}:127.0.0.1`,`${business}:staff:${newName}:127.0.0.2`,`${business}:staff:${oldName.replace('_','x')}:127.0.0.3`,`${business}:staff:${newName.replace('_','x')}:127.0.0.4`,`${business}_foreign:staff:${oldName}:127.0.0.5`,`${business}:staff:${oldName}extra:127.0.0.6`];
  for(const key of keys)db.prepare('INSERT INTO login_attempts (login_key,attempts) VALUES (?,2)').run(key);
  assert.equal((await manage(db,f,id,'PUT',{name:'Cuenta Local Actualizada',username:newName})).status,200);
  assert.deepEqual(db.prepare('SELECT login_key FROM login_attempts WHERE login_key IN (?,?,?,?,?,?) ORDER BY login_key').all(...keys).map(x=>x.login_key),keys.slice(2).sort());
  db.prepare('INSERT INTO login_attempts (login_key,attempts) VALUES (?,2)').run(keys[1]);
  assert.equal((await manage(db,f,id,'DELETE')).status,200);
  assert.deepEqual(db.prepare('SELECT login_key FROM login_attempts WHERE login_key IN (?,?,?,?,?,?) ORDER BY login_key').all(...keys).map(x=>x.login_key),keys.slice(2).sort());
 }}finally{db.close();}
});

test('Only the initial admin creates admins in all four tenants; secondary admins keep Staff management and their own profile, with no authority transfer',async()=>{
 const db=schema();try{for(const slug of slugs){const f=await fixture(db,slug),secondary=await create(db,f,'admin','secondary');assert.equal(secondary.status,201);
  const login=await invoke(db,slug,'/api/login/staff',{body:{username:'secondary',password}});assert.equal(login.status,200);
  assert.equal((await dashboard(db,f)).data.teamPermissions.canManageAdmins,true);assert.equal((await dashboard(db,f,login.cookie)).data.teamPermissions.canManageAdmins,false);
  const before=db.prepare('SELECT * FROM users ORDER BY id').all(),auditCount=db.prepare('SELECT COUNT(*) AS n FROM admin_audit_log').get().n;
  assert.equal((await create(db,f,'admin','forbidden_admin',login.cookie)).status,403);
  assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM admin_audit_log').get().n,auditCount);
  const staff=await create(db,f,'employee','secondary_staff',login.cookie);assert.equal(staff.status,201);
  assert.equal((await manage(db,f,staff.data.employee.id,'PUT',{name:'Mostrador Editado',username:'staff_edited'},login.cookie)).status,200);
  assert.equal((await manage(db,f,staff.data.employee.id,'PATCH',{active:false},login.cookie)).status,200);
  assert.equal((await manage(db,f,staff.data.employee.id,'DELETE',undefined,login.cookie)).status,200);
  assert.equal((await invoke(db,slug,'/api/account/profile',{method:'PATCH',cookie:login.cookie,body:{name:'Admin Nombre Nuevo'}})).status,200);
  // Even an identical/earlier creation date cannot make an audited team admin original.
  db.prepare('UPDATE users SET created_at=? WHERE id=?').run('1900-01-01',secondary.data.employee.id);
  assert.equal((await dashboard(db,f,login.cookie)).data.teamPermissions.primaryAdminId,f.admin.data.user.id);
  assert.equal((await create(db,f,'admin','still_forbidden',login.cookie)).status,403);
  assert.equal((await create(db,f,'admin','another_secondary')).status,201);
 }}finally{db.close();}
});

test('Only the initial admin edits, disables or deletes another Admin; original deletion/disable is blocked and history/credentials stay tenant-safe',async()=>{
 const db=schema();try{for(const slug of slugs){const f=await fixture(db,slug),a=await create(db,f,'admin','admin_a'),b=await create(db,f,'admin','admin_b'),id=a.data.employee.id;
  const aLogin=await invoke(db,slug,'/api/login/staff',{body:{username:'admin_a',password}}),bLogin=await invoke(db,slug,'/api/login/staff',{body:{username:'admin_b',password}});
  for(const target of [id,f.admin.data.user.id])for(const [method,body] of [['PUT',{name:'Nombre Manipulado',username:'manipulated'}],['PATCH',{active:false}],['DELETE',undefined]]){
   const before=db.prepare('SELECT * FROM users ORDER BY id').all(),sessions=db.prepare('SELECT * FROM sessions ORDER BY id').all(),audits=db.prepare('SELECT * FROM admin_audit_log ORDER BY id').all();
   assert.equal((await manage(db,f,target,method,body,bLogin.cookie)).status,403);
   assert.deepEqual(db.prepare('SELECT * FROM users ORDER BY id').all(),before);assert.deepEqual(db.prepare('SELECT * FROM sessions ORDER BY id').all(),sessions);assert.deepEqual(db.prepare('SELECT * FROM admin_audit_log ORDER BY id').all(),audits);
  }
  const initial=db.prepare('SELECT * FROM users WHERE id=?').get(f.admin.data.user.id);
  for(const [method,body] of [['PATCH',{active:false}],['DELETE',undefined]])assert.equal((await manage(db,f,initial.id,method,body)).data.error.code,'primary_admin_protected');
  assert.deepEqual(db.prepare('SELECT * FROM users WHERE id=?').get(initial.id),initial);
  const before=db.prepare('SELECT * FROM users WHERE id=?').get(id),cards=db.prepare('SELECT * FROM loyalty_cards ORDER BY id').all();
  const edit=await manage(db,f,id,'PUT',{name:'Admin Actualizado',username:'admin_edited'});assert.equal(edit.status,200);assert.equal(edit.data.employee.role,'admin');
  const after=db.prepare('SELECT * FROM users WHERE id=?').get(id);for(const field of ['id','business_id','role','secret_hash','secret_salt','secret_iterations','created_at'])assert.equal(after[field],before[field]);
  assert.equal((await invoke(db,slug,'/api/me',{cookie:aLogin.cookie})).status,401);
  assert.equal((await invoke(db,slug,'/api/login/staff',{body:{username:'admin_edited',password}})).status,200);
  assert.equal((await manage(db,f,id,'PATCH',{active:false})).status,200);assert.equal((await invoke(db,slug,'/api/login/staff',{body:{username:'admin_edited',password}})).status,401);
  assert.equal((await manage(db,f,id,'PATCH',{active:true})).status,200);const relogin=await invoke(db,slug,'/api/login/staff',{body:{username:'admin_edited',password}});assert.equal(relogin.status,200);
  assert.equal((await manage(db,f,id,'DELETE')).status,200);assert.equal((await invoke(db,slug,'/api/me',{cookie:relogin.cookie})).status,401);
  assert.equal(db.prepare('SELECT role FROM users WHERE id=?').get(id).role,'admin');assert.deepEqual(db.prepare('SELECT * FROM loyalty_cards ORDER BY id').all(),cards);
  const dash=(await dashboard(db,f)).data;assert.ok(dash.events.some(e=>e.event_type==='team_admin_updated'));assert.ok(dash.events.some(e=>e.event_type==='team_admin_deleted'));assert.equal(dash.teamPermissions.primaryAdminId,initial.id);assert.equal(dash.teamPermissions.canManageAdmins,true);
  // Renaming the initial account's username changes no ownership and uses normal login.
  assert.equal((await manage(db,f,initial.id,'PUT',{name:'Inicial Nombre Nuevo',username:'initial_renamed'})).status,200);
  const rootLogin=await invoke(db,slug,'/api/login/staff',{body:{username:'initial_renamed',password:'Fictitious-local-only-4826!'}});assert.equal(rootLogin.status,200);assert.equal((await dashboard(db,f,rootLogin.cookie)).data.teamPermissions.primaryAdminId,initial.id);
 }}finally{db.close();}
});

test('Initial-admin authority is per business, checked on the backend and never inherited when the original is inactive; extra fields cannot promote Staff',async()=>{
 const db=schema();try{const fixtures=[];for(const slug of slugs)fixtures.push(await fixture(db,slug));
  for(const f of fixtures){const a=await create(db,f,'admin','secondary'),id=a.data.employee.id,login=await invoke(db,f.slug,'/api/login/staff',{body:{username:'secondary',password}});
   for(const foreign of fixtures.filter(x=>x.slug!==f.slug))for(const [method,body] of [['PUT',{name:'Cross Tenant',username:'foreign'}],['PATCH',{active:false}],['DELETE',undefined]])assert.equal((await manage(db,f,foreign.admin.data.user.id,method,body)).status,404);
   for(const cookie of [f.staff.cookie,f.customer.cookie])for(const [method,body] of [['PUT',{name:'Privilege Attempt',username:'not_allowed'}],['PATCH',{active:false}],['DELETE',undefined]])assert.equal((await manage(db,f,id,method,body,cookie)).status,403);
   for(const body of [{name:'Mostrador Seguro',username:'staff',role:'admin'},{name:'Mostrador Seguro',username:'staff',business_id:'business_foreign'}])assert.equal((await manage(db,f,f.staff.data.user.id,'PUT',body)).status,400);
   assert.equal((await manage(db,f,id,'PATCH',{active:false,role:'employee'})).status,400);
   db.prepare('UPDATE users SET active=0 WHERE id=?').run(f.admin.data.user.id);
   const dash=await dashboard(db,f,login.cookie);assert.equal(dash.data.teamPermissions.primaryAdminId,f.admin.data.user.id);assert.equal(dash.data.teamPermissions.canManageAdmins,false);
   assert.equal((await create(db,f,'admin','no_inheritance',login.cookie)).status,403);
   assert.equal((await manage(db,f,id,'DELETE',undefined,login.cookie)).status,403);
  }
 }finally{db.close();}
});
