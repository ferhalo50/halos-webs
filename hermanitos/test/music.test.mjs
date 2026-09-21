import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import worker from '../worker/index.js';
const base='http://127.0.0.1:8791';
test('canonical music: interaction only, play/pause, resumes, loops and graceful autoplay denial',async t=>{
 const browser=await chromium.launch({headless:true,channel:'msedge',args:['--autoplay-policy=user-gesture-required']});t.after(()=>browser.close());const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/me',r=>r.fulfill({status:401,json:{error:'Inicia sesión'}}));await page.goto(base);await page.waitForSelector('#music-toggle:not([hidden])');
 assert.equal(await page.locator('#music-toggle').innerText(),'Reproducir música');assert.equal(await page.locator('#music').evaluate(a=>a.paused),true);assert.equal(await page.locator('#music').evaluate(a=>a.loop),true);
 await page.click('#music-toggle');await page.waitForFunction(()=>document.querySelector('#music').currentTime>0.4);assert.equal(await page.locator('#music-toggle').innerText(),'Pausar música');await page.click('#music-toggle');const time=await page.locator('#music').evaluate(a=>a.currentTime);assert.ok(time>0);assert.equal(await page.locator('#music').evaluate(a=>a.paused),true);
 await page.click('#music-toggle');await page.waitForFunction(time=>document.querySelector('#music').currentTime>time+0.2,time);await page.locator('#music').evaluate(a=>a.currentTime=a.duration-.2);await page.waitForFunction(()=>document.querySelector('#music').currentTime<2);assert.equal(await page.locator('#music').evaluate(a=>a.paused),false);
 await page.reload();await page.waitForSelector('#music-toggle:not([hidden])');assert.equal(await page.locator('#music').evaluate(a=>a.paused),true);
 await page.evaluate(()=>{window.originalPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=()=>Promise.reject(new DOMException('blocked','NotAllowedError'));});await page.click('#music-toggle');assert.equal(await page.locator('#music-toggle').innerText(),'Reproducir música');await page.evaluate(()=>HTMLMediaElement.prototype.play=window.originalPlay);await page.click('#music-toggle');await page.waitForFunction(()=>!document.querySelector('#music').paused);
 const audio=await fetch(base+'/media/audio/Hermanitos.mp3');assert.equal(audio.status,200);assert.match(audio.headers.get('content-type'),/audio/);assert.deepEqual(errors,[]);
});
test('legacy Hermanitos entry redirects to canonical root',async()=>{
 const response=await worker.fetch(new Request('https://app.haloswebs.com/hermanitos/'),{});assert.equal(response.status,308);assert.equal(response.headers.get('location'),'https://hermanitos.haloswebs.com/');
});
