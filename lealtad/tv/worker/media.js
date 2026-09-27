function securityHeaders(headers) {
  headers.set('x-content-type-options', 'nosniff');
  headers.set('accept-ranges', 'bytes');
  return headers;
}

export function parseRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || value.includes(',')) return { invalid: true };
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { invalid: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return { invalid: true };
    end = Math.min(end, size - 1);
  }
  return { offset: start, length: end - start + 1, start, end };
}

export async function objectResponse(request, env, row, allowInactive = false) {
  if (!row || row.deleting || (!allowInactive && !row.active)) return new Response('No encontrado.', { status: 404 });
  const range = parseRange(request.headers.get('range'), Number(row.size_bytes));
  if (range?.invalid) return new Response(null, { status: 416, headers: securityHeaders(new Headers({ 'content-range': `bytes */${row.size_bytes}` })) });
  const object = await env.MEDIA_BUCKET.get(row.storage_key, range ? { range: { offset: range.offset, length: range.length } } : undefined);
  if (!object) return new Response('No encontrado.', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set('content-type', row.mime_type);
  headers.set('etag', object.httpEtag || object.etag || `"${row.id}"`);
  headers.set('cache-control', allowInactive ? 'private, no-store' : 'public, max-age=86400, immutable');
  if (range) {
    headers.set('content-range', `bytes ${range.start}-${range.end}/${row.size_bytes}`);
    headers.set('content-length', String(range.length));
  } else headers.set('content-length', String(row.size_bytes));
  return new Response(request.method === 'HEAD' ? null : object.body, { status: range ? 206 : 200, headers: securityHeaders(headers) });
}

async function mediaRow(env, id) {
  return env.TV_DB.prepare('SELECT id,storage_key,mime_type,size_bytes,active,deleting FROM media WHERE id=?').bind(id).first();
}

export async function handlePublicMedia(request, env, id) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Método no permitido.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  if (env.R2_MEDIA_ENABLED !== 'true' || !env.TV_DB || !env.MEDIA_BUCKET) return new Response('No encontrado.', { status: 404 });
  return objectResponse(request, env, await mediaRow(env, id));
}

async function fallbackPlaylist(request, env) {
  const response = await env.ASSETS.fetch(new Request(new URL('/media.json', request.url), request));
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-cache');
  headers.set('x-renace-playlist-source', 'fallback');
  return new Response(response.body, { status: response.status, headers });
}

export async function handlePlaylist(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Método no permitido.', { status: 405 });
  if (env.R2_MEDIA_ENABLED !== 'true' || !env.TV_DB || !env.MEDIA_BUCKET) return fallbackPlaylist(request, env);
  try {
    const rows = await env.TV_DB.prepare(`SELECT id,display_name,media_type FROM media
      WHERE active=1 AND deleting=0 ORDER BY sort_order,created_at,id`).all();
    const musicResponse = await env.ASSETS.fetch(new Request(new URL('/media.json', request.url)));
    const legacy = musicResponse.ok ? await musicResponse.json() : {};
    const body = {
      version: `r2-${Date.now()}`,
      slideDurationSeconds: Number(legacy.slideDurationSeconds) || 10,
      music: legacy.music || null,
      items: (rows.results || []).map(row => ({ id: row.id, name: row.display_name, type: row.media_type, source: `/media/item/${encodeURIComponent(row.id)}`, fit: 'contain' })),
    };
    return Response.json(body, { headers: { 'cache-control': 'no-cache, max-age=0', 'x-renace-playlist-source': 'r2' } });
  } catch {
    return fallbackPlaylist(request, env);
  }
}
