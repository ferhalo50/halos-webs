import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const hosts=['renacecafe.haloswebs.com','mooncoffee.haloswebs.com','santofe.haloswebs.com','vainillacoffee.haloswebs.com'];
const csp="default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const paths=['/','/login?x=1&return=%2Ftarjeta','/api/login/customer?x=1&x=2','/api/staff/stamp','/api/admin/customers/test','/renace/api/me','/assets/live.js?v=12'];
// The project executes D1 through prepare/batch. Copying the binding is not SQL.
function forbiddenD1(calls){return Object.fromEntries(['prepare','batch'].map(method=>[method,(...args)=>{calls.push({method,args});throw Error('Unexpected D1 operation: '+method);} ]));}

for(const host of hosts)test(host+' redirects HTTP before D1 operations, preserving path/query and methods',async()=>{
 const calls=[],db=forbiddenD1(calls),env={MAINTENANCE_MODE:'ON',DB:db};
 assert.equal({...env}.DB,db);assert.deepEqual(calls,[],'Reading/copying the binding is allowed');
 for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'])for(const path of paths){
  const request=new Request('http://'+host+path,{method,...(['GET','HEAD'].includes(method)?{}:{body:'{"not_a_real_operation":true}'})});
  const result=await worker.fetch(request,env);assert.equal(result.status,308);assert.equal(result.headers.get('location'),'https://'+host+path);
  assert.equal(result.headers.get('strict-transport-security'),null);assert.equal(result.headers.get('content-security-policy'),csp);assert.equal(result.headers.get('set-cookie'),null);assert.equal(await result.text(),'');assert.equal(request.bodyUsed,false);
 }assert.deepEqual(calls,[]);
});

test('HTTPS public shell, API errors and maintenance retain CSP and receive host-only HSTS',async()=>{
 for(const host of hosts){
  const calls=[],db=forbiddenD1(calls),env={MAINTENANCE_MODE:'OFF',ASSETS:{fetch:async()=>new Response('public asset',{headers:{'content-type':'text/plain'}})},DB:db};
  for(const path of ['/','/assets/live.js','/manifest.webmanifest','/service-worker.js']){const result=await worker.fetch(new Request('https://'+host+path),env);assert.equal(result.status,200,host+path);assert.equal(result.headers.get('strict-transport-security'),'max-age=31536000');assert.equal(result.headers.get('content-security-policy'),csp);}
  const anonymous=await worker.fetch(new Request('https://'+host+'/api/me'),env);assert.equal(anonymous.status,401);assert.equal(anonymous.headers.get('strict-transport-security'),'max-age=31536000');assert.equal(anonymous.headers.get('content-security-policy'),csp);
  const maintained=await worker.fetch(new Request('https://'+host+'/api/register',{method:'POST',body:'{}'}),{MAINTENANCE_MODE:'ON',DB:db});assert.equal(maintained.status,503);assert.equal(maintained.headers.get('strict-transport-security'),'max-age=31536000');assert.equal(maintained.headers.get('content-security-policy'),csp);
  assert.deepEqual(calls,[]);
 }
 const alias=await worker.fetch(new Request('https://renacecafe.haloswebs.com/renace?x=1'),{MAINTENANCE_MODE:'OFF'});assert.equal(alias.status,308);assert.equal(alias.headers.get('strict-transport-security'),'max-age=31536000');
});

test('Local HTTP/HTTPS and LAN ports are never forced to HTTPS or given production HSTS',async()=>{
 const asset={fetch:async()=>new Response('local asset')};
 for(const protocol of ['http:','https:'])for(const port of [8787,8788,8789,8790])for(const host of ['localhost','127.0.0.1','10.0.0.9']){
  const result=await worker.fetch(new Request(protocol+'//'+host+':'+port+'/assets/live.js'),{MAINTENANCE_MODE:'OFF',DEV_TENANT:'renace',ASSETS:asset});
  assert.equal(result.status,host==='10.0.0.9'?404:200);assert.equal(result.headers.get('location'),null);assert.equal(result.headers.get('strict-transport-security'),null);assert.equal(result.headers.get('content-security-policy'),csp);
 }
});

test('Unapproved hosts remain outside public HTTPS policy and tenant activation',async()=>{
 for(const protocol of ['http:','https:'])for(const host of ['other.haloswebs.com','renacecafe.haloswebs.com.other.test','vainillacoffee.haloswebs.com.other.test']){
  const calls=[];const result=await worker.fetch(new Request(protocol+'//'+host+'/'),{MAINTENANCE_MODE:'OFF',DB:forbiddenD1(calls)});
  assert.equal(result.status,404);assert.equal((await result.json()).error.code,'unknown_host');assert.equal(result.headers.get('location'),null);assert.equal(result.headers.get('strict-transport-security'),null);assert.deepEqual(calls,[]);
 }
});
