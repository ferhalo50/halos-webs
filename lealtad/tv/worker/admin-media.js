const FORMATS = Object.freeze({
  '.jpg': { type: 'image', mime: 'image/jpeg' },
  '.jpeg': { type: 'image', mime: 'image/jpeg' },
  '.png': { type: 'image', mime: 'image/png' },
  '.webp': { type: 'image', mime: 'image/webp' },
  '.mp4': { type: 'video', mime: 'video/mp4' },
});

export function storageSummary(env, usedBytes = 0) {
  const raw = Number(env.TV_STORAGE_LIMIT_BYTES);
  const limitBytes = Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  const percent = limitBytes ? Math.min(100, Math.round(usedBytes / limitBytes * 100)) : null;
  const state = percent === null ? 'unconfigured' : percent >= 100 ? 'full' : percent >= 90 ? 'critical' : percent >= 80 ? 'warning' : 'normal';
  return { usedBytes, limitBytes, percent, state };
}

export function validateUploadMetadata(file, storage, maxUploadBytes) {
  const name = typeof file?.name === 'string' ? file.name.trim() : '';
  const size = file?.size;
  const mime = file?.mime;
  const extension = /\.[a-z0-9]+$/i.exec(name)?.[0]?.toLowerCase();
  const format = extension ? FORMATS[extension] : null;
  if (!name || name.length > 180 || name.includes('/') || name.includes('\\') || !format || format.mime !== mime) {
    return { valid: false, status: 415, message: 'Formato no admitido. Usa JPG, PNG, WebP o MP4.' };
  }
  if (!Number.isSafeInteger(size) || size <= 0) {
    return { valid: false, status: 400, message: 'El archivo debe tener un tamaño válido.' };
  }
  if (maxUploadBytes !== null && size > maxUploadBytes) {
    return { valid: false, status: 413, message: 'El archivo supera el tamaño máximo permitido.' };
  }
  if (storage.limitBytes === null) {
    return { valid: false, status: 503, message: 'El límite de almacenamiento aún no está configurado.' };
  }
  if (storage.usedBytes + size > storage.limitBytes) {
    return { valid: false, status: 413, message: 'No hay espacio suficiente para este archivo.' };
  }
  return { valid: true, type: format.type, size, message: 'Formato y tamaño aceptados para la futura subida.' };
}

export async function baseContent(request, env) {
  const mediaUrl = new URL('/media.json', request.url);
  const response = await env.ASSETS.fetch(new Request(mediaUrl));
  if (!response.ok) throw new Error('No se pudo leer media.json.');
  const media = await response.json();
  const items = await Promise.all(media.items.map(async (item, index) => {
    const source = new URL(item.source, request.url);
    let sizeBytes = null;
    if (source.origin === mediaUrl.origin && source.pathname.startsWith('/media/')) {
      const file = await env.ASSETS.fetch(new Request(source, { method: 'HEAD' }));
      const length = Number(file.headers.get('content-length'));
      if (file.ok && Number.isSafeInteger(length) && length >= 0) sizeBytes = length;
    }
    return {
      id: item.id,
      name: item.name,
      type: item.type,
      source: item.source,
      thumbnail: item.thumbnail || null,
      origin: 'base',
      active: true,
      order: index + 1,
      sizeBytes,
    };
  }));
  return { version: media.version, items };
}

export function configuredUploadMax(env) {
  const value = Number(env.TV_MAX_UPLOAD_BYTES);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
