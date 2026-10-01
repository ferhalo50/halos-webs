import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {TENANTS} from '../worker/tenants.js';

test('Santofé app icons preserve the official mark inside the maskable safe zone',async t=>{
 const base='http://127.0.0.1:8789',manifest=await (await fetch(base+'/manifest.webmanifest')).json();
 assert.equal(manifest.icons.length,2);assert.equal(TENANTS.santofe.stampStyles.santofe.src,'/assets/santofe/mark-santofe.png');
 assert.equal(TENANTS.santofe.touchIcon,manifest.icons[0].src);
 const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());const page=await browser.newPage();await page.goto(base+'/');
 assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'),TENANTS.santofe.touchIcon);
 for(const icon of manifest.icons){
  assert.equal(icon.purpose,'any maskable');assert.equal(icon.type,'image/png');
  const geometry=await page.evaluate(async src=>{
   const img=new Image();img.src=src;await img.decode();const size=img.naturalWidth,c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,size,size).data,bg=[232,236,222];let left=size,top=size,right=0,bottom=0,radius=0,opaque=true;
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4;opaque&&=pixels[i+3]===255;if(Math.max(...bg.map((v,k)=>Math.abs(v-pixels[i+k])))>30){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);radius=Math.max(radius,Math.hypot(x+.5-size/2,y+.5-size/2));}}
   return{size,height:img.naturalHeight,left,top,right,bottom,radius,opaque,bg:[...pixels.slice(0,3)]};
  },icon.src);
  assert.equal(`${geometry.size}x${geometry.height}`,icon.sizes);assert.deepEqual(geometry.bg,[232,236,222]);assert.equal(geometry.opaque,true);
  assert.ok(geometry.radius<=geometry.size*.4,'entire symbol stays inside the 80% safe-zone circle');
  assert.ok(Math.abs((geometry.left+geometry.right+1)/2-geometry.size/2)<=1);assert.ok(Math.abs((geometry.top+geometry.bottom+1)/2-geometry.size/2)<=1);
  assert.ok((geometry.bottom-geometry.top+1)/geometry.size>.72,'official mark remains recognizable');
 }
});
