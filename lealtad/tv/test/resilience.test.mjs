import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:8790',config=JSON.parse(await readFile(new URL('../public/media.json',import.meta.url))),photo=config.items.find(x=>x.type==='image'),video=config.items.find(x=>x.type==='video');
test('clean presentation, sequential fades, fullscreen exit, Spotify and selection persistence',async t=>{
 const b=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>b.close());const p=await b.newPage({viewport:{width:1920,height:1080}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.click(`[data-media-id="${photo.id}"]`);await p.click(`[data-media-id="${video.id}"]`);await p.reload();await p.waitForSelector('.media-card[aria-pressed="true"]');assert.equal(await p.locator('.media-card[aria-pressed="true"]').count(),2);
 assert.equal(await p.locator('#open-spotify').getAttribute('href'),'https://open.spotify.com/');
 await p.click('#toggle-music');const popup=p.waitForEvent('popup');await p.click('#open-spotify');const external=await popup;await external.close();await p.bringToFront();assert.equal(await p.locator('audio').evaluate(a=>a.paused),true);
 await p.click('#play-selected');await p.waitForFunction(()=>document.querySelector('#media-stage').style.opacity==='1');
 assert.equal(await p.locator('#presentation button,#presentation p,#presentation progress').count(),0);assert.equal(await p.locator('#presentation').innerText(),'');
 assert.equal(await p.locator('#media-stage').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)');assert.equal(await p.locator('#media-stage').evaluate(e=>getComputedStyle(e).transitionDuration),'0.16s');
 await p.keyboard.press('ArrowRight');await p.waitForSelector('#media-stage video');await p.waitForFunction(()=>document.querySelector('#media-stage').style.opacity==='1');assert.equal(await p.locator('video').count(),1);
 await p.evaluate(()=>document.exitFullscreen());await p.waitForSelector('#presentation',{state:'hidden'});assert.equal(await p.locator('video').count(),0);
 await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('#media-stage').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');assert.deepEqual(errors,[]);
});
test('failed video advances and stalled playback watchdog recovers without public error overlays',async t=>{
 const b=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>b.close());
 const c=await b.newContext({serviceWorkers:'block'}),p=await c.newPage();const warnings=[];p.on('console',m=>{if(m.type()==='warning')warnings.push(m.text());});
 await p.route('**/media.json',route=>route.fulfill({json:{...config,items:[{...video,source:'/media/broken.mp4'},photo]}}));await p.route('**/media/broken.mp4',route=>route.fulfill({status:404,body:'missing'}));await p.goto(base);await p.click('#play-all');await p.waitForSelector('#media-stage img');assert.equal(await p.locator('#presentation').innerText(),'');assert.ok(warnings.some(x=>x.includes('Medio omitido')));await p.keyboard.press('Escape');
 await p.unroute('**/media.json');await p.route('**/media.json',route=>route.fulfill({json:{...config,items:[video,photo]}}));await p.reload();await p.click('#play-all');await p.waitForFunction(()=>document.querySelector('#media-stage video')?.currentTime>0&&document.querySelector('#media-stage').style.opacity==='1');
 await p.locator('video').evaluate(v=>v.pause());await p.waitForSelector('#media-stage img',{timeout:16000});assert.equal(await p.locator('video').count(),0);assert.ok(warnings.some(x=>x.includes('playback_stalled')));
 await p.keyboard.press('Escape');await p.unroute('**/media.json');await p.route('**/media.json',route=>route.fulfill({json:{...config,items:[{...video,source:'/media/never-starts.mp4'},photo]}}));
 await p.route('**/media/never-starts.mp4',()=>{});await p.reload();await p.click('#play-all');await p.waitForSelector('#media-stage img',{timeout:19000});assert.ok(warnings.some(x=>x.includes('start_timeout')));
});
