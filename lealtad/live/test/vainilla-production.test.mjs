import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/index.js';

test('Vainilla production host serves its approved shell/PWA while anonymous protected APIs and bootstrap execute zero D1 operations',async()=>{
 const calls=[];
 const env={MAINTENANCE_MODE:'OFF',ALLOW_DEMO:'true',DEV_TENANT:'renace',DB:Object.fromEntries(['prepare','batch'].map(method=>[method,()=>{calls.push(method);throw Error('Unexpected D1 operation');}])),ASSETS:{fetch:async request=>{
  const path=new URL(request.url).pathname;
  const file=path==='/'?'index.html':path.slice(1);
  const text=readFileSync(new URL('../public/'+file,import.meta.url),'utf8');
  return new Response(text,{headers:{'content-type':file.endsWith('.html')?'text/html':'application/javascript'}});
 }}};
 const request=path=>worker.fetch(new Request('https://vainillacoffee.haloswebs.com'+path),env);
 const shell=await request('/');assert.equal(shell.status,200);const html=await shell.text();
 assert.ok(html.includes('data-tenant="vainillacoffee"'));assert.ok(html.includes('/assets/vainilla/logo.svg'));assert.ok(html.includes('/assets/vainilla.js'));assert.ok(html.includes('/assets/vainilla.css'));
 const tenantResponse=await request('/assets/tenant.js');const tenant=JSON.parse((await tenantResponse.text()).replace('window.LoyaltyTenant=','').replace(/;$/,''));
 assert.equal(tenant.slug,'vainillacoffee');assert.equal(tenant.rewardGoal,9);assert.equal(tenant.stampPolicy,'per_item');assert.equal(tenant.maxStampsPerTransaction,99);assert.equal(tenant.demo,false);assert.equal(tenant.cardLayout.variant,'bouquet');assert.deepEqual(Object.keys(tenant.stampStyles),['flower']);
 const manifest=await(await request('/manifest.webmanifest')).json();assert.equal(manifest.name,'Vainilla Coffee · Lealtad');assert.equal(manifest.short_name,'Vainilla Coffee');assert.equal(manifest.theme_color,'#fffaf0');assert.equal(manifest.background_color,'#fffaf0');
 for(const size of [192,512])assert.ok(manifest.icons.some(i=>i.sizes===`${size}x${size}`&&i.purpose==='any maskable'&&i.src.startsWith('/assets/vainilla/')));
 const sw=await(await request('/service-worker.js')).text();for(const asset of ['vainillacoffee-shell-v12','vainilla.js','vainilla.css','bouquet.jpg','flower.svg','icon-192.png','icon-512.png','pending-rewards.css'])assert.ok(sw.includes(asset));
 for(const path of ['/api/me','/api/card','/api/admin/dashboard','/api/admin/export/activity','/api/staff/card?value=foreign-qr'])assert.equal((await request(path)).status,401);
 const setup=await worker.fetch(new Request('https://vainillacoffee.haloswebs.com/api/setup',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),env);assert.equal(setup.status,404);
 assert.deepEqual(calls,[]);
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));assert.equal(pkg.scripts.predeploy,undefined);assert.equal(pkg.scripts.postdeploy,undefined);
 const fixtures=readFileSync(new URL('../scripts/vainilla-local-fixtures.mjs',import.meta.url),'utf8');assert.ok(fixtures.includes("const base='http://127.0.0.1:8790'"));assert.ok(!fixtures.includes('--remote'));
});
