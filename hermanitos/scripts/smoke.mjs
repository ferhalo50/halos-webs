// Authenticate the initial accounts without creating stamps or favor activity.
// Usage: node scripts/smoke.mjs <origin> .private/accounts.json
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const origin=process.argv[2],accounts=JSON.parse(await readFile(process.argv[3],'utf8'));
if(!['https://app.haloswebs.com','http://localhost:8791'].includes(origin))throw Error('Unexpected smoke target.');
for(const path of ['/hermanitos/','/hermanitos/assets/style.css','/hermanitos/assets/app.js','/hermanitos/assets/vendor/qrcode.js','/hermanitos/assets/vendor/jsqr.js']){
  const res=await fetch(origin+path);assert.equal(res.status,200,`${path}: ${res.status}`);assert.equal(res.headers.get('x-content-type-options'),'nosniff');
  if(path.endsWith('/')){assert.match(await res.text(),/Hermanitos Card/);assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);}
}
assert.equal((await fetch(`${origin}/hermanitos/api/me`)).status,401);
for(const account of accounts){
  const login=await fetch(`${origin}/hermanitos/api/login`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({name:account.name,password:account.password})});
  assert.equal(login.status,200,`Login failed for ${account.name}: ${await login.text()}`);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={cookie,origin,'content-type':'application/json'};
  const me=await fetch(`${origin}/hermanitos/api/me`,{headers});assert.equal(me.status,200);
  const data=await me.json();assert.equal(data.user.role,account.role);assert.ok(!data.user.password_hash);
  if(account.role==='admin'){
    const res=await fetch(`${origin}/hermanitos/api/admin`,{headers});assert.equal(res.status,200);
    const admin=await res.json();assert.equal(admin.users.filter(u=>u.role==='admin').length,1);assert.ok(admin.users.some(u=>u.name==='Maria'));
  }else{
    assert.match(data.qr,/^hermanitos:v1:[A-Za-z0-9_-]{43}$/);assert.equal(data.stats.stamps,0);assert.equal(data.stats.owed,0);
    const history=await fetch(`${origin}/hermanitos/api/history`,{headers});assert.equal(history.status,200);
    assert.equal((await fetch(`${origin}/hermanitos/api/admin`,{headers})).status,403);
  }
  const out=await fetch(`${origin}/hermanitos/api/logout`,{method:'POST',headers,body:'{}'});assert.equal(out.status,200);
  assert.equal((await fetch(`${origin}/hermanitos/api/me`,{headers})).status,401);
  console.log(`${account.name}: login, role, dashboard and logout OK.`);
}
console.log('Assets, isolation and all four initial accounts verified. No stamps or favors created.');
