const elements = {
  grid: document.querySelector('#media-grid'),
  empty: document.querySelector('#empty-state'),
  summary: document.querySelector('#library-summary'),
  playSelected: document.querySelector('#play-selected'),
  playAll: document.querySelector('#play-all'),
  selectAll: document.querySelector('#select-all'),
  clearSelection: document.querySelector('#clear-selection'),
  selectionCount: document.querySelector('#selection-count'),
  music: document.querySelector('#toggle-music'),
  offline: document.querySelector('#prepare-offline'),
  offlineStatus: document.querySelector('#offline-status'),
  offlineLabel: document.querySelector('#offline-label'),
  offlineDetail: document.querySelector('#offline-detail'),
  offlineProgress: document.querySelector('#offline-progress'),
  connection: document.querySelector('#connection-status'),
  presentation: document.querySelector('#presentation'),
  stage: document.querySelector('#media-stage'),
  audio: document.querySelector('#ambient-audio'),
  toast: document.querySelector('#toast')
};

const state = {
  config: { version: 'current', slideDurationSeconds: 10, music: null, items: [] },
  selected: new Set(),
  playlist: [],
  index: 0,
  timer: null,
  toastTimer: null,
  playing: false,
  musicPlaying: false,
  fullscreenWasActive: false,
  returnFocus: null,
  generation: 0, failed: new Set(), transitioning: false, transitionTimer: null, watchdog: null, mediaListeners: null
};

function showToast(message, duration = 4200) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = setTimeout(() => { elements.toast.hidden = true; }, duration);
}

function normalizeMusic(value) {
  if (typeof value === 'string' && value.trim()) return { source: value.trim(), name: 'Música ambiental' };
  if (value && typeof value.source === 'string' && value.source.trim()) {
    return { source: value.source.trim(), name: String(value.name || 'Música ambiental') };
  }
  return null;
}

function normalizeItem(item, index) {
  const type = item?.type === 'video' ? 'video' : item?.type === 'image' ? 'image' : '';
  const source = typeof item?.source === 'string' ? item.source.trim() : '';
  if (!type || !source) return null;
  return {
    id: String(item.id || `media-${index + 1}`),
    name: String(item.name || `Contenido ${index + 1}`),
    type,
    source,
    fit: item.fit === 'cover' ? 'cover' : 'contain',
    thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail.trim() : '',
    durationSeconds: Number(item.durationSeconds) > 0 ? Number(item.durationSeconds) : null
  };
}

async function loadConfig() {
  const response = await fetch('/media.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo abrir la biblioteca de contenido.');
  const value = await response.json();
  const items = Array.isArray(value.items) ? value.items.map(normalizeItem).filter(Boolean) : [];
  return {
    version: String(value.version || 'current'),
    slideDurationSeconds: Math.max(.25, Number(value.slideDurationSeconds) || 10),
    music: normalizeMusic(value.music),
    items
  };
}

function createThumbnail(item) {
  const frame = document.createElement('span');
  frame.className = 'media-thumb';
  if (item.thumbnail || item.type === 'image') {
    const image = document.createElement('img');
    image.src = item.thumbnail || item.source;
    image.alt = '';
    image.loading = 'lazy';
    image.addEventListener('error', () => {
      image.remove();
      const fallback = document.createElement('span');
      fallback.className = 'fallback-art';
      fallback.textContent = item.type === 'video' ? '▶' : 'R';
      frame.prepend(fallback);
    }, { once: true });
    frame.append(image);
  } else {
    const fallback = document.createElement('span');
    fallback.className = 'fallback-art';
    fallback.textContent = '▶';
    frame.append(fallback);
  }
  const badge = document.createElement('span');
  badge.className = 'type-badge';
  badge.textContent = item.type === 'video' ? 'Video' : 'Imagen';
  frame.append(badge);
  return frame;
}

