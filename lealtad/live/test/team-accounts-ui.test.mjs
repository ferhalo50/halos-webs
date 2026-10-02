import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import ExcelJS from 'exceljs';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {schema,fixture,invoke,action,server,slugs} from './reward-choice-fixture.mjs';
const sizes=[[360,800],[390,844],[393,852],[412,915],[1366,768],[1440,900]];
const evidence=process.env.TEAM_ACCOUNTS_EVIDENCE,password='Fictitious-team-local-4832!';
async function shot(page,name,selector){if(!evidence)return;mkdirSync(evidence,{recursive:true});await page.evaluate(()=>window.LoyaltyI18n.set('es'));await page.waitForSelector('#app-loader',{state:'detached'});if(selector)await page.locator(selector).screenshot({path:evidence+'/'+name+'.png'});else{if(/^(01|02|03|10)-/.test(name))await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:evidence+'/'+name+'.png'});}}
async function fit(page,selector){for(const [width,height] of sizes){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'overflow '+width);if(selector){const box=await page.locator(selector).boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);}}await page.setViewportSize({width:390,height:844});}
async function view(context,page,host,account,route){await context.clearCookies();const [name,value]=account.cookie.split('=');await context.addCookies([{name,value,url:host.base}]);await page.goto(host.base+'/?view='+encodeURIComponent(account.data.user.id)+'#'+route);await page.waitForSelector(route==='cuenta'?'#profile-form':'#employee-form');await page.waitForSelector('#app-loader',{state:'detached'});}
async function local(t,slug){const db=schema(),f=await fixture(db,slug),host=await server(db,slug),browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(async()=>{await browser.close();await new Promise(r=>host.app.close(r));db.close();assert.deepEqual(errors,[]);});return{db,f,host,context,page};}

test('All four tenants: Admin/Staff own-name UI preserves ES/EN drafts, credential inputs, cookie and current Team/Activity name at mobile/desktop widths',async t=>{
 for(const slug of slugs){const {db,f,host,context,page}=await local(t,slug);await action(db,f,'stamp',{quantity:1});
  for(const [account,name] of [[f.admin,'Ana Admin Local'],[f.staff,'José Mostrador Local']]){
   await view(context,page,host,account,'cuenta');await fit(page,'#profile-form');
   await page.fill('#profile-form input','  '+name+'  ');await page.fill('[name="currentSecret"]','Unsent-draft-only');await page.fill('[name="newSecret"]','Another-unsent-draft');
   await page.evaluate(()=>window.LoyaltyI18n.set('en'));assert.equal(await page.locator('.profile-panel h2').innerText(),'Change name');assert.equal(await page.locator('#profile-form button').innerText(),'Save name');assert.equal(await page.inputValue('#profile-form input'),'  '+name+'  ');
   await page.evaluate(()=>window.LoyaltyI18n.set('es'));if(slug==='renace')await shot(page,account===f.admin?'01-admin-editando':'03-mostrador-editando');
   let requests=0;const listener=req=>{if(req.url().endsWith('/api/account/profile')&&req.method()==='PATCH')requests++;};page.on('request',listener);
   await page.locator('#profile-form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
   await page.waitForFunction(name=>document.querySelector('[data-account-name]')?.textContent===name,name);assert.equal(requests,1);page.off('request',listener);
   assert.equal(await page.inputValue('[name="currentSecret"]'),'Unsent-draft-only');assert.equal(await page.inputValue('[name="newSecret"]'),'Another-unsent-draft');assert.equal((await context.cookies()).find(c=>c.name===account.cookie.split('=')[0]).value,account.cookie.split('=')[1]);
   if(slug==='renace'&&account===f.admin)await shot(page,'02-admin-nombre-actualizado');
   assert.equal((await context.request.get(host.base+'/api/me')).status(),200);
  }
  await view(context,page,host,f.admin,'admin');assert.ok((await page.locator('.team-panel').innerText()).includes('Ana Admin Local'));assert.ok((await page.locator('.team-panel').innerText()).includes('José Mostrador Local'));assert.ok((await page.locator('.activity-panel').innerText()).includes('José Mostrador Local'));await fit(page,'.team-panel');
  await view(context,page,host,f.staff,'cuenta');await fit(page,'#profile-form');assert.equal(await page.locator('#profile-form input').inputValue(),'José Mostrador Local');
  // Focused controls scroll into view above the mobile navigation; blur restores it.
  await page.locator('[name="confirmSecret"]').focus();await page.locator('[name="confirmSecret"]').scrollIntoViewIfNeeded();assert.ok((await page.locator('[name="confirmSecret"]').boundingBox()).y>=0);await page.locator('[name="confirmSecret"]').blur();
  if(slug==='renace'){await page.evaluate(()=>scrollTo(0,0));await shot(page,'10-mi-cuenta-movil');}
 }
});

test('All four tenants: role defaults to Staff, Admin confirmation is accessible/bilingual, cancellation preserves drafts and double submit creates exactly one account',async t=>{
 for(const slug of slugs){const {db,f,host,context,page}=await local(t,slug);await view(context,page,host,f.admin,'admin');
  assert.equal(await page.inputValue('#employee-form [name="role"]'),'employee');assert.equal(await page.locator('.team-admin-warning').isVisible(),false);
  await page.fill('#employee-form [name="name"]','Ana Sofía Local');await page.fill('#employee-form [name="username"]','new_admin_local');await page.fill('#employee-form [name="password"]',password);
  if(slug==='renace')await shot(page,'04-equipo-crear-usuario','.team-panel');
  await page.selectOption('#employee-form [name="role"]','admin');assert.equal(await page.locator('.team-admin-warning').isVisible(),true);
  await page.evaluate(()=>window.LoyaltyI18n.set('en'));assert.deepEqual(await page.locator('#employee-form option').allTextContents(),['Staff','Administrator']);assert.equal(await page.inputValue('#employee-form [name="role"]'),'admin');assert.equal(await page.inputValue('#employee-form [name="password"]'),password);
  await page.evaluate(()=>window.LoyaltyI18n.set('es'));assert.deepEqual(await page.locator('#employee-form option').allTextContents(),['Mostrador','Administrador']);if(slug==='renace')await shot(page,'05-rol-administrador','.team-panel');
  await fit(page,'#employee-form');let writes=0;page.on('request',req=>{if(req.url().endsWith('/api/admin/employees')&&req.method()==='POST')writes++;});
  await page.click('#employee-form button');await page.waitForSelector('.team-confirm-dialog[open]');assert.equal(writes,0);assert.equal(await page.locator('.team-confirm-dialog input[type="password"]').count(),0);assert.ok(!(await page.locator('.team-confirm-dialog').innerText()).includes(password));
  for(const [width,height] of sizes){await page.setViewportSize({width,height});const b=await page.locator('.team-confirm-dialog').boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=width+1&&b.y+b.height<=height+1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.setViewportSize({width:390,height:844});if(slug==='renace')await shot(page,'06-confirmacion-administrador');
  await page.evaluate(()=>window.LoyaltyI18n.set('en'));assert.equal(await page.locator('#team-confirm-title').innerText(),'Create administrator');assert.ok((await page.locator('.team-confirm-dialog').innerText()).includes('An administrator will have access to business settings and management.'));
  await page.keyboard.press('Escape');await page.waitForSelector('.team-confirm-dialog',{state:'detached'});assert.equal(writes,0);assert.equal(await page.inputValue('#employee-form [name="password"]'),password);assert.equal(await page.inputValue('#employee-form [name="role"]'),'admin');
  await page.locator('#employee-form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});await page.waitForSelector('.team-confirm-dialog[open]');await page.click('.team-confirm-dialog [value="create"]');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.team-identity')).some(n=>n.textContent.includes('new_admin_local')));assert.equal(writes,1);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE username='new_admin_local'").get().n,1);
  const team=await page.locator('.team-panel').innerText();assert.ok(team.includes('Administrator')&&team.includes('Staff')&&team.includes('Active'));assert.equal(await page.inputValue('#employee-form [name="role"]'),'employee');assert.equal(await page.inputValue('#employee-form [name="password"]'),'');
  if(slug==='renace'){await page.setViewportSize({width:1440,height:900});await shot(page,'07-equipo-admin-mostrador','.team-panel');await page.setViewportSize({width:390,height:844});await page.locator('.team-panel h2').scrollIntoViewIfNeeded();await shot(page,'09-equipo-movil');}
  // The same form still creates Staff without an Admin confirmation.
  await page.fill('#employee-form [name="name"]','Mostrador Local');await page.fill('#employee-form [name="username"]','new_staff_local');await page.fill('#employee-form [name="password"]',password);await page.click('#employee-form button');await page.waitForFunction(()=>Array.from(document.querySelectorAll('.team-identity')).some(n=>n.textContent.includes('new_staff_local')));assert.equal(await page.locator('.team-confirm-dialog').count(),0);assert.equal(writes,2);
 }
});

