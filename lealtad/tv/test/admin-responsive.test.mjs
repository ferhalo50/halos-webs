import {localTvUrl} from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const sizes=[[360,800],[390,844],[412,915],[430,932],[768,1024],[1180,820],[1920,1080]];
const output=process.env.TV_SCREENSHOTS;if(output)await mkdir(output,{recursive:true});
const launch=engine=>(engine==='chromium'?chromium:webkit).launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
async function login(page,site){
 await page.goto(localTvUrl(site)+'/admin');
 await page.fill('#username',`demo_${site}`);await page.fill('#password',`Demo-${site}-TV-2026!`);await page.click('#login-form button');await page.waitForSelector('.photo-duration-editor');
}
for(const engine of ['chromium','webkit'])for(const site of ['renace','santofe'])test(`${engine} ${site}: mobile admin, photo-only editing, validation, single save, navigation`,async t=>{
 const browser=await launch(engine);t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await login(page,site);assert.equal(await page.locator('body').getAttribute('data-tv-site'),site);
 const base=localTvUrl(site);
 const before=await (await context.request.get(base+'/admin/api/content')).json();
 assert.equal(await page.locator('.photo-duration-editor').count(),before.items.filter(x=>x.type==='image').length);
 for(const video of before.items.filter(x=>x.type==='video'))assert.equal(await page.locator(`[data-id="${video.id}"] input`).count(),0);
 for(const [width,height]of sizes){
  await page.setViewportSize({width,height});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}x${height}`);
  for(const control of [page.locator('.photo-duration-editor input').first(),page.locator('.photo-duration-editor button').first(),page.locator('.row-actions button').first(),page.getByRole('link',{name:'Inicio',exact:true})]){
   const b=await control.boundingBox();assert.ok(b.width>=44&&b.height>=44,JSON.stringify(b));
  }
 }
 // Large text must reflow rather than clip actions.
 await page.setViewportSize({width:360,height:800});
 const reflows=await page.evaluate(()=>{const sheet=document.styleSheets[0],index=sheet.insertRule('body{font-size:200%}',sheet.cssRules.length);const result={fits:document.documentElement.scrollWidth<=innerWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1 || (e.clientWidth>0 && e.scrollWidth>e.clientWidth+1)).map(e=>e.className||e.id||e.tagName)};sheet.deleteRule(index);return result;});assert.equal(reflows.fits,true,JSON.stringify(reflows));
 const form=page.locator('.photo-duration-editor').first();let requests=0;page.on('request',r=>{if(r.method()==='PATCH'&&r.url().endsWith('/duration'))requests++;});
 for(const value of ['0','-1','1.5','301','']){await form.locator('input').fill(value);await form.locator('button').click();assert.match(await form.locator('.duration-message').innerText(),/1 y 300/);}assert.equal(requests,0);
 const photo=before.items.find(x=>x.type==='image');
 try{
  await form.locator('input').fill('12');await form.locator('button').click();await form.locator('.duration-message').filter({hasText:'Guardado.'}).waitFor();assert.equal(requests,1);
  const saved=(await (await context.request.get(base+'/admin/api/content')).json()).items.find(x=>x.id===photo.id);assert.equal(saved.durationSeconds,12);assert.equal(saved.durationRevision,photo.durationRevision+1);
  if(output&&engine==='chromium'){
   await page.reload();await page.waitForSelector('.photo-duration-editor');await page.screenshot({path:`${output}/${site}-admin-movil.png`,fullPage:true});
   await page.setViewportSize({width:1180,height:820});await page.screenshot({path:`${output}/${site}-admin-tablet.png`,fullPage:true});
  }
 }finally{
  const latest=(await (await context.request.get(base+'/admin/api/content')).json()).items.find(x=>x.id===photo.id);
  assert.equal((await context.request.patch(`${base}/admin/api/content/${photo.id}/duration`,{headers:{origin:base},data:{durationSeconds:photo.durationSeconds??10,revision:latest.durationRevision}})).status(),200);
 }
 await page.getByRole('link',{name:'Inicio',exact:true}).click();await page.waitForSelector('.media-card');assert.equal(await page.locator('.photo-duration-editor,#duration-login,#edit-durations').count(),0);assert.deepEqual(errors,[]);
});

test('admin duration network error, duplicate submit guard and late result after logout',async t=>{
 const browser=await launch('chromium');t.after(()=>browser.close());const page=await browser.newPage({serviceWorkers:'block'});await login(page,'santofe');
 await page.route('**/admin/api/content/*/duration',r=>r.abort());
 const form=page.locator('.photo-duration-editor').first();await form.locator('input').fill('15');await form.locator('button').click();await form.locator('.duration-message').filter({hasText:'Sin conexión'}).waitFor();assert.equal(await form.locator('button').isEnabled(),true);
 await page.unroute('**/admin/api/content/*/duration');
 let release;const held=new Promise(r=>release=r);let requests=0;
 await page.route('**/admin/api/content/*/duration',async r=>{requests++;await held;await r.fulfill({json:{ok:true,revision:999}});});
 await form.locator('button').click();await page.waitForFunction(()=>document.querySelector('.photo-duration-editor button')?.disabled);
 await form.evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(requests,1);
 await page.click('#logout');await page.waitForSelector('#login-panel:not([hidden])');release();await page.waitForTimeout(200);
 assert.equal(await page.locator('#dashboard').isHidden(),true);assert.equal(await page.locator('.photo-duration-editor').count(),0);
});

test('mobile admin uploads, toggles, reorders and confirms selective deletion',async t=>{
 const browser=await launch('chromium');t.after(()=>browser.close());const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
 await login(page,'santofe');const base=localTvUrl('santofe');
 const before=await (await context.request.get(base+'/admin/api/content')).json();
 await page.setInputFiles('#upload-file',fileURLToPath(new URL('../.local-tv/santofe/fixtures/Horizontal.png',import.meta.url)));
 await page.click('#upload-button');await page.waitForFunction(n=>document.querySelectorAll('.media-row').length===n,before.items.length+1);
 const added=(await (await context.request.get(base+'/admin/api/content')).json()).items.find(x=>!before.items.some(y=>y.id===x.id));assert.ok(added);
 const row=()=>page.locator(`[data-id="${added.id}"]`);
 await row().getByRole('button',{name:'Desactivar',exact:true}).click();await row().getByRole('button',{name:'Activar',exact:true}).waitFor();
 assert.equal((await (await context.request.get(base+'/playlist.json')).json()).items.some(x=>x.id===added.id),false);
 await row().getByRole('button',{name:'Activar',exact:true}).click();await row().getByRole('button',{name:'Desactivar',exact:true}).waitFor();
 await row().getByRole('button',{name:`Subir ${added.name} en el orden`,exact:true}).click();
 await page.waitForFunction(id=>[...document.querySelectorAll('.media-row')].at(-2)?.dataset.id===id,added.id);
 page.once('dialog',dialog=>dialog.dismiss());await row().getByRole('button',{name:'Eliminar',exact:true}).click();assert.equal(await row().count(),1);
 page.once('dialog',dialog=>dialog.accept());await row().getByRole('button',{name:'Eliminar',exact:true}).click();await row().waitFor({state:'detached'});
 const after=await (await context.request.get(base+'/admin/api/content')).json();assert.deepEqual(after.items.map(x=>x.id),before.items.map(x=>x.id));assert.equal(after.storage.usedBytes,before.storage.usedBytes);assert.equal(after.storage.reservedBytes,0);
});

for(const engine of ['chromium','webkit'])test(`${engine}: actual stage ratios in landscape/portrait, auto equivalence and CSS rotation`,async t=>{
 const browser=await launch(engine);t.after(()=>browser.close());const page=await browser.newPage({serviceWorkers:'block'});
 await page.goto(localTvUrl('santofe'));await page.waitForSelector('.media-card');
 for(const [w,h]of [[1280,720],[720,1280]]){
  await page.setViewportSize({width:w,height:h});
  for(const mode of ['auto','horizontal','vertical']){
   await page.click(`button[data-orientation="${mode}"]`);await page.click('#play-all');await page.waitForFunction(()=>document.querySelector('#media-stage img')?.naturalWidth>0);
   const rect=await page.locator('#media-stage').evaluate(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height,viewport:innerWidth/innerHeight};});
   const ratio=mode==='auto'?rect.viewport:mode==='horizontal'?16/9:9/16;assert.ok(Math.abs(rect.w/rect.h-ratio)<.01);
   assert.equal(await page.locator('#media-stage img').evaluate(e=>getComputedStyle(e).objectFit),'contain');
   if(output&&engine==='chromium')await page.screenshot({path:`${output}/orientacion-${w}x${h}-${mode}.png`});
   await page.keyboard.press('Escape');await page.waitForSelector('#presentation',{state:'hidden'});
  }
 }
});
