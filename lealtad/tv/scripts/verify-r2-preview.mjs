import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const origin=process.env.RENACE_PREVIEW_ORIGIN||'http://127.0.0.1:8790';
const playlistResponse=await fetch(`${origin}/playlist.json`,{cache:'no-store'});
assert.equal(playlistResponse.status,200);assert.equal(playlistResponse.headers.get('x-renace-playlist-source'),'r2');
const playlist=await playlistResponse.json();
assert.equal(playlist.items.filter(item=>item.type==='image').length,15);
assert.equal(playlist.items.filter(item=>item.type==='video').length,2);
for(const item of playlist.items){const response=await fetch(origin+item.source,{method:'HEAD'});assert.equal(response.status,200,item.id);assert.match(response.headers.get('content-type'),new RegExp(`^${item.type}/`));assert.ok(Number(response.headers.get('content-length'))>0);}
const video=playlist.items.find(item=>item.type==='video');
const range=await fetch(origin+video.source,{headers:{range:'bytes=0-31'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,32);assert.match(range.headers.get('content-range'),/^bytes 0-31\/\d+$/);
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin);await page.waitForSelector('.media-card');assert.equal(await page.locator('.media-card').count(),17);
  const image=page.locator('.media-card img').first();await image.evaluate(async element=>element.decode());assert.ok(await image.evaluate(element=>element.naturalWidth>0));
  await page.click(`[data-media-id="${video.id}"]`);await page.click('#play-selected');
  await page.waitForFunction(()=>document.querySelector('#media-stage video')?.currentTime>0,null,{timeout:20000});
  assert.equal(await page.locator('#media-stage video').evaluate(element=>element.controls),false);assert.deepEqual(errors,[]);
}finally{await browser.close();}
console.log(JSON.stringify({playlist:17,images:15,videos:2,headVerified:17,range206:true,browserPlayback:true},null,2));
