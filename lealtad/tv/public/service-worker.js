const SHELL_VERSION = '1.0.0';
const SHELL_CACHE = `renace-tv-shell-${SHELL_VERSION}`;
const MEDIA_CACHE_PREFIX = 'renace-tv-media-';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/tv.css',
  '/assets/tv.js',
  '/assets/tv-icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('renace-tv-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

function safeVersion(value) {
  return String(value || 'current').replace(/[^a-z0-9._-]/gi, '-');
}

async function partialResponse(response, rangeHeader) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader || '');
  if (!match) return response;
  const bytes = await response.arrayBuffer();
  const total = bytes.byteLength;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${total}` } });
  }
  const headers = new Headers(response.headers);
  headers.set('content-range', `bytes ${start}-${end}/${total}`);
  headers.set('content-length', String(end - start + 1));
  headers.set('accept-ranges', 'bytes');
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

async function preparedOrNetwork(request) {
  const normalized = new Request(request.url, { method: 'GET' });
  const cached = await caches.match(normalized);
  if (!cached) return fetch(request);
  const range = request.headers.get('range');
  return range ? partialResponse(cached.clone(), range) : cached;
}

async function networkFirst(request, fallback = null) {
  try {
    const response = await fetch(request);
    if (response.ok && new URL(request.url).origin === self.location.origin) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (fallback ? await caches.match(fallback) : Response.error());
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/index.html'));
    return;
  }
  if (url.origin === self.location.origin && url.pathname === '/media.json') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (['image', 'video', 'audio'].includes(request.destination) || url.pathname.startsWith('/media/')) {
    event.respondWith(preparedOrNetwork(request));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(request).then(cached => cached || networkFirst(request)));
  }
});

async function prepareMedia(message, port) {
  const urls = Array.from(new Set((message.urls || []).filter(Boolean)));
  const cacheName = `${MEDIA_CACHE_PREFIX}${safeVersion(message.version)}`;
  const cache = await caches.open(cacheName);
  let complete = 0;
  for (const value of urls) {
    const url = new URL(value, self.location.origin);
    const request = new Request(url.href, { mode: url.origin === self.location.origin ? 'same-origin' : 'no-cors' });
    const response = await fetch(request);
    if (!response.ok && response.type !== 'opaque') throw new Error(`No se pudo guardar ${url.pathname || url.href}.`);
    await cache.put(new Request(url.href, { method: 'GET' }), response.clone());
    complete += 1;
    port.postMessage({ type: 'progress', complete, total: urls.length });
  }
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith(MEDIA_CACHE_PREFIX) && key !== cacheName).map(key => caches.delete(key)));
  port.postMessage({ type: 'complete', complete, total: urls.length, cacheName });
}

self.addEventListener('message', event => {
  if (event.data?.type !== 'PREPARE_OFFLINE' || !event.ports?.[0]) return;
  const port = event.ports[0];
  event.waitUntil(prepareMedia(event.data, port).catch(error => {
    const quota = error?.name === 'QuotaExceededError';
    port.postMessage({ type: 'error', message: quota ? 'No hay espacio suficiente en el dispositivo.' : (error?.message || 'No se pudo preparar el contenido.') });
  }));
});
