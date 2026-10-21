import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDb, fixtureBucket } from './fixtures.mjs';
import { storageSummary, reserveUpload, discardUpload, reconcileStorage, retryCleanup, verifiedStream } from '../worker/storage.js';
import { upload } from '../worker/admin.js';
import worker from '../worker/index.js';
import { createSession } from '../worker/admin-auth.js';
const origin='https://renace.test';
const image=Uint8Array.from([0xff,0xd8,0xff,0,1]);
const video=Uint8Array.from([0,0,0,20,102,116,121,112,0,1]);
function env(site='renace'){return {TV_SITE:site,TV_DB:fixtureDb(),MEDIA_BUCKET:fixtureBucket(),TV_ADMIN_ENABLED:'true',R2_MEDIA_ENABLED:'true',TV_MAX_UPLOAD_BYTES:'95000000',ASSETS:{fetch:async()=>Response.json({slideDurationSeconds:10,items:[]})}};}
function request(bytes=image,declared=bytes.length,name='demo.jpg',body=bytes){return new Request(`${origin}/admin/api/uploads`,{method:'POST',headers:{'content-type':name.endsWith('.mp4')?'video/mp4':'image/jpeg','x-upload-filename':name,'x-upload-size':String(declared)},body,...(body instanceof ReadableStream?{duplex:'half'}:{})});}
function existing(e,size=0,active=1){if(!size)return;e.TV_DB.sqlite.prepare("INSERT INTO media(id,original_filename,display_name,storage_key,media_type,mime_type,size_bytes,sort_order,active) VALUES('existing','existing.jpg','Ficticio','existing.jpg','image','image/jpeg',?,1,?)").run(size,active);e.MEDIA_BUCKET.objects.set('existing.jpg',{size});}
const count=(e,table)=>e.TV_DB.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;
for(const site of ['renace','santofe'])test(`${site}: migration gives decimal 1 GB, existing over-limit files stay readable`,async()=>{
  const e=env(site);assert.equal((await storageSummary(e)).limitBytes,1_000_000_000);existing(e,1_100_000_000);
  const state=await storageSummary(e);assert.equal(state.usedBytes,1_100_000_000);assert.equal(state.overBytes,100_000_000);assert.equal(state.availableBytes,0);assert.equal(state.state,'over');
  assert.equal((await upload(request(),e,{user_id:'admin'})).status,413);assert.equal(count(e,'media'),1);
  const playlist=await (await worker.fetch(new Request(`${origin}/playlist.json`),e)).json();assert.equal(playlist.items[0].id,'existing');
});
test('separate image/video uploads increment only their own persistent counter; duplicate filename is a separate object',async()=>{
  const a=env(),b=env('santofe');
  for(const req of [request(),request(video,video.length,'demo.mp4'),request()])assert.equal((await upload(req,a,{user_id:'admin'})).status,201);
  assert.equal((await storageSummary(a)).usedBytes,image.length*2+video.length);assert.equal((await storageSummary(b)).usedBytes,0);
  assert.equal(a.MEDIA_BUCKET.objects.size,3);assert.equal(count(a,'upload_intents'),0);
  const snapshot=await storageSummary(a);assert.deepEqual(await storageSummary(a),snapshot);
});
for(const [occupied,status] of [[999_999_994,201],[999_999_995,201],[999_999_996,413],[1_000_000_000,413]])test(`quota edge ${occupied} + 5 bytes returns ${status}`,async()=>{
  const e=env();existing(e,occupied);
  assert.equal((await upload(request(),e,{user_id:'admin'})).status,status);
  assert.equal((await storageSummary(e)).usedBytes,occupied+(status===201?5:0));assert.equal(count(e,'upload_intents'),0);
});
test('two concurrent upload reservations cannot oversubscribe remaining capacity',async()=>{
  const e=env();existing(e,999_999_995);
  const results=await Promise.all([upload(request(),e,{user_id:'admin'}),upload(request(),e,{user_id:'admin'})]);
  assert.deepEqual(results.map(x=>x.status).sort(),[201,413]);assert.equal((await storageSummary(e)).usedBytes,1_000_000_000);assert.equal(count(e,'upload_intents'),0);
});
for(const declared of [image.length-1,image.length+1])test(`forged declared length ${declared} cannot become playable or retain bytes`,async()=>{
  const e=env();assert.equal((await upload(request(image,declared),e,{user_id:'admin'})).status,503);
  assert.equal(count(e,'media'),0);assert.equal(count(e,'upload_intents'),0);assert.equal(e.MEDIA_BUCKET.objects.size,0);assert.equal((await storageSummary(e)).usedBytes,0);
});
test('stored R2 size must match measured stream, not just request metadata',async()=>{
  const e=env();e.MEDIA_BUCKET.head=async key=>e.MEDIA_BUCKET.objects.has(key)?{size:99}:null;
  assert.equal((await upload(request(),e,{user_id:'admin'})).status,503);assert.equal(count(e,'media'),0);assert.equal(count(e,'upload_intents'),0);
});
test('cancelled or failed upload releases reservation and never creates media',async()=>{
  for(const failure of ['cancel','r2']){
    const e=env();const body=new ReadableStream({start(c){c.enqueue(image);if(failure==='cancel')c.error(new Error('Sender cancelled'));else c.close();}});
    if(failure==='r2')e.MEDIA_BUCKET.put=async()=>{throw new Error('R2 offline');};
    const response=await upload(request(image,5,'demo.jpg',body),e,{user_id:'admin'});
    assert.ok([400,503].includes(response.status));assert.equal(count(e,'media'),0);assert.equal(count(e,'upload_intents'),0);
  }
});
test('failed R2 cleanup stays accounted; authorized retry releases only failed unpublished object',async()=>{
  const e=env();await reserveUpload(e,{user_id:'admin'},'intent','staging.jpg',5);e.MEDIA_BUCKET.objects.set('staging.jpg',{size:5});
  const remove=e.MEDIA_BUCKET.delete;e.MEDIA_BUCKET.delete=async()=>{throw new Error('Delete failed');};
  await assert.rejects(discardUpload(e,'intent','staging.jpg'));assert.equal((await storageSummary(e)).reservedBytes,5);
  e.MEDIA_BUCKET.delete=remove;assert.equal(await retryCleanup(e),1);assert.equal((await storageSummary(e)).reservedBytes,0);
});
test('ambiguous successful D1 commit never deletes committed R2 object',async()=>{
  const e=env();existing(e,5);assert.equal(await discardUpload(e,'existing','existing.jpg'),true);assert.equal(e.MEDIA_BUCKET.objects.has('existing.jpg'),true);
});
test('a late finalization winning the cleanup claim cannot lose its valid object',async()=>{
  const e=env();await reserveUpload(e,{user_id:'admin'},'existing','existing.jpg',5);
  const prepare=e.TV_DB.prepare.bind(e.TV_DB);let committed=false;
  e.TV_DB.prepare=sql=>{
    if(sql.startsWith("UPDATE upload_intents SET state='cleanup'")&&!committed){
      committed=true;existing(e,5);e.TV_DB.sqlite.exec("DELETE FROM upload_intents WHERE id='existing'");
    }
    return prepare(sql);
  };
  assert.equal(await discardUpload(e,'existing','existing.jpg'),true);
  assert.equal(e.MEDIA_BUCKET.objects.has('existing.jpg'),true);assert.equal(count(e,'media'),1);
});
test('a full failed reservation is retried before rejecting a new upload for quota',async()=>{
  const e=env();existing(e,999_999_995);await reserveUpload(e,{user_id:'admin'},'failed','failed.jpg',5);
  e.TV_DB.sqlite.exec("UPDATE upload_intents SET state='cleanup' WHERE id='failed'");e.MEDIA_BUCKET.objects.set('failed.jpg',{size:5});
  assert.equal((await upload(request(),e,{user_id:'admin'})).status,201);
  assert.equal(e.MEDIA_BUCKET.objects.has('failed.jpg'),false);assert.equal(count(e,'upload_intents'),0);
  assert.equal((await storageSummary(e)).usedBytes,1_000_000_000);
});
test('reconciliation is read-only and detects inactive/missing/mismatched/orphaned and stale intents',async()=>{
  const e=env();existing(e,20,0);e.MEDIA_BUCKET.objects.set('existing.jpg',{size:21});e.MEDIA_BUCKET.objects.set('orphan',{size:7});
  await reserveUpload(e,{user_id:'admin'},'stale','pending.jpg',5);e.TV_DB.sqlite.exec("UPDATE upload_intents SET created_at=0 WHERE id='stale'");
  const pre=e.TV_DB.sqlite.prepare('SELECT * FROM upload_intents').all();const objects=[...e.MEDIA_BUCKET.objects];
  const result=await reconcileStorage(e);assert.equal(result.sizeMismatches,1);assert.equal(result.orphanObjects,1);assert.equal(result.staleUploads,1);assert.equal(result.storage.usedBytes,20);
  assert.deepEqual(e.TV_DB.sqlite.prepare('SELECT * FROM upload_intents').all(),pre);assert.deepEqual([...e.MEDIA_BUCKET.objects],objects);
  e.MEDIA_BUCKET.objects.delete('existing.jpg');assert.equal((await reconcileStorage(e)).missingObjects,1);
});
test('inactive files still count; deletion confirms R2 removal before freeing space; replacement uses new objects',async()=>{
  const e=env();const session=await createSession(new Request(`${origin}/admin/api/login`),e,'admin');const cookie=session.setCookie.split(';')[0];
  const api=(id,method,body)=>worker.fetch(new Request(`${origin}/admin/api/content/${id}`,{method,headers:{cookie,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),e);
  const first=await (await upload(request(),e,{user_id:'admin'})).json();
  assert.equal((await api(first.id,'PATCH',{active:false})).status,200);assert.equal((await storageSummary(e)).usedBytes,5);
  const remove=e.MEDIA_BUCKET.delete;e.MEDIA_BUCKET.delete=async()=>{};
  assert.equal((await api(first.id,'DELETE')).status,503);assert.equal((await storageSummary(e)).usedBytes,5);
  e.MEDIA_BUCKET.delete=remove;assert.equal((await api(first.id,'DELETE')).status,200);assert.equal((await storageSummary(e)).usedBytes,0);
  assert.equal((await upload(request(video,video.length,'replacement.mp4'),e,{user_id:'admin'})).status,201);assert.equal((await storageSummary(e)).usedBytes,video.length);
});
test('stream limits and timeout reject overlong or stalled senders',async()=>{
  const tooLong=verifiedStream(new Blob([image]).stream(),4);
  await assert.rejects(new Response(tooLong).arrayBuffer());
  const stalled=verifiedStream(new ReadableStream({}),5,5,10);await assert.rejects(new Response(stalled).arrayBuffer());
});