function createCard(item) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'media-card';
  card.dataset.mediaId = item.id;
  card.setAttribute('aria-pressed', 'false');
  card.setAttribute('aria-label', `Seleccionar ${item.name}`);

  const check = document.createElement('span');
  check.className = 'check';
  check.setAttribute('aria-hidden', 'true');
  check.textContent = '✓';
  card.append(check, createThumbnail(item));

  const meta = document.createElement('span');
  meta.className = 'media-meta';
  const copy = document.createElement('span');
  const name = document.createElement('strong');
  name.textContent = item.name;
  const kind = document.createElement('span');
  kind.textContent = item.type === 'video' ? 'MP4 · completo' : `${item.durationSeconds || state.config.slideDurationSeconds} s`;
  copy.append(name, kind);
  meta.append(copy);
  card.append(meta);

  card.addEventListener('click', () => toggleSelection(item.id));
  return card;
}

function renderLibrary() {
  elements.grid.textContent = '';
  state.config.items.forEach(item => elements.grid.append(createCard(item)));
  elements.empty.hidden = state.config.items.length > 0;
  elements.grid.hidden = state.config.items.length === 0;
  const images = state.config.items.filter(item => item.type === 'image').length;
  const videos = state.config.items.length - images;
  elements.summary.textContent = state.config.items.length ? `${images} ${images === 1 ? 'imagen' : 'imágenes'} · ${videos} ${videos === 1 ? 'video' : 'videos'}` : 'Sin contenido cargado';
  elements.playAll.disabled = state.config.items.length === 0;
  elements.selectAll.disabled = state.config.items.length === 0;
  updateSelection();
}

function toggleSelection(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  updateSelection();
}

function updateSelection() {
  try{localStorage.setItem('renace-tv-selection',JSON.stringify([...state.selected]));}catch{}
  const total = state.selected.size;
  document.querySelectorAll('.media-card').forEach(card => {
    const selected = state.selected.has(card.dataset.mediaId);
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  });
  elements.playSelected.disabled = total === 0;
  elements.clearSelection.disabled = total === 0;
  elements.selectionCount.textContent = `${total} ${total === 1 ? 'elemento' : 'elementos'}`;
}

function selectedItems() {
  return state.config.items.filter(item => state.selected.has(item.id));
}

