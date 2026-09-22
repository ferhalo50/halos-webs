const SHELL_CACHE = 'renace-tv-shell-1.2.2';
const MEDIA_PREFIX = 'renace-tv-media-';
const META_CACHE = 'renace-tv-state';
const POINTER = '/__tv_offline_state__';
const SHELL = ['/', '/manifest.webmanifest', '/assets/tv.css', '/assets/tv.js', '/assets/tv-icon.svg', '/media/images/logo-renace.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('renace-tv-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));

async function savedState() {
  const response = await (await caches.open(META_CACHE)).match(POINTER);
  return response ? response.json() : null;
}
async function savedMedia(request) {
  const state = await savedState();
  if (!state) return null;
  return (await caches.open(state.cache)).match(request.url);
}
async function partial(response, range) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range || '');
  if (!match || (!match[1] && !match[2])) return response;
  const bytes = await response.arrayBuffer(), size = bytes.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) return new Response(null, {status:416, headers:{'content-range':`bytes */${size}`}});
  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.set('content-range', `bytes ${start}-${end}/${size}`);
  headers.set('content-length', String(end-start+1));
  headers.set('accept-ranges', 'bytes');
  return new Response(bytes.slice(start,end+1), {status:206,headers});
}
async function media(request) {
  try { const response = await fetch(request); if(response.ok) return response; } catch {}
  const cached = await savedMedia(request);
  return cached ? (request.headers.has('range') ? partial(cached,request.headers.get('range')) : cached) : Response.error();
}
async function configuration(request) {
  try { const response = await fetch(request); if(response.ok) return response; } catch {}
  const state = await savedState();
  return state ? Response.json(state.config) : Response.error();
}
async function shell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if(response.ok) await cache.put(request,response.clone());
    return response;
  } catch { return (await cache.match(request)) || (request.mode === 'navigate' ? await cache.match('/') : Response.error()); }
}
self.addEventListener('fetch', event => {
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(url.origin===self.location.origin&&url.pathname==='/media.json') event.respondWith(configuration(request));
  else if(['image','audio','video'].includes(request.destination)||url.pathname.startsWith('/media/')) event.respondWith(media(request));
  else if(url.origin===self.location.origin) event.respondWith(shell(request));
});

let preparing=false;
async function prepare(message,port) {
  if(preparing) throw new Error('Ya hay una preparación en curso. Espera a que termine.');
  preparing=true;
  const name=MEDIA_PREFIX+String(message.config.version).replace(/[^a-z0-9._-]/gi,'-')+'-'+Date.now();
  let committed=false;
  try {
    const cache=await caches.open(name),config=message.config;
    const urls=[...new Set(config.items.flatMap(item=>[item.source,item.thumbnail]).concat(config.music?.source).filter(Boolean))];
    for(let i=0;i<urls.length;i++) {
      const url=new URL(urls[i],self.location.origin);
      if(!['http:','https:'].includes(url.protocol)||url.origin!==self.location.origin)throw new Error('Dirección de contenido no válida.');
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
      try {
        const response=await fetch(url.href,{cache:'reload',signal:controller.signal,mode:'cors'});
        if(!response.ok||response.status===206||/text\/html/.test(response.headers.get('content-type')||''))throw new Error('No se pudo guardar '+url.pathname);
        await cache.put(url.href,response);
      } finally {clearTimeout(timer);}
      port.postMessage({type:'progress',complete:i+1,total:urls.length});
    }
    // Commit the complete playlist and cache together. Failed downloads preserve the previous set.
    await (await caches.open(META_CACHE)).put(POINTER,Response.json({cache:name,config}));
    committed=true;
    await Promise.all((await caches.keys()).filter(key=>key.startsWith(MEDIA_PREFIX)&&key!==name).map(key=>caches.delete(key)));
    port.postMessage({type:'complete',complete:urls.length,total:urls.length});
  } finally {
    if(!committed)await caches.delete(name);
    preparing=false;
  }
}
self.addEventListener('message', event => {
  if(event.data?.type!=='PREPARE_OFFLINE'||!event.ports?.[0])return;
  const port=event.ports[0];
  event.waitUntil(prepare(event.data,port).catch(error=>port.postMessage({type:'error',message:error.name==='QuotaExceededError'?'No hay espacio suficiente. La biblioteca guardada anteriormente se conserva.':error.message||'No se pudo preparar el contenido.'})));
});
