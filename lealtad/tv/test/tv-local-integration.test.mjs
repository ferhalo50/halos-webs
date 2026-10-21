import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// These URLs are intentionally fixed to loopback. Never point this at production.
for(const site of ['renace','santofe']) test(`${site} local D1/R2: upload, CAS concurrency, activation, order, range, deletion and isolation`,async()=>{
  const base=`http://127.0.0.1:${site==='renace'?8791:8792}`;
  const other=`http://127.0.0.1:${site==='renace'?8792:8791}`;
  const login=await fetch(`${base}/admin/api/login`,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({username:`demo_${site}`,password:`Demo-${site}-TV-2026!`})});
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const api=(path,method='GET',body)=>fetch(`${base}/admin/api/${path}`,{method,headers:{origin:base,cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const before=(await (await api('content')).json()).items;
  const otherBefore=await (await fetch(`${other}/playlist.json`)).json();
  const storageBefore=await (await api('storage')).json();
  assert.equal(storageBefore.limitBytes,1_000_000_000);
  const otherCookie=(await fetch(`${other}/admin/api/login`,{method:'POST',headers:{origin:other,'content-type':'application/json'},body:JSON.stringify({username:`demo_${site==='renace'?'santofe':'renace'}`,password:`Demo-${site==='renace'?'santofe':'renace'}-TV-2026!`})})).headers.get('set-cookie').split(';')[0];
  for(const path of ['content','storage','storage/reconcile']) {
    assert.equal((await fetch(`${other}/admin/api/${path}`,{headers:{cookie}})).status,401);
  }
  const bytes=await readFile(new URL(`../.local-tv/${site}/fixtures/Horizontal.png`,import.meta.url));
  const upload=await fetch(`${base}/admin/api/uploads`,{method:'POST',headers:{origin:base,cookie,'content-type':'image/png','x-upload-filename':'Regression-test.png','x-upload-size':String(bytes.length)},body:bytes});
  assert.equal(upload.status,201);const {id}=await upload.json();
  try {
    assert.equal((await (await api('storage')).json()).usedBytes,storageBefore.usedBytes+bytes.length);
    assert.equal((await fetch(`${other}/media/item/${id}`)).status,404);
    assert.equal((await fetch(`${other}/admin/api/media/${id}`,{headers:{cookie:otherCookie}})).status,404);
    assert.equal((await fetch(`${other}/admin/api/content/${id}`,{method:'DELETE',headers:{cookie,origin:other}})).status,401);
    assert.equal((await fetch(`${other}/admin/api/uploads`,{method:'POST',headers:{cookie,origin:other}})).status,401);
    const competing=await Promise.all([5,15].map(durationSeconds=>api(`content/${id}/duration`,'PATCH',{durationSeconds,revision:0})));
    assert.deepEqual(competing.map(x=>x.status).sort(),[200,409]);
    const winner=(await (await api('content')).json()).items.find(x=>x.id===id);
    assert.equal(winner.durationRevision,1); assert.ok([5,15].includes(winner.durationSeconds));
    assert.equal((await fetch(`${other}/admin/api/content/${id}/duration`,{method:'PATCH',headers:{origin:other,cookie,'content-type':'application/json'},body:JSON.stringify({durationSeconds:8,revision:1})})).status,401);
    assert.equal((await api(`content/${id}`,'PATCH',{active:false})).status,200);
    assert.equal((await (await api('storage')).json()).usedBytes,storageBefore.usedBytes+bytes.length);
    assert.ok(!(await (await fetch(`${base}/playlist.json`)).json()).items.some(x=>x.id===id));
    assert.equal((await api(`content/${id}`,'PATCH',{active:true})).status,200);
    const ids=[id,...before.map(x=>x.id)]; assert.equal((await api('reorder','POST',{ids})).status,200);
    assert.equal((await (await fetch(`${base}/playlist.json`)).json()).items[0].id,id);
    const range=await fetch(`${base}/media/item/${id}`,{headers:{range:'bytes=0-15'}}); assert.equal(range.status,206); assert.equal((await range.arrayBuffer()).byteLength,16);
  } finally { assert.equal((await api(`content/${id}`,'DELETE')).status,200); }
  const after=(await (await api('content')).json()).items;
  assert.equal((await (await api('storage')).json()).usedBytes,storageBefore.usedBytes);
  const reconciliation=await (await api('storage/reconcile')).json();
  assert.equal(reconciliation.missingObjects,0);assert.equal(reconciliation.sizeMismatches,0);assert.equal(reconciliation.orphanObjects,0);
  assert.deepEqual(after.map(x=>x.id),before.map(x=>x.id));
  assert.deepEqual(after.map(x=>x.durationSeconds),before.map(x=>x.durationSeconds));
  const otherAfter=await (await fetch(`${other}/playlist.json`)).json(); assert.deepEqual(otherAfter.items,otherBefore.items);
});