function clearTimer() {
  clearTimeout(state.timer);state.timer=null;
}
function releaseMedia(){
  clearTimer();clearInterval(state.watchdog);state.watchdog=null;
  state.mediaListeners?.abort();state.mediaListeners=null;
  const video=elements.stage.querySelector('video');
  if(video){video.pause();video.removeAttribute('src');video.load();}
  elements.stage.replaceChildren();
}
function fadeDuration(){return matchMedia('(prefers-reduced-motion: reduce)').matches?0:160;}
function scheduleNext(seconds){clearTimer();state.timer=setTimeout(()=>advance(1),seconds*1000);}
function showCurrentItem(){
  releaseMedia();
  const item=state.playlist[state.index];if(!item)return exitPresentation();
  const generation=++state.generation,current=()=>state.playing&&generation===state.generation;
  const controller=new AbortController();state.mediaListeners=controller;
  const listen=(node,event,fn)=>node.addEventListener(event,fn,{signal:controller.signal});
  elements.presentation.dataset.index=String(state.index);
  elements.stage.style.opacity='0';
  let failed=false,ready=false,lastProgress=performance.now(),lastTime=-1,frames=0;
  const reveal=()=>{if(!current())return;ready=true;state.failed.delete(item.id);elements.stage.style.opacity='1';};
  const fail=reason=>{
    if(!current()||failed)return;failed=true;state.failed.add(item.id);
    const v=elements.stage.querySelector('video');
    console.warn('[Renace TV] Medio omitido', {id:item.id,reason,code:v?.error?.code,readyState:v?.readyState,width:v?.videoWidth,height:v?.videoHeight,currentTime:v?.currentTime});
    if(state.playlist.every(x=>state.failed.has(x.id))){exitPresentation();showToast('No pudimos reproducir esta selección. Revisa tu conexión o elige otro contenido.');}
    else advance(1);
  };
  const started=performance.now();
  if(item.type==='video'){
    const video=document.createElement('video');
    video.muted=true;video.autoplay=true;video.controls=false;video.loop=false;video.playsInline=true;video.preload='auto';
    video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.style.objectFit=item.fit;
    let frameCallback;
    if(video.requestVideoFrameCallback){const onFrame=()=>{if(!current())return;frames++;lastProgress=performance.now();if(!ready)reveal();frameCallback=video.requestVideoFrameCallback(onFrame);};frameCallback=video.requestVideoFrameCallback(onFrame);controller.signal.addEventListener('abort',()=>video.cancelVideoFrameCallback(frameCallback),{once:true});}
    listen(video,'loadedmetadata',()=>{if(!video.videoWidth||!video.videoHeight)fail('metadata_without_video');});
    listen(video,'canplay',()=>{if(!current())return;video.play().catch(()=>fail('play_rejected'));});
    listen(video,'error',()=>fail('media_error'));
    listen(video,'ended',()=>{if(current())advance(1);});
    state.watchdog=setInterval(()=>{
      if(!current())return;const now=performance.now();
      if(!video.requestVideoFrameCallback&&video.currentTime>lastTime&&video.readyState>=2&&video.videoWidth>0){lastProgress=now;if(!ready&&video.currentTime>0)reveal();}
      lastTime=video.currentTime;
      if(!ready&&now-started>15000)fail('start_timeout');
      else if(ready&&now-lastProgress>10000)fail('playback_stalled');
    },1000);
    elements.stage.append(video);video.src=item.source;video.play().catch(()=>fail('play_rejected'));
  }else{
    const img=document.createElement('img');img.alt='';img.style.objectFit=item.fit;
    listen(img,'load',()=>{if(!current())return;clearInterval(state.watchdog);reveal();scheduleNext(item.durationSeconds||state.config.slideDurationSeconds);});
    listen(img,'error',()=>fail('image_error'));
    state.watchdog=setInterval(()=>{if(performance.now()-started>15000)fail('image_timeout');},1000);
    elements.stage.append(img);img.src=item.source;
  }
}
function advance(direction){
  if(!state.playing||!state.playlist.length||state.transitioning)return;
  state.transitioning=true;clearTimer();elements.stage.style.opacity='0';
  state.transitionTimer=setTimeout(()=>{state.transitioning=false;if(!state.playing)return;state.index=(state.index+direction+state.playlist.length)%state.playlist.length;showCurrentItem();},fadeDuration());
}
async function requestPresentationFullscreen(){
  const request=elements.presentation.requestFullscreen||elements.presentation.webkitRequestFullscreen;
  if(!request)return;
  try{await request.call(elements.presentation);state.fullscreenWasActive=Boolean(document.fullscreenElement||document.webkitFullscreenElement);}catch{state.fullscreenWasActive=false;}
}
function startPresentation(items,trigger){
  if(!items.length)return showToast('Selecciona al menos un elemento para reproducir.');
  state.playlist=items.slice();state.index=0;state.failed=new Set();state.playing=true;state.returnFocus=trigger||document.activeElement;state.fullscreenWasActive=false;
  elements.presentation.hidden=false;document.body.style.overflow='hidden';document.body.classList.add('presenting');elements.toast.hidden=true;
  showCurrentItem();requestPresentationFullscreen();elements.presentation.focus({preventScroll:true});
}
async function exitPresentation(){
  if(!state.playing)return;
  state.playing=false;state.generation++;clearTimeout(state.transitionTimer);state.transitioning=false;releaseMedia();
  elements.presentation.hidden=true;document.body.style.overflow='';document.body.classList.remove('presenting');
  if(document.fullscreenElement||document.webkitFullscreenElement){const exit=document.exitFullscreen||document.webkitExitFullscreen;if(exit){try{await exit.call(document);}catch{}}}
  if(state.returnFocus?.isConnected)state.returnFocus.focus({preventScroll:true});
}

