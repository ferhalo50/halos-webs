import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {schema,fixture,invoke,server,slugs} from './reward-choice-fixture.mjs';

test('Four-tenant UI shows admin creation/management only to the initial Admin; secondary Admin still manages Staff and their own bilingual account',async t=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 for(const slug of slugs){const db=schema(),f=await fixture(db,slug),created=await invoke(db,slug,'/api/admin/employees',{cookie:f.admin.cookie,body:{name:'Admin Secundario',username:'secondary',password:'Fictitious-secondary-local-4832!',role:'admin'}}),secondary=await invoke(db,slug,'/api/login/staff',{body:{username:'secondary',password:'Fictitious-secondary-local-4832!'}}),host=await server(db,slug),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
  t.after(async()=>{await context.close();await new Promise(r=>host.app.close(r));db.close();});
  async function view(account,route){await context.clearCookies();const [name,value]=account.cookie.split('=');await context.addCookies([{name,value,url:host.base}]);await page.goto(host.base+'/?identity='+account.data.user.id+'#'+route);await page.waitForSelector(route==='admin'?'#employee-form':'#profile-form');await page.waitForSelector('#app-loader',{state:'detached'});}
  await view(f.admin,'admin');assert.deepEqual(await page.locator('#employee-form option').evaluateAll(nodes=>nodes.map(n=>n.value)),['employee','admin']);
  const initialRow=page.locator('.team-row').filter({has:page.locator(`[data-id="${f.admin.data.user.id}"]`)});assert.ok((await initialRow.innerText()).includes('Administrador inicial'));assert.equal(await initialRow.locator('.delete-employee,.toggle').count(),0);
  assert.equal(await page.locator(`.edit-employee[data-id="${created.data.employee.id}"]`).count(),1);assert.equal(await page.locator(`.delete-employee[data-id="${created.data.employee.id}"]`).count(),1);
  if(slug==='renace'&&process.env.INITIAL_ADMIN_EVIDENCE){mkdirSync(process.env.INITIAL_ADMIN_EVIDENCE,{recursive:true});await page.setViewportSize({width:1440,height:900});await page.locator('.team-panel').screenshot({path:process.env.INITIAL_ADMIN_EVIDENCE+'/01-inicial-gestiona-admins.png'});await page.setViewportSize({width:390,height:844});}
  await view(secondary,'admin');assert.deepEqual(await page.locator('#employee-form option').evaluateAll(nodes=>nodes.map(n=>n.value)),['employee']);assert.equal(await page.locator(`.edit-employee[data-id="${created.data.employee.id}"],.delete-employee[data-id="${f.admin.data.user.id}"]`).count(),0);assert.equal(await page.locator(`.edit-employee[data-id="${f.staff.data.user.id}"]`).count(),1);
  for(const [width,height] of [[360,800],[390,844],[393,852],[412,915],[1440,900]]){await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.evaluate(()=>window.LoyaltyI18n.set('en'));assert.deepEqual(await page.locator('#employee-form option').allTextContents(),['Staff']);assert.ok((await page.locator('.team-panel').innerText()).includes('Only the initial administrator can manage administrators.'));
  if(slug==='renace'&&process.env.INITIAL_ADMIN_EVIDENCE){await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.LoyaltyI18n.set('es'));await page.locator('.team-panel').screenshot({path:process.env.INITIAL_ADMIN_EVIDENCE+'/02-secundario-solo-mostrador.png'});}
  // Manipulating the DOM cannot bypass the backend permission.
  const forced=await context.request.post(host.base+'/api/admin/employees',{data:{name:'Forged Admin',username:'forged_admin',password:'Fictitious-secondary-local-4832!',role:'admin'}});assert.equal(forced.status(),403);
  await view(secondary,'cuenta');await page.fill('#profile-form input','Secundario Nombre Nuevo');await page.click('#profile-form button');await page.waitForFunction(()=>document.querySelector('[data-account-name]')?.textContent==='Secundario Nombre Nuevo');
  assert.equal((await context.request.get(host.base+'/api/me')).status(),200);
 }
});
