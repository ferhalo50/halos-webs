const FORMATS = Object.freeze({
  '.jpg': { type: 'image', mime: 'image/jpeg' },
  '.jpeg': { type: 'image', mime: 'image/jpeg' },
  '.png': { type: 'image', mime: 'image/png' },
  '.webp': { type: 'image', mime: 'image/webp' },
  '.mp4': { type: 'video', mime: 'video/mp4' },
});

export function configuredUploadMax(env) {
  const value = Number(env.TV_MAX_UPLOAD_BYTES);
  return Number.isSafeInteger(value) && value > 0 ? value : 95_000_000;
}

export function storageState(usedBytes, limitBytes) {
  const percent = limitBytes > 0 ? Math.min(100, Math.round(usedBytes / limitBytes * 100)) : null;
  const state = percent === null ? 'unconfigured' : percent >= 100 ? 'full' : percent >= 90 ? 'critical' : percent >= 80 ? 'warning' : 'normal';
  return { usedBytes, limitBytes, percent, state };
}

export async function storageSummary(env) {
  const row = await env.TV_DB.prepare('SELECT storage_limit_bytes,used_bytes FROM settings WHERE id=\'main\'').first();
  return row ? storageState(Number(row.used_bytes), Number(row.storage_limit_bytes)) : storageState(0, 0);
}

export function validateUploadMetadata(file, storage, maxUploadBytes) {
  const name = typeof file?.name === 'string' ? file.name.trim() : '';
  const size = Number(file?.size);
  const mime = typeof file?.type === 'string' ? file.type.toLowerCase() : typeof file?.mime === 'string' ? file.mime.toLowerCase() : '';
  const extension = /\.[a-z0-9]+$/i.exec(name)?.[0]?.toLowerCase();
  const format = extension ? FORMATS[extension] : null;
  if (!name || name.length > 180 || name.includes('/') || name.includes('\\') || !format) {
    return { valid: false, status: 415, code: 'unsupported_format', message: 'Este formato no es compatible. Usa JPG, PNG, WebP o MP4.' };
  }
  if (!Number.isSafeInteger(size) || size <= 0) return { valid: false, status: 400, message: 'El archivo debe tener un tamaño válido.' };
  if (size > maxUploadBytes) return { valid: false, status: 413, message: 'El archivo supera el tamaño máximo permitido.' };
  if (!storage.limitBytes) return { valid: false, status: 503, message: 'El límite de almacenamiento aún no está configurado.' };
  if (storage.usedBytes + size > storage.limitBytes) return { valid: false, status: 413, message: 'No hay espacio suficiente para este archivo.' };
  return { valid: true, type: format.type, mime: format.mime, declaredMime: mime, extension, size, message: 'Formato y tamaño aceptados.' };
}

export async function verifyFileSignature(file, format) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (format.mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (format.mime === 'image/png') return [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value,index) => bytes[index] === value);
  if (format.mime === 'image/webp') return String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (format.mime === 'video/mp4') return String.fromCharCode(...bytes.slice(4,8)) === 'ftyp';
  return false;
}

export function safeStorageKey(id, extension) {
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^\.(?:jpe?g|png|webp|mp4)$/.test(extension)) throw new Error('Clave no válida.');
  return `library/${id.slice(0,2)}/${id}${extension === '.jpeg' ? '.jpg' : extension}`;
}

export async function listMedia(env) {
  const result = await env.TV_DB.prepare(`SELECT id,original_filename,display_name,media_type,mime_type,size_bytes,active,sort_order,created_at
    FROM media WHERE deleting=0 ORDER BY sort_order,created_at,id`).all();
  return (result.results || []).map(row => ({
    id: row.id,
    name: row.display_name,
    originalFilename: row.original_filename,
    type: row.media_type,
    mime: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    active: Boolean(row.active),
    order: Number(row.sort_order),
    origin: 'Renace',
    source: `/media/item/${encodeURIComponent(row.id)}`,
    preview: `/admin/api/media/${encodeURIComponent(row.id)}`,
  }));
}

export async function audit(env, actorId, action, mediaId = null, metadata = null) {
  const safeMetadata = metadata ? JSON.stringify(metadata).slice(0, 2000) : null;
  await env.TV_DB.prepare('INSERT INTO audit_log(actor_id,action,media_id,metadata_json) VALUES(?,?,?,?)').bind(actorId, action, mediaId, safeMetadata).run();
}
