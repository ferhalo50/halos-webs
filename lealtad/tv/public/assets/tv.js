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
  nowPlaying: document.querySelector('#now-playing-title'),
  presentationProgress: document.querySelector('#presentation-progress'),
  presentationMusic: document.querySelector('#presentation-music'),
  exit: document.querySelector('#exit-presentation'),
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
  returnFocus: null
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
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  elements.presentationProgress.className = '';
  elements.presentationProgress.style.animationDuration = '';
}

function scheduleNext(seconds) {
  clearTimer();
  elements.presentationProgress.style.animationDuration = `${seconds}s`;
  elements.presentationProgress.className = 'is-timing';
  state.timer = setTimeout(() => advance(1), seconds * 1000);
}

function mediaError(item) {
  const message = document.createElement('p');
  message.className = 'media-error';
  message.textContent = `No se pudo abrir “${item.name}”. La presentación continuará.`;
  elements.stage.replaceChildren(message);
  scheduleNext(4);
}

function showCurrentItem() {
  clearTimer();
  const item = state.playlist[state.index];
  if (!item) return exitPresentation();
  elements.nowPlaying.textContent = `${item.name} · ${state.index + 1} de ${state.playlist.length}`;
  elements.stage.textContent = '';

  if (item.type === 'video') {
    const video = document.createElement('video');
    video.src = item.source;
    if (item.thumbnail) video.poster = item.thumbnail;
    video.muted = true;
    video.autoplay = true;
    video.controls = false;
    video.loop = false;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.addEventListener('ended', () => advance(1));
    video.addEventListener('error', () => mediaError(item), { once: true });
    elements.stage.append(video);
    elements.presentationProgress.className = 'is-video';
    video.play().catch(() => showToast('Presiona el botón central del mando para iniciar el video.'));
    return;
  }

  const image = document.createElement('img');
  image.src = item.source;
  image.alt = item.name;
  image.addEventListener('load', () => scheduleNext(item.durationSeconds || state.config.slideDurationSeconds), { once: true });
  image.addEventListener('error', () => mediaError(item), { once: true });
  elements.stage.append(image);
}

function advance(direction) {
  if (!state.playing || !state.playlist.length) return;
  state.index = (state.index + direction + state.playlist.length) % state.playlist.length;
  showCurrentItem();
}

async function requestPresentationFullscreen() {
  const request = elements.presentation.requestFullscreen || elements.presentation.webkitRequestFullscreen;
  if (!request) return;
  try {
    await request.call(elements.presentation);
    state.fullscreenWasActive = true;
  } catch {
    state.fullscreenWasActive = false;
    showToast('La presentación sigue activa. Usa la opción de pantalla completa del navegador si la necesitas.');
  }
}

function startPresentation(items, trigger) {
  if (!items.length) return showToast('Selecciona al menos un elemento para reproducir.');
  state.playlist = items.slice();
  state.index = 0;
  state.playing = true;
  state.returnFocus = trigger || document.activeElement;
  state.fullscreenWasActive = false;
  elements.presentation.hidden = false;
  document.body.style.overflow = 'hidden';
  showCurrentItem();
  requestPresentationFullscreen();
  elements.exit.focus({ preventScroll: true });
}

async function exitPresentation() {
  if (!state.playing) return;
  state.playing = false;
  clearTimer();
  const video = elements.stage.querySelector('video');
  if (video) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  elements.stage.textContent = '';
  elements.presentation.hidden = true;
  document.body.style.overflow = '';
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) {
      try { await exit.call(document); } catch { /* The overlay is already closed. */ }
    }
  }
  if (state.returnFocus?.isConnected) state.returnFocus.focus({ preventScroll: true });
}

function updateMusicButtons() {
  const available = Boolean(state.config.music);
  [elements.music, elements.presentationMusic].forEach(button => {
    button.disabled = !available;
    button.setAttribute('aria-pressed', String(state.musicPlaying));
  });
  elements.music.textContent = state.musicPlaying ? '♪ Música encendida' : '♪ Música apagada';
  elements.presentationMusic.textContent = state.musicPlaying ? '♪ Música encendida' : '♪ Música';
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

function offlineUrls(items) {
  const urls = ['/media.json'];
  items.forEach(item => {
    urls.push(item.source);
    if (item.thumbnail) urls.push(item.thumbnail);
  });
  if (state.config.music) urls.push(state.config.music.source);
  return Array.from(new Set(urls));
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
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active || registration.waiting || registration.installing;
    if (!worker) throw new Error('El modo sin conexión todavía no está listo. Intenta de nuevo.');
    const channel = new MessageChannel();
    const result = new Promise((resolve, reject) => {
      channel.port1.onmessage = event => {
        const message = event.data || {};
        if (message.type === 'progress') setOfflineProgress(message.complete, message.total);
        if (message.type === 'complete') resolve(message);
        if (message.type === 'error') reject(new Error(message.message));
      };
    });
    worker.postMessage({ type: 'PREPARE_OFFLINE', version: state.config.version, urls: offlineUrls(items) }, [channel.port2]);
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
  if (!state.playing) return;
  const exitKeys = ['Escape', 'BrowserBack', 'GoBack'];
  if (exitKeys.includes(event.key) || (event.key === 'Backspace' && !/INPUT|TEXTAREA/.test(event.target.tagName))) {
    event.preventDefault();
    event.stopPropagation();
    exitPresentation();
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    advance(1);
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    advance(-1);
  } else if ((event.key === 'Enter' || event.key === ' ') && event.target === elements.stage) {
    event.preventDefault();
    elements.stage.querySelector('video')?.play().catch(() => {});
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('/service-worker.js', { scope: '/' }); }
  catch { showToast('El modo sin conexión no está disponible en este momento.'); }
}

elements.playSelected.addEventListener('click', event => startPresentation(selectedItems(), event.currentTarget));
elements.playAll.addEventListener('click', event => startPresentation(state.config.items, event.currentTarget));
elements.selectAll.addEventListener('click', () => { state.config.items.forEach(item => state.selected.add(item.id)); updateSelection(); });
elements.clearSelection.addEventListener('click', () => { state.selected.clear(); updateSelection(); });
elements.music.addEventListener('click', toggleMusic);
elements.presentationMusic.addEventListener('click', toggleMusic);
elements.offline.addEventListener('click', prepareOffline);
elements.exit.addEventListener('click', exitPresentation);
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