test('New account creation/name audit labels and current actor names appear in bilingual Activity and actual XLSX without credentials',async t=>{
 for(const slug of slugs){const {db,f,host,context,page}=await local(t,slug);
  const created=await invoke(db,slug,'/api/admin/employees',{cookie:f.admin.cookie,body:{name:'Nuevo Admin Local',username:'activity_admin',role:'admin',password}});assert.equal(created.status,201);
  await invoke(db,slug,'/api/account/profile',{method:'PATCH',cookie:f.admin.cookie,body:{name:'Ana Responsable Local'}});
  await view(context,page,host,f.admin,'admin');await fit(page,'.activity-panel');
  const creation=page.locator('.activity-table tr').filter({has:page.locator('.activity-type--team_admin_created')});assert.ok((await creation.innerText()).includes('Administrador creado'));assert.ok((await creation.innerText()).includes('Ana Responsable Local'));
  if(slug==='renace'){await page.setViewportSize({width:1440,height:900});await shot(page,'08-actividad-creacion-y-responsable-actual','.activity-panel');await page.setViewportSize({width:390,height:844});await creation.scrollIntoViewIfNeeded();await shot(page,'11-actividad-responsable-actual','.activity-table tr:has(.activity-type--team_admin_created)');}
  for(const locale of ['es','en']){await page.evaluate(locale=>window.LoyaltyI18n.set(locale),locale);
   assert.ok((await creation.innerText()).includes(locale==='en'?'Administrator created':'Administrador creado'));
   const pending=page.waitForEvent('download');await page.click('#export-events');const download=await pending,parts=[];for await(const part of await download.createReadStream())parts.push(part);const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.concat(parts));const values=[];for(const ws of wb.worksheets)for(let i=5;i<=ws.rowCount;i++)values.push(ws.getRow(i).values);
   assert.ok(values.some(r=>r.includes(locale==='en'?'Administrator created':'Administrador creado')&&r.includes('Ana Responsable Local')));assert.ok(values.some(r=>r.includes(locale==='en'?'Account name updated':'Nombre de cuenta actualizado')));
   for(const secret of [password,'secret_hash','secret_salt','renace_session'])assert.ok(!JSON.stringify(values).includes(secret));
  }
 }
});
