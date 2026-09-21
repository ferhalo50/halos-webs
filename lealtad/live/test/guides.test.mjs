import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:8787';
test('role guides, focus, QR share and PWA installation states',async t=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());
  const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const phone='663'+String(Date.now()).slice(-7);
  const r=await ctx.request.post(base+'/api/register',{data:{name:'Guías de prueba',phone,pin:'4826'}});assert.equal(r.status(),201);
  await page.goto(base+'/#tarjeta');await page.waitForSelector('#qr svg');await page.waitForSelector('#app-loader',{state:'detached'});
  await page.click('#role-guide');await page.waitForSelector('dialog[open]');
  assert.match(await page.locator('dialog').innerText(),/9 sellos[\s\S]*10.º café/);
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('guide-close')),true);
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('dialog')||document.activeElement.tagName==='BODY'),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.RENACE_SCREENSHOTS)await page.screenshot({path:process.env.RENACE_SCREENSHOTS+'/card-guide-mobile.png'});
  await page.keyboard.press('Escape');await page.waitForSelector('dialog',{state:'detached'});assert.equal(await page.evaluate(()=>document.activeElement.id),'role-guide');
  await page.click('#install-app');assert.match(await page.locator('dialog').innerText(),/menú del navegador/);await page.keyboard.press('Escape');
  await page.evaluate(()=>{const event=new Event('beforeinstallprompt',{cancelable:true});event.prompt=async()=>{window.promptCalled=true;};event.userChoice=Promise.resolve({outcome:'dismissed'});dispatchEvent(event);});
  await page.click('#install-app');assert.equal(await page.evaluate(()=>window.promptCalled),true);assert.equal(await page.locator('#install-app').isEnabled(),true);
  await page.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{};e.userChoice=Promise.resolve({outcome:'accepted'});dispatchEvent(e);});
  await page.click('#install-app');assert.equal(await page.locator('#install-app').innerText(),'App instalada');
  await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.sharedCard={name:data.files[0].name,size:data.files[0].size,type:data.files[0].type};}});});
  await page.click('#share-card');await page.waitForFunction(()=>window.sharedCard?.size>0);assert.equal(await page.evaluate(()=>window.sharedCard.type),'image/png');
  await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Cancelled','AbortError');}});});await page.click('#share-card');await page.waitForSelector('#share-card:not([disabled])');
  for(const [username,password,route,text] of [['mostrador_local','Staff-test-928!','empleado','Escanear todavía no añade un sello'],['admin_local','Admin-test-928!','admin','Recompensas pendientes']]){
    await ctx.request.post(base+'/api/logout');await ctx.request.post(base+'/api/login/staff',{data:{username,password}});await page.goto(base+'/?role='+route+'#'+route);await page.waitForSelector('#role-guide');await page.click('#role-guide');assert.ok((await page.locator('dialog').innerText()).includes(text));await page.keyboard.press('Escape');
  }
  const ios=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  await ios.request.post(base+'/api/login/customer',{data:{phone,pin:'4826'}});const iosPage=await ios.newPage();await iosPage.goto(base+'/#tarjeta');await iosPage.click('#install-app');assert.match(await iosPage.locator('dialog').innerText(),/Compartir ↑[\s\S]*Agregar a pantalla de inicio/);
  await iosPage.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true});});await iosPage.reload();await iosPage.waitForSelector('#install-app:disabled');
  const standalone=await browser.newContext();await standalone.request.post(base+'/api/login/customer',{data:{phone,pin:'4826'}});const sp=await standalone.newPage();await sp.addInitScript(()=>{const native=window.matchMedia;window.matchMedia=q=>q==='(display-mode: standalone)'?{matches:true,addEventListener(){}}:native(q);});await sp.goto(base+'/#tarjeta');await sp.waitForSelector('#install-app:disabled');
  assert.deepEqual(errors,[]);
});
