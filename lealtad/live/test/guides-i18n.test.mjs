import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {schema,fixture,invoke,server,slugs} from './reward-choice-fixture.mjs';

test('All tenant role guides explain own-name changes and initial/additional Admin permissions in ES/EN without exposing Admin controls',async t=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 for(const slug of slugs){const db=schema(),f=await fixture(db,slug),host=await server(db,slug),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
  try{
   const created=await invoke(db,slug,'/api/admin/employees',{cookie:f.admin.cookie,body:{name:'Admin Ficticio',role:'admin',username:'secondary',password:'Fictitious-secondary-local-4832!'}});assert.equal(created.status,201);
   const secondary=await invoke(db,slug,'/api/login/staff',{body:{username:'secondary',password:'Fictitious-secondary-local-4832!'}});let sequence=0;
   for(const [role,account,route] of [['customer',f.customer,'tarjeta'],['employee',f.staff,'empleado'],['admin',f.admin,'admin'],['secondary',secondary,'admin']]){
    await context.clearCookies();const [name,value]=account.cookie.split('=');await context.addCookies([{name,value,url:host.base}]);await page.goto(host.base+'/?guide='+ ++sequence+'#'+route);await page.waitForSelector('#role-guide');await page.waitForSelector('#app-loader',{state:'detached'});
    for(const locale of ['es','en']){
     await page.evaluate(locale=>window.LoyaltyI18n.set(locale),locale);await page.click('#role-guide');const dialog=page.locator('#renace-guide');await dialog.waitFor();const text=await dialog.innerText();
     assert.ok(text.includes(locale==='es'?'Mi cuenta → Cambiar nombre':'My account → Change name'));assert.ok(text.includes(locale==='es'?'Guardar nombre':'Save name'));assert.ok(text.includes(locale==='es'?'no cierra tu sesión':'does not sign you out'));
     if(role==='admin'||role==='secondary'){
      assert.ok(text.includes(locale==='es'?'Solo el administrador inicial':'Only the initial administrator'));assert.ok(text.includes(locale==='es'?'no ven esas opciones ni pueden utilizarlas':'cannot see or use those options'));assert.ok(text.includes(locale==='es'?'no puede eliminarse ni desactivarse':'cannot be deleted or deactivated'));
     }
     if(locale==='en')assert.doesNotMatch(text,/\b(Cambiar tu nombre|Guardar nombre|administrador inicial|administradores adicionales)\b/i);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await dialog.locator('.guide-close').innerText(),locale==='es'?'Cerrar ✕':'Close ✕');
     await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.activeElement.id),'role-guide');
    }
    if(role==='secondary'){assert.deepEqual(await page.locator('#employee-form option').evaluateAll(nodes=>nodes.map(n=>n.value)),['employee']);assert.equal(await page.locator('.team-row:has([data-team-role="admin"]) .row-actions').count(),0);}
   }
  }finally{await context.close();await new Promise(resolve=>host.app.close(resolve));db.close();}
 }
});

test('Public sample card accessible labels translate completely, real customer names remain unchanged and account errors are bilingual',async t=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 const errors={
  'Solo el administrador inicial puede gestionar administradores.':'Only the initial administrator can manage administrators.',
  'No puedes eliminar ni desactivar al administrador inicial.':'You cannot delete or deactivate the initial administrator.',
  'Escribe un nombre válido de 2 a 60 caracteres.':'Enter a valid name with 2 to 60 characters.',
  'Solo puedes cambiar tu nombre desde aquí.':'You can only change your name here.',
  'Solo puedes editar el nombre y usuario de esta cuenta.':'You can only edit this account’s name and username.',
  'Administrador actualizado. Se cerró su sesión por seguridad.':'Administrator updated. Their session was closed for security.',
  'Administrador eliminado':'Administrator deleted','Administrador creado':'Administrator created','Nombre de cuenta actualizado':'Account name updated',
  '9 visitas · Un café de regalo':'9 visits · One complimentary coffee','Sello Moño':'Stamp Bow','Sello Vaquero':'Stamp Cowboy','Sello Clásico':'Stamp Classic','Sello Luna':'Stamp Moon','Sello Santofé':'Stamp Santofé'
 };
 for(const slug of slugs){const db=schema(),f=await fixture(db,slug),host=await server(db,slug),context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
  try{
   await page.goto(host.base+'/');await page.waitForSelector('#app-loader',{state:'detached'});const sample=page.locator('[data-i18n-sample-card]');
   for(const locale of ['en','es','en']){await page.evaluate(locale=>window.LoyaltyI18n.set(locale),locale);if(slug!=='renace'){const label=await sample.getAttribute('aria-label');assert.ok(label.includes(locale==='es'?'Tarjeta de lealtad':'Loyalty card'));if(locale==='en')assert.doesNotMatch(label,/Tu próxima|Tu próximo|tarjeta de lealtad/);}}
   for(const [spanish,english] of Object.entries(errors))assert.equal(await page.evaluate(text=>window.LoyaltyI18n.text(text),spanish),english);
   // A real name may equal demo copy; only public samples may translate it.
   const customerName=slug==='vainillacoffee'?'Tu próximo ramo empieza aquí':'Tu próxima pausa favorita';db.prepare('UPDATE users SET name=? WHERE id=?').run(customerName,f.customer.data.user.id);
   const [name,value]=f.customer.cookie.split('=');await context.addCookies([{name,value,url:host.base}]);await page.goto(host.base+'/?customer=real#tarjeta');await page.waitForSelector('#flip-card');await page.waitForSelector('#app-loader',{state:'detached'});
   for(const locale of ['en','es']){await page.evaluate(locale=>window.LoyaltyI18n.set(locale),locale);assert.ok((await page.locator('.personal-card [data-i18n-ignore]').allTextContents()).includes(customerName));if(slug!=='renace'){const label=await page.locator('.personal-card article.card[aria-label]').filter({has:page.locator('.stamps,.vainilla-bouquet')}).getAttribute('aria-label');assert.ok(label.includes(customerName));}}
  }finally{await context.close();await new Promise(resolve=>host.app.close(resolve));db.close();}
 }
});
