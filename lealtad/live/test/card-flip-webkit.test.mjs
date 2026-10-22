import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {schema,fixture,server,slugs} from './reward-choice-fixture.mjs';
const sizes=[[360,800],[390,844],[393,852],[430,932],[1366,768]];
const output=process.env.LOYALTY_FLIP_EVIDENCE_DIR;
async function opened(engine,slug,reduced=false){
 const db=schema(),f=await fixture(db,slug),{app,base}=await server(db,slug);
 const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'msedge'}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
 const unexpected=[];await context.route('**/*',route=>{const request=route.request();if(!request.url().startsWith(base+'/'))return route.abort();if(request.method()!=='GET')unexpected.push(request.method()+' '+new URL(request.url()).pathname);return route.continue();});
 const[name,value]=f.customer.cookie.split('=');await context.addCookies([{name,value,url:base}]);
 const page=await context.newPage();if(reduced)await page.addInitScript(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
 await page.goto(base+'/#tarjeta');await page.waitForSelector('#qr svg',{state:'attached'});await page.waitForSelector('#app-loader',{state:'detached'});
 return {db,f,app,base,browser,page,unexpected};
}
async function settled(page,back){
 await page.waitForFunction(back=>{const card=document.querySelector('[data-loyalty-flip]'),f=card?.querySelector('.loyalty-card-front,.santofe-card-front'),b=card?.querySelector('.loyalty-card-back,.santofe-card-back');return f&&b&&getComputedStyle(f).visibility===(back?'hidden':'visible')&&getComputedStyle(b).visibility===(back?'visible':'hidden')&&[f,b].every(x=>x.getAnimations().every(a=>a.playState==='finished'));},back);
}
async function assertFace(page,back){
 const result=await page.locator('[data-loyalty-flip]').evaluate((card,back)=>{
  const face=card.querySelector(back?'.loyalty-card-back,.santofe-card-back':'.loyalty-card-front,.santofe-card-front'),inactive=card.querySelector(back?'.loyalty-card-front,.santofe-card-front':'.loyalty-card-back,.santofe-card-back'),a=face.getBoundingClientRect(),c=card.getBoundingClientRect();
  return {active:getComputedStyle(face).visibility,inactive:getComputedStyle(inactive).visibility,descendantsHidden:[...inactive.querySelectorAll('*')].every(x=>getComputedStyle(x).visibility==='hidden'),size:[a.width,a.height],layout:[face.offsetWidth,face.offsetHeight],inactiveLayout:[inactive.offsetWidth,inactive.offsetHeight],card:[c.width,c.height],facing:new DOMMatrixReadOnly(getComputedStyle(face).transform).m11,overflow:document.documentElement.scrollWidth>innerWidth};
 },back);
 assert.equal(result.active,'visible');assert.equal(result.inactive,'hidden');assert.equal(result.descendantsHidden,true);assert.equal(result.facing,1);assert.equal(result.overflow,false);
 // Santofé already reserves a 250px minimum outer area on small screens.
 // Preserve both face layouts; their actual painted size must not distort/clip.
 assert.deepEqual(result.layout,result.inactiveLayout);
 assert.ok(result.size.every((v,i)=>Math.abs(v-result.layout[i])<1&&v<=result.card[i]+1),JSON.stringify(result));
}
async function decode(page){
 const png=await page.locator('#qr svg').screenshot();
 return page.evaluate(async data=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return jsQR(ctx.getImageData(0,0,img.width,img.height).data,img.width,img.height)?.data;},png.toString('base64'));
}
for(const [name,engine]of [['WebKit',webkit],['Chromium',chromium]])for(const slug of slugs)test(`${name} ${slug}: exclusive faces, readable QR, round trips and phone/desktop geometry`,async t=>{
 const s=await opened(engine,slug);t.after(async()=>{await s.browser.close();s.app.close();s.db.close();});const{page}=s;
 await settled(page,false);const qr=await page.locator('#qr').innerHTML();const card=page.locator('[data-loyalty-flip]');
 if(output&&engine===webkit){await mkdir(output,{recursive:true});await card.screenshot({path:`${output}/${slug}-despues-frente.png`});}
 // Sample the real animation: visibility is exclusive and a visible face never
 // passes its edge to a mirrored angle, including positioned descendants.
 const animationSamples=page.evaluate(()=>new Promise(resolve=>{const failures=[],start=performance.now();function frame(){const faces=document.querySelectorAll('[data-loyalty-flip] :is(.loyalty-card-front,.loyalty-card-back,.santofe-card-front,.santofe-card-back)'),visible=[...faces].filter(x=>getComputedStyle(x).visibility==='visible');if(visible.length>1||visible.some(x=>new DOMMatrixReadOnly(getComputedStyle(x).transform).m11<-.00001))failures.push(performance.now()-start);if(performance.now()-start<900)requestAnimationFrame(frame);else resolve(failures);}requestAnimationFrame(frame);}));
 await page.click('#flip-card');await settled(page,true);assert.deepEqual(await animationSamples,[]);await assertFace(page,true);
 assert.equal(await decode(page),s.f.card.qrValue);assert.equal(await page.locator('#qr').innerHTML(),qr);
 if(output&&engine===webkit)await card.screenshot({path:`${output}/${slug}-despues-qr.png`});
 // A screenshot must be identical if we explicitly hide the already inactive
 // front: catches WebKit painting its children through the reverse.
 const rendered=await card.screenshot();await card.locator('.loyalty-card-front,.santofe-card-front').evaluate(e=>e.style.visibility='hidden');const control=await card.screenshot();
 if(!rendered.equals(control)&&output){await mkdir(output,{recursive:true});await writeFile(`${output}/${name}-${slug}-control-real.png`,rendered);await writeFile(`${output}/${name}-${slug}-control-hidden.png`,control);}
 if(!rendered.equals(control)){
  const difference=await page.evaluate(async images=>{
   const pixels=[];let size='';for(const data of images){const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const key=img.width+'x'+img.height;if(size&&size!==key)return 255;size=key;const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);pixels.push(ctx.getImageData(0,0,img.width,img.height).data);}
   let max=0;for(let i=0;i<pixels[0].length;i++)max=Math.max(max,Math.abs(pixels[0][i]-pixels[1][i]));return max;
  },[rendered.toString('base64'),control.toString('base64')]);
  // Chromium can round six shadow/text edge pixels by one channel level on
  // repaint. Actual reflected content changes thousands of pixels by far more.
  assert.ok(difference<=1,'inactive face cannot contribute visible pixels to the QR side');
 }
 await card.locator('.loyalty-card-front,.santofe-card-front').evaluate(e=>e.style.removeProperty('visibility'));
 for(const [width,height]of sizes){
  await page.setViewportSize({width,height});await assertFace(page,true);assert.equal(await decode(page),s.f.card.qrValue);
  await page.click('#flip-card');await settled(page,false);await assertFace(page,false);
  await page.click('#flip-card');await settled(page,true);await assertFace(page,true);
 }
 // Rapid interrupted turns must still settle on the requested side cleanly.
 await page.evaluate(()=>{const button=document.querySelector('#flip-card');button.click();button.click();button.click();});await settled(page,false);await assertFace(page,false);
 await page.evaluate(()=>document.querySelector('#flip-card').click());await settled(page,true);assert.equal(await decode(page),s.f.card.qrValue);
 assert.equal(await page.locator('#qr').innerHTML(),qr);assert.deepEqual(s.unexpected,[]);
});
for(const slug of slugs)test(`WebKit ${slug}: reduced motion and standalone flag keep the two faces exclusive`,async t=>{
 const s=await opened(webkit,slug,true);t.after(async()=>{await s.browser.close();s.app.close();s.db.close();});const{page}=s;
 for(const back of [true,false,true]){await page.click('#flip-card');await settled(page,back);await assertFace(page,back);}
 assert.equal(await page.locator('[data-loyalty-flip]').evaluate(e=>[...e.querySelectorAll('.loyalty-card-face,.santofe-digital-card')].every(x=>getComputedStyle(x).transitionDuration==='0s')),true);
 assert.equal(await decode(page),s.f.card.qrValue);assert.deepEqual(s.unexpected,[]);
});
