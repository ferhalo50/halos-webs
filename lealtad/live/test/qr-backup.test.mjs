import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {TENANTS} from '../worker/tenants.js';
import {tenantAssets} from '../worker/tenant-assets.js';

const publicRoot=path.resolve(import.meta.dirname,'../public');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const sizes=[[360,800],[390,844],[412,915],[430,932]];

// Serve the actual frontend with fictitious GET responses. No D1 or remote requests.
for(const slug of ['renace','mooncoffee','santofe','vainillacoffee'])test(`${slug}: static QR credential, final PNG decoding, share, ES/EN and mobile actions`,async t=>{
 const tenant=TENANTS[slug],unexpected=[],errors=[];
 const card={id:'EJEMPLO-LOCAL-'+tenant.cardPrefix,name:'Cliente de ejemplo',phone:'0000000000',stamps:3,goal:tenant.rewardGoal,reward:tenant.rewardName,stampPolicy:tenant.stampPolicy,stampStyle:slug==='mooncoffee'?'moon':Object.keys(tenant.stampStyles)[0],canStampToday:true,lastStampAt:'2026-10-01T12:00:00Z',qrValue:slug+':QR-FICTICIO-SOLO-LOCAL',rewardsPending:0,rewardChoicesPending:0,redeemedCount:0};
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1');
   if(req.method!=='GET'){unexpected.push(req.method+' '+url.pathname);res.writeHead(405);return res.end();}
   if(url.pathname.startsWith('/api/')){
    let value;
    if(url.pathname==='/api/me')value={ok:true,user:{id:'LOCAL-CUSTOMER',name:card.name,role:'customer',mustChangeSecret:false}};
    else if(url.pathname==='/api/card')value={ok:true,card};
    else{unexpected.push(url.pathname);res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(value));
   }
   const response=await tenantAssets(new Request('https://'+tenant.hostname+url.pathname+url.search),{TENANT:tenant,ASSETS:{fetch:async request=>{
    const name=new URL(request.url).pathname,file=path.resolve(publicRoot,'.'+(name==='/'?'/index.html':decodeURIComponent(name)));
    assert.ok(file.startsWith(publicRoot+path.sep));
    try{return new Response(await readFile(file),{headers:{'content-type':types[path.extname(file)]||'application/octet-stream'}});}catch{return new Response('',{status:404});}
   }}});
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){errors.push(error.message);res.writeHead(500);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage();
 await context.route('**/*',async route=>{if(!route.request().url().startsWith(base+'/')){unexpected.push(route.request().url());await route.abort();}else await route.continue();});
 await page.addInitScript(()=>{
  window.exportDrawing=[];
  for(const method of ['fillText','drawImage','arc']){
   const original=CanvasRenderingContext2D.prototype[method];
   CanvasRenderingContext2D.prototype[method]=function(...args){
    if(this.canvas.width===1080&&this.canvas.height===1580)window.exportDrawing.push({method,value:method==='drawImage'?args[0].src:args[0],args:args.slice(1)});
    return original.apply(this,args);
   };
  }
 });
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/#tarjeta');await page.waitForSelector('#qr svg',{state:'attached'});await page.waitForSelector('#app-loader',{state:'detached'});
 const progress=()=>page.locator(slug==='vainillacoffee'?'.personal-card .vainilla-flower-slot.is-earned':'.personal-card .stamp.filled');
 assert.equal(await progress().count(),3);
 const download=async()=>{
  await page.evaluate(()=>window.exportDrawing=[]);
  const pending=page.waitForEvent('download');await page.click('#download-card');const file=await pending,parts=[];
  assert.equal(file.suggestedFilename(),`tarjeta-${slug}.png`);
  for await(const part of await file.createReadStream())parts.push(part);
  const buffer=Buffer.concat(parts);
  const drawing=await page.evaluate(()=>window.exportDrawing);
  const decoded=await page.evaluate(async data=>{
   const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
   const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,image.width,image.height);
   return{width:image.width,height:image.height,qr:jsQR(pixels.data,image.width,image.height)?.data};
  },buffer.toString('base64'));
  assert.deepEqual(decoded,{width:1080,height:1580,qr:card.qrValue});
  assert.equal(drawing.filter(x=>x.method==='arc').length,0,'no stamp circles');
  assert.equal(drawing.filter(x=>x.method==='drawImage').length,2,'only logo and QR; no stamps, bouquet or flowers');
  assert.ok(drawing.some(x=>x.method==='drawImage'&&x.value.endsWith(tenant.logo)));
  return{buffer,texts:drawing.filter(x=>x.method==='fillText').map(x=>x.value)};
 };
 let spanish;
 for(const lang of ['es','en']){
  await page.evaluate(lang=>window.LoyaltyI18n.set(lang),lang);
  for(const [width,height] of sizes){
   await page.setViewportSize({width,height});
   const label=lang==='es'?'Descargar QR':'Download QR';assert.equal(await page.locator('#download-card').innerText(),label);
   const layout=await page.locator('.loyalty-quick-actions').evaluate(node=>({overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...node.children].map(button=>{const r=button.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(button);const line=range.getBoundingClientRect();return{height:r.height,width:r.width,left:r.left,right:r.right,lineHeight:line.height,fontSize:parseFloat(getComputedStyle(button).fontSize),overflow:button.scrollWidth>button.clientWidth};})}));
   assert.equal(layout.overflow,false);
   // Chromium may report a 44px target as 43.99997px after transforms.
   for(const b of layout.buttons){assert.ok(b.height>=43.99,`${slug} ${lang} ${width}: ${JSON.stringify(layout.buttons)}`);assert.ok(b.left>=0&&b.right<=width);assert.equal(b.overflow,false);assert.ok(b.lineHeight<b.fontSize*2,'action stays on one line');}
   assert.ok(Math.max(...layout.buttons.map(b=>b.height))-Math.min(...layout.buttons.map(b=>b.height))<=1,`actions stay aligned: ${slug} ${lang} ${width} ${JSON.stringify(layout.buttons)}`);
  }
  const image=await download();
  assert.deepEqual(image.texts,[tenant.displayName,lang==='es'?'MI QR DE LEALTAD':'MY LOYALTY QR',card.name,`${lang==='es'?'Celular':'Mobile'}: 000 000 0000`,lang==='es'?'Muestra este QR en mostrador':'Show this QR at the counter',lang==='es'?'Consulta tu progreso actualizado en la app o en caja.':'Check your current progress in the app or at the counter.',card.id]);
  if(lang==='es')spanish=image.buffer;
  await page.click('#role-guide');await page.waitForSelector('dialog[open]');
  const guide=await page.locator('dialog').innerText();assert.ok(guide.includes(lang==='es'?'sin sellos, progreso ni fechas':'without stamps, progress or dates'));assert.doesNotMatch(guide,/foto del progreso|foto del saldo|is a snapshot/);
  await page.keyboard.press('Escape');
 }
 await page.evaluate(()=>window.LoyaltyI18n.set('es'));await page.setViewportSize({width:390,height:844});
 if(process.env.QR_BACKUP_EVIDENCE){
  await mkdir(process.env.QR_BACKUP_EVIDENCE,{recursive:true});
  await page.waitForFunction(()=>!document.querySelector('#toast').textContent);
  await page.evaluate(()=>document.activeElement.blur());
  await page.locator('#download-card').evaluate(node=>node.scrollIntoView({block:'center'}));
  await page.screenshot({path:path.join(process.env.QR_BACKUP_EVIDENCE,slug+'-cliente.png')});
  await writeFile(path.join(process.env.QR_BACKUP_EVIDENCE,slug+'-qr.png'),spanish);
 }
 // Progress, rewards, dates and stamp style must never alter the backup credential.
 card.stamps=card.goal;card.lastStampAt='2026-10-08T23:59:00Z';card.rewardsPending=4;card.rewardChoicesPending=2;card.redeemedCount=7;card.stampStyle=Object.keys(tenant.stampStyles).find(style=>style!==card.stampStyle)||card.stampStyle;
 await page.click('#refresh-card');await page.waitForFunction(goal=>document.querySelectorAll('.personal-card .stamp.filled,.personal-card .vainilla-flower-slot.is-earned').length===goal,card.goal);
 assert.equal(await progress().count(),card.goal);assert.deepEqual((await download()).buffer,spanish);
 await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{window.sharedBytes=[...new Uint8Array(await data.files[0].arrayBuffer())];}});});
 await page.click('#share-card');await page.waitForFunction(()=>window.sharedBytes?.length>0);assert.deepEqual(Buffer.from(await page.evaluate(()=>window.sharedBytes)),spanish);
 await page.locator('.loyalty-card-details summary').click();assert.equal(await page.locator('.loyalty-card-details').evaluate(node=>node.open),true);await page.locator('.loyalty-card-details summary').click();
 await page.click('#install-app');await page.waitForSelector('dialog[open]');await page.keyboard.press('Escape');
 await page.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.installCalled=true;};e.userChoice=Promise.resolve({outcome:'accepted'});dispatchEvent(e);});
 await page.click('#install-app');assert.equal(await page.evaluate(()=>window.installCalled),true);assert.equal(await page.locator('#install-app').innerText(),'App instalada');
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
});