function updateMusicButtons() {
  const available = Boolean(state.config.music);
  [elements.music].forEach(button => {
    button.disabled = !available;
    button.setAttribute('aria-pressed', String(state.musicPlaying));
  });
  elements.music.textContent = state.musicPlaying ? '♪ Música ambiental · Encendida' : '♪ Música ambiental · Apagada';
}

async function toggleMusic() {
  if (!state.config.music) return showToast('Agrega una pista en media.json para usar música ambiental.');
  if (state.musicPlaying) {
    elements.audio.pause();
    state.musicPlaying = false;
    updateMusicButtons();
    return;
  }
  try {
    await elements.audio.play();
    state.musicPlaying = true;
    updateMusicButtons();
  } catch {
    state.musicPlaying = false;
    updateMusicButtons();
    showToast('El dispositivo no permitió iniciar la música. Presiona otra vez el botón central.');
  }
}

function setOfflineProgress(complete, total, label = 'Preparando contenido…') {
  const percent = total ? Math.round((complete / total) * 100) : 0;
  elements.offlineStatus.hidden = false;
  elements.offlineLabel.textContent = label;
  elements.offlineDetail.textContent = total ? `${complete} de ${total} archivos` : '';
  elements.offlineProgress.value = percent;
  elements.offlineProgress.textContent = `${percent}%`;
}

async function prepareOffline() {
  if (!('serviceWorker' in navigator)) return showToast('Este navegador no permite preparar contenido sin conexión.');
  const items = state.selected.size ? selectedItems() : state.config.items;
  if (!items.length) return showToast('No hay contenido para preparar.');
  elements.offline.disabled = true;
  setOfflineProgress(0, 0);
  try {
    const registration = await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error('El modo sin conexión no está listo. Recarga e intenta de nuevo.')), 10000))]);
    const worker = registration.active || registration.waiting || registration.installing;
    if (!worker) throw new Error('El modo sin conexión todavía no está listo. Intenta de nuevo.');
    const channel = new MessageChannel();
    const result = new Promise((resolve, reject) => {
      let timer;
      const finish = (fn, value) => { clearTimeout(timer); channel.port1.close(); fn(value); };
      const arm = () => { clearTimeout(timer); timer = setTimeout(() => finish(reject, new Error('La descarga tardó demasiado. Revisa tu conexión e intenta de nuevo.')), 120000); };
      arm();
      channel.port1.onmessage = event => {
        arm();
        const message = event.data || {};
        if (message.type === 'progress') setOfflineProgress(message.complete, message.total);
        if (message.type === 'complete') finish(resolve, message);
        if (message.type === 'error') finish(reject, new Error(message.message));
      };
    });
    worker.postMessage({ type: 'PREPARE_OFFLINE', config: { ...state.config, items } }, [channel.port2]);
    const completed = await result;
    setOfflineProgress(completed.total, completed.total, 'Listo para usar sin conexión');
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage ? `${(estimate.usage / 1048576).toFixed(1)} MB usados` : '';
      if (used) elements.offlineDetail.textContent = `${completed.total} archivos · ${used}`;
    }
    showToast('El contenido quedó guardado en este dispositivo.');
  } catch (error) {
    elements.offlineStatus.hidden = false;
    elements.offlineLabel.textContent = 'No se pudo preparar el contenido';
    elements.offlineDetail.textContent = error?.message || 'Revisa la conexión y el espacio disponible.';
    showToast(elements.offlineDetail.textContent, 6500);
  } finally {
    elements.offline.disabled = false;
  }
}

function updateConnection() {
  const online = navigator.onLine;
  elements.connection.classList.toggle('is-offline', !online);
  elements.connection.querySelector('b').textContent = online ? 'Conectado' : 'Sin conexión';
}

