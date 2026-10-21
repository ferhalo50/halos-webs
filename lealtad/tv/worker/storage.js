export const STORAGE_LIMIT = 1_000_000_000;

export function storageState(usedBytes, limitBytes, reservedBytes = 0) {
  const percent = limitBytes > 0 ? Math.round(usedBytes / limitBytes * 10000) / 100 : null;
  const availableBytes = Math.max(0, limitBytes - usedBytes - reservedBytes);
  const overBytes = Math.max(0, usedBytes - limitBytes);
  const state = !limitBytes ? 'unconfigured' : overBytes ? 'over' : usedBytes + reservedBytes >= limitBytes ? 'full' : percent >= 90 ? 'critical' : percent >= 80 ? 'warning' : 'normal';
  return { usedBytes, limitBytes, reservedBytes, availableBytes, overBytes, percent, state };
}

export async function storageSummary(env) {
  const row = await env.TV_DB.prepare(`SELECT storage_limit_bytes,used_bytes,
    COALESCE((SELECT SUM(size_bytes) FROM media),0) AS actual_bytes,
    COALESCE((SELECT SUM(size_bytes) FROM upload_intents WHERE NOT EXISTS
      (SELECT 1 FROM media WHERE media.id=upload_intents.id)),0) AS reserved_bytes
    FROM settings WHERE id='main'`).first();
  return row ? storageState(Number(row.actual_bytes), Math.min(STORAGE_LIMIT, Number(row.storage_limit_bytes)), Number(row.reserved_bytes)) : storageState(0, 0);
}

export async function reserveUpload(env, auth, id, key, size) {
  // One SQLite statement serializes competing reservations. Includes inactive
  // media and durable incomplete objects, independent of playlist selection.
  const result = await env.TV_DB.prepare(`INSERT INTO upload_intents(id,storage_key,size_bytes,actor_id)
    SELECT ?,?,?,? FROM settings WHERE id='main' AND
      COALESCE((SELECT SUM(size_bytes) FROM media),0)+
      COALESCE((SELECT SUM(size_bytes) FROM upload_intents WHERE NOT EXISTS
        (SELECT 1 FROM media WHERE media.id=upload_intents.id)),0)+? <= MIN(storage_limit_bytes,1000000000)`)
    .bind(id, key, size, auth.user_id, size).run();
  return Number(result.meta?.changes) === 1;
}

export async function discardUpload(env, id, key) {
  // Claim atomically against finalization. A read followed by an unconditional
  // cleanup could race an ambiguous late commit and remove valid media.
  const claimed = await env.TV_DB.prepare(`UPDATE upload_intents SET state='cleanup'
    WHERE id=? AND storage_key=? AND NOT EXISTS(SELECT 1 FROM media WHERE id=?)`).bind(id,key,id).run();
  if(!Number(claimed.meta?.changes)) {
    return Boolean(await env.TV_DB.prepare('SELECT id FROM media WHERE id=?').bind(id).first());
  }
  await env.MEDIA_BUCKET.delete(key);
  if (await env.MEDIA_BUCKET.head(key)) throw new Error('Object removal not confirmed');
  await env.TV_DB.prepare("DELETE FROM upload_intents WHERE id=? AND storage_key=? AND state='cleanup'").bind(id,key).run();
  return false;
}

export async function retryCleanup(env) {
  // Only known failed, unpublished uploads; no automatic expiry of an unknown
  // in-flight upload and no deletion of untracked/orphaned real content.
  const rows = await env.TV_DB.prepare("SELECT id,storage_key FROM upload_intents WHERE state='cleanup'").all();
  let cleaned = 0;
  for (const row of rows.results || []) {
    if (!await discardUpload(env,row.id,row.storage_key)) cleaned++;
  }
  return cleaned;
}

export async function reconcileStorage(env) {
  const media = (await env.TV_DB.prepare('SELECT id,storage_key,size_bytes FROM media').all()).results || [];
  const intents = (await env.TV_DB.prepare('SELECT id,storage_key,size_bytes,state,created_at FROM upload_intents').all()).results || [];
  const referenced = new Set([...media,...intents].map(row=>row.storage_key));
  const counts = { media:media.length, missingObjects:0, sizeMismatches:0, orphanObjects:0, orphanBytes:0, incompleteUploads:intents.length, cleanupPending:0, staleUploads:0, objectBytes:0 };
  const cached = await env.TV_DB.prepare("SELECT used_bytes FROM settings WHERE id='main'").first();
  counts.counterMismatches = Number(cached?.used_bytes)!==media.reduce((sum,row)=>sum+Number(row.size_bytes),0)?1:0;
  for (const row of media) {
    const object=await env.MEDIA_BUCKET.head(row.storage_key);
    if(!object)counts.missingObjects++;
    else if(Number(object.size)!==Number(row.size_bytes))counts.sizeMismatches++;
  }
  for(const row of intents) {
    if(row.state==='cleanup')counts.cleanupPending++;
    if(row.state==='uploading'&&Date.now()/1000-Number(row.created_at)>3600)counts.staleUploads++;
  }
  let cursor;
  do {
    const page=await env.MEDIA_BUCKET.list({cursor,limit:1000});
    for(const object of page.objects) {
      counts.objectBytes+=Number(object.size);
      if(!referenced.has(object.key)) {counts.orphanObjects++;counts.orphanBytes+=Number(object.size);}
    }
    cursor=page.truncated?page.cursor:undefined;
  } while(cursor);
  return { ...counts, storage:await storageSummary(env) };
}

// Bounded stream, not a 95 MB in-memory buffer. Also rejects forged headers,
// truncation, cancellation and a sender that stalls forever.
export function verifiedStream(stream, expected, maximum = expected, timeoutMs = 600000) {
  const reader=stream.getReader(); let received=0, timer;
  return new ReadableStream({
    start(controller) { timer=setTimeout(()=>{controller.error(new Error('Upload timed out'));reader.cancel().catch(()=>{});},timeoutMs); },
    async pull(controller) {
      try {
        const {done,value}=await reader.read();
        if(done) {
          clearTimeout(timer);
          if(expected!==null&&received!==expected)throw new Error('Upload length mismatch');
          controller.close(); return;
        }
        received+=value.byteLength;
        if(received>maximum)throw new Error('Upload too large');
        controller.enqueue(value);
      } catch(error) {clearTimeout(timer);reader.cancel().catch(()=>{});controller.error(error);}
    },
    cancel(reason) {clearTimeout(timer);return reader.cancel(reason);},
  });
}

export function objectUploadStream(stream, size) {
  const verified = verifiedStream(stream,size);
  if(typeof globalThis.FixedLengthStream !== 'function')return {stream:verified,complete:Promise.resolve()};
  // R2 requires a known-length stream. Keep byte verification while supplying
  // that runtime contract; no full-file buffering and no trusted header bypass.
  const fixed = new globalThis.FixedLengthStream(size);
  const complete = verified.pipeTo(fixed.writable);
  complete.catch(()=>{}); // Awaited after PUT; also observe early pipe failures.
  return {stream:fixed.readable,complete};
}
