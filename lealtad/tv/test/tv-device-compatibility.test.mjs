import {localTvUrl} from './fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
for(const engine of ['chromium','webkit'])for(const site of ['renace','santofe'])test(`${engine} ${site}: native portrait MP4 and sideways TV preserve video geometry`,async t=>{
  const browser=await (engine==='chromium'?chromium:webkit).launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:720},serviceWorkers:'block'});
  await page.goto(localTvUrl(site));await page.waitForSelector('.media-card');
  await page.click('button[data-rotation="90"]');await page.getByRole('button',{name:'Seleccionar Video vertical',exact:true}).click();await page.click('#play-selected');
  await page.waitForFunction(()=>document.querySelector('#media-stage video')?.currentTime>1);
  const video=await page.locator('#media-stage video').evaluate(v=>({w:v.videoWidth,h:v.videoHeight,duration:v.duration,fit:getComputedStyle(v).objectFit,rotation:v.parentElement.style.transform}));
  // The encoded fixture is 360x640 (ffprobe). Windows WebKit reports scaled
  // intrinsic dimensions (e.g. 405x720 or 720x1280); geometry must remain 9:16.
  assert.ok(video.w>0&&video.h>0);assert.equal(video.w/video.h,9/16);assert.ok(Math.abs(video.duration-6)<0.1);assert.equal(video.fit,'contain');assert.match(video.rotation,/rotate\(90deg\)/);
  await page.keyboard.press('Escape');await page.waitForSelector('#presentation',{state:'hidden'});
  await page.setViewportSize({width:720,height:1280});await page.click('button[data-rotation="0"]');await page.click('#play-selected');
  await page.waitForFunction(()=>document.querySelector('#media-stage video')?.currentTime>1);
  assert.equal(await page.locator('#media-stage video').evaluate(v=>v.videoWidth/v.videoHeight),9/16);
  await page.keyboard.press('Escape');
});
test('storage unavailable, reduced motion and Fire TV keyboard fallback remain usable',async t=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce',serviceWorkers:'block',userAgent:'Mozilla/5.0 (Linux; Android 9; AFTMM) AppleWebKit/537.36 Silk/120.0 Safari/537.36'});
  await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});HTMLElement.prototype.requestFullscreen=()=>Promise.reject(new Error('Unavailable'));});
  await page.goto(localTvUrl('santofe'));await page.waitForSelector('.media-card');
  assert.equal(await page.locator('button[data-orientation="auto"]').getAttribute('aria-pressed'),'true');
  await page.click('button[data-orientation="vertical"]');await page.locator('#play-all').focus();await page.keyboard.press('Enter');await page.waitForSelector('#media-stage img');
  assert.equal(await page.locator('#media-stage').evaluate(x=>getComputedStyle(x).transitionDuration),'0s');
  await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('#presentation').dataset.index==='1');
  await page.keyboard.press('Escape');await page.waitForSelector('#presentation',{state:'hidden'});
  await page.reload();assert.equal(await page.locator('button[data-orientation="auto"]').getAttribute('aria-pressed'),'true');
});
test('Santofé offline shell, configuration, media and cache namespace stay independent',async t=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
  const context=await browser.newContext(),page=await context.newPage();await page.goto(localTvUrl('santofe'));await page.waitForSelector('.media-card');
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.click('#prepare-offline');await page.waitForFunction(()=>document.querySelector('#offline-label').textContent==='Listo para usar sin conexión',null,{timeout:30000});
  const keys=await page.evaluate(()=>caches.keys());assert.ok(keys.some(x=>x.startsWith('santofe-tv-media-')));assert.ok(!keys.some(x=>x.startsWith('renace-tv-')));
  await context.setOffline(true);await page.reload();await page.waitForSelector('.media-card');
  assert.equal(await page.locator('.media-card').count(),4);assert.equal(await page.title(),'Santofé TV');
  await page.click('#play-all');await page.waitForFunction(()=>document.querySelector('#media-stage img')?.naturalWidth>0);await page.keyboard.press('Escape');
});