function handlePresentationKeys(event) {
  if(!state.playing)return moveLibraryFocus(event);
  if(event.key==='Escape'){event.preventDefault();exitPresentation();}
  else if(event.key==='ArrowRight'){event.preventDefault();advance(1);}
  else if(event.key==='ArrowLeft'){event.preventDefault();advance(-1);}
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('/service-worker.js', { scope: '/' }); }
  catch { showToast('El modo sin conexión no está disponible en este momento.'); }
}

function moveLibraryFocus(event) {
  const direction = {ArrowRight:[1,0],ArrowLeft:[-1,0],ArrowDown:[0,1],ArrowUp:[0,-1]}[event.key];
  if (!direction) return;
  const buttons = [...document.querySelectorAll('main button:not(:disabled), main a.button')].filter(button => button.getClientRects().length);
  const active = document.activeElement;
  if (!buttons.includes(active)) { event.preventDefault(); buttons[0]?.focus(); return; }
  const from = active.getBoundingClientRect(), x = from.x + from.width/2, y = from.y + from.height/2;
  let target, score = Infinity;
  buttons.filter(button => button !== active).forEach(button => {
    const rect = button.getBoundingClientRect(), dx = rect.x + rect.width/2-x, dy = rect.y+rect.height/2-y;
    const forward = dx*direction[0]+dy*direction[1], cross = Math.abs(direction[0] ? dy : dx);
    const distance = forward+cross*3;
    if (forward > 5 && distance < score) { target=button;score=distance; }
  });
  if(target){event.preventDefault();target.focus();target.scrollIntoView({block:'nearest'});}
}

elements.audio.addEventListener('error', () => { state.musicPlaying=false; updateMusicButtons(); showToast('No se pudo abrir la música. Revisa tu conexión o prepara el contenido sin conexión.'); });
elements.playSelected.addEventListener('click', event => startPresentation(selectedItems(), event.currentTarget));
elements.playAll.addEventListener('click', event => startPresentation(state.config.items, event.currentTarget));
elements.selectAll.addEventListener('click', () => { state.config.items.forEach(item => state.selected.add(item.id)); updateSelection(); });
elements.clearSelection.addEventListener('click', () => { state.selected.clear(); updateSelection(); });
elements.music.addEventListener('click', toggleMusic);
elements.offline.addEventListener('click', prepareOffline);
elements.presentation.addEventListener('dblclick', exitPresentation);
document.querySelector('#open-spotify').addEventListener('click',()=>{elements.audio.pause();state.musicPlaying=false;updateMusicButtons();});
window.addEventListener('online', updateConnection);
window.addEventListener('offline', updateConnection);
window.addEventListener('keydown', handlePresentationKeys, true);
document.addEventListener('fullscreenchange', () => {
  if (state.playing && state.fullscreenWasActive && !document.fullscreenElement) exitPresentation();
});
document.addEventListener('webkitfullscreenchange', () => {
  if (state.playing && state.fullscreenWasActive && !document.webkitFullscreenElement) exitPresentation();
});

async function init() {
  updateConnection();
  registerServiceWorker();
  try {
    state.config = await loadConfig();
    try{const saved=JSON.parse(localStorage.getItem('renace-tv-selection')||'[]');if(Array.isArray(saved))state.selected=new Set(saved.filter(id=>state.config.items.some(item=>item.id===id)));}catch{}
    if (state.config.music) {
      elements.audio.src = state.config.music.source;
      elements.audio.setAttribute('aria-label', state.config.music.name);
    }
    updateMusicButtons();
    renderLibrary();
  } catch (error) {
    elements.summary.textContent = 'Biblioteca no disponible';
    elements.empty.hidden = false;
    elements.grid.hidden = true;
    showToast(error?.message || 'No se pudo cargar la biblioteca.', 6500);
  }
}

init();
