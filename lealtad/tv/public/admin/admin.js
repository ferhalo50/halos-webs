import { formatBytes, renderStorage } from '../assets/storage-view.js';
const byId = id => document.getElementById(id);
const loginPanel = byId('login-panel');
const dashboard = byId('dashboard');
const loginMessage = byId('login-message');
const uploadMessage = byId('upload-message');
let items = [];
let storageRefreshing = false, uploading = false;
let libraryBusy = false, sessionGeneration = 0;

async function api(path, options = {}) {
  const response = await fetch(`/admin/api/${path}`, { credentials: 'same-origin', cache: 'no-store', ...options });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(data.error || 'No se pudo completar la solicitud.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function showLogin(message = '') {
  sessionGeneration++;
  items = [];
  byId('library-list').replaceChildren();
  loginPanel.hidden = false;
  dashboard.hidden = true;
  byId('logout').hidden = true;
  loginMessage.textContent = message;
}

function uploadRequest(file, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/admin/api/uploads');
    request.withCredentials = true;
    request.timeout = 10 * 60 * 1000;
    request.setRequestHeader('content-type', file.type || 'application/octet-stream');
    request.setRequestHeader('x-upload-filename', encodeURIComponent(file.name));
    request.setRequestHeader('x-upload-size', String(file.size));
    request.upload.addEventListener('progress', event => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, Math.round(event.loaded / event.total * 100)));
    });
    request.addEventListener('load', () => {
      let data = {};
      try { data = request.responseText ? JSON.parse(request.responseText) : {}; } catch {}
      if (request.status >= 200 && request.status < 300) return resolve(data);
      const error = new Error(typeof data.error === 'string' && data.error.trim() ? data.error : 'No se pudo completar la subida. Intenta nuevamente.');
      error.status = request.status;
      reject(error);
    });
    request.addEventListener('error', () => reject(new Error('No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.')));
    request.addEventListener('timeout', () => reject(new Error('La subida tardó demasiado. Revisa tu conexión e intenta nuevamente.')));
    request.addEventListener('abort', () => reject(new Error('La subida fue cancelada.')));
    request.send(file);
  });
}

function storageView(storage) {
  renderStorage(byId('storage-panel'),storage);
}
async function refreshStorage() {
  if(storageRefreshing||dashboard.hidden||!navigator.onLine)return;
  storageRefreshing=true;
  try {storageView(await api('storage'));}
  catch {byId('storage-detail').textContent='No se pudo actualizar. La última lectura puede haber cambiado.';}
  finally {storageRefreshing=false;}
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function mutate(path, options, success) {
  if (libraryBusy) return;
  const generation = sessionGeneration;
  setLibraryBusy(true);
  try { await api(path, options); if (generation !== sessionGeneration) return; await loadDashboard(); if (success) uploadMessage.textContent = success; }
  catch (error) { if (generation === sessionGeneration) { if (error.status === 401) showLogin('La sesión terminó. Inicia sesión para continuar.'); else uploadMessage.textContent = error.message; } }
  finally { setLibraryBusy(false); }
}

function move(id, direction) {
  if (libraryBusy) return;
  const index = items.findIndex(item => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target], items[index]];
  renderLibrary();
  mutate('reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: items.map(item => item.id) }) });
}

function renderItem(item, index) {
  const row = element('article', 'media-row');
  row.draggable = true;
  row.dataset.id = item.id;
  row.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', item.id));
  row.addEventListener('dragover', event => event.preventDefault());
  row.addEventListener('drop', event => {
    event.preventDefault();
    if (libraryBusy) return;
    const from = items.findIndex(entry => entry.id === event.dataTransfer.getData('text/plain'));
    const to = items.findIndex(entry => entry.id === item.id);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = items.splice(from, 1); items.splice(to, 0, moved); renderLibrary();
    mutate('reorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: items.map(entry => entry.id) }) });
  });
  const preview = element('div', 'preview');
  if (item.type === 'image') {
    const image = document.createElement('img'); image.src = item.preview; image.alt = ''; image.loading = 'lazy'; preview.append(image);
  } else {
    const video = document.createElement('video'); video.src = item.preview; video.preload = 'metadata'; video.controls = true; video.muted = true; video.playsInline = true; preview.append(video);
  }
  const main = element('div', 'media-main');
  main.append(element('strong', '', item.name), element('small', '', `${item.type === 'image' ? 'Imagen' : 'Video'} · ${formatBytes(item.sizeBytes)}`));
  if (item.type === 'image') main.append(durationEditor(item));
  else main.append(element('small', 'video-duration-note', 'Se reproduce completo · duración original'));
  const status = element('div', 'media-meta');
  status.append(element('strong', '', 'Estado'), element('span', `pill ${item.active ? '' : 'inactive'}`, item.active ? 'Activo' : 'Inactivo'));
  const actions = element('div', 'row-actions');
  const toggle = element('button', '', item.active ? 'Desactivar' : 'Activar');
  toggle.type = 'button'; toggle.addEventListener('click', () => mutate(`content/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !item.active }) }));
  const up = element('button', '', '↑'); up.type = 'button'; up.title = 'Subir en el orden'; up.setAttribute('aria-label', `Subir ${item.name} en el orden`); up.disabled = index === 0; up.dataset.edgeDisabled = String(up.disabled); up.addEventListener('click', () => move(item.id, -1));
  const down = element('button', '', '↓'); down.type = 'button'; down.title = 'Bajar en el orden'; down.setAttribute('aria-label', `Bajar ${item.name} en el orden`); down.disabled = index === items.length - 1; down.dataset.edgeDisabled = String(down.disabled); down.addEventListener('click', () => move(item.id, 1));
  const remove = element('button', 'danger', 'Eliminar'); remove.type = 'button'; remove.addEventListener('click', async () => {
    if (libraryBusy || !confirm(`¿Eliminar “${item.name}”? Esta acción quitará el archivo de la biblioteca.`)) return;
    await mutate(`content/${item.id}`, { method: 'DELETE' });
  });
  actions.append(toggle, up, down, remove);
  row.append(preview, main, status, actions);
  return row;
}

function setLibraryBusy(busy) {
  libraryBusy = busy;
  byId('library-list').setAttribute('aria-busy', String(busy));
  byId('library-list').querySelectorAll('button,input').forEach(node => { node.disabled = busy || node.dataset.edgeDisabled === 'true'; });
  byId('refresh-library').disabled = busy;
}

function durationEditor(item) {
  const form = element('form', 'photo-duration-editor'); form.noValidate = true;
  const label = element('label', '', 'Duración de esta fotografía');
  const input = document.createElement('input'); input.id = `duration-${item.id}`;
  input.type = 'number'; input.inputMode = 'numeric'; input.min = '1'; input.max = '300'; input.step = '1'; input.required = true;
  input.value = String(item.durationSeconds ?? 10); label.htmlFor = input.id;
  const controls = element('div', 'duration-controls');
  const save = element('button', '', 'Guardar'); save.type = 'submit';
  const note = element('small', 'duration-current', item.durationSeconds == null ? 'Predeterminada · 10 s' : `Configurada · ${item.durationSeconds} s`);
  const message = element('p', 'duration-message'); message.id = `${input.id}-message`; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  input.setAttribute('aria-describedby', message.id);
  input.addEventListener('wheel', event => event.preventDefault(), { passive: false });
  controls.append(input, element('span', '', 'segundos'), save);
  form.append(label, controls, note, message);
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (libraryBusy || uploading) return;
    const seconds = Number(input.value);
    if (!input.value.trim() || !Number.isInteger(seconds) || seconds < 1 || seconds > 300) { message.textContent = 'Elige entre 1 y 300 segundos enteros.'; input.focus(); return; }
    const generation = sessionGeneration;
    setLibraryBusy(true); save.textContent = 'Guardando…'; message.textContent = '';
    try {
      const result = await api(`content/${encodeURIComponent(item.id)}/duration`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ durationSeconds: seconds, revision: item.durationRevision }) });
      if (generation !== sessionGeneration) return;
      item.durationSeconds = seconds; item.durationRevision = result.revision;
      note.textContent = `Configurada · ${seconds} s`;
      message.textContent = 'Guardado. Las pantallas se actualizan en hasta 30 segundos; el contenido en curso termina normalmente.';
    } catch (error) {
      if (generation !== sessionGeneration) return;
      if (error.status === 401) showLogin('La sesión terminó. Inicia sesión para continuar.');
      else message.textContent = error.status === 409 ? 'La fotografía cambió. Pulsa Actualizar biblioteca antes de guardar nuevamente.' : error.status ? error.message : 'Sin conexión. No se confirmó el guardado; actualiza antes de reintentar.';
    } finally { save.textContent = 'Guardar'; setLibraryBusy(false); }
  });
  return form;
}

function renderLibrary() {
  byId('library-count').textContent = `${items.length} ${items.length === 1 ? 'elemento' : 'elementos'}`;
  byId('library-list').replaceChildren(...items.map(renderItem));
}

async function loadDashboard() {
  const generation = sessionGeneration;
  const data = await api('content');
  if (generation !== sessionGeneration) return;
  items = data.items;
  loginPanel.hidden = true; dashboard.hidden = false; byId('logout').hidden = false;
  byId('base-count').textContent = String(items.length);
  byId('uploaded-count').textContent = String(items.length);
  storageView(data.storage);
  renderLibrary();
}

byId('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type=submit]'); button.disabled = true; loginMessage.textContent = 'Comprobando acceso…';
  try {
    await api('login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: byId('username').value.trim(), password: byId('password').value }) });
    byId('password').value = ''; await loadDashboard();
  } catch (error) { showLogin(error.message); }
  finally { button.disabled = false; }
});

byId('logout').addEventListener('click', async () => {
  sessionGeneration++;
  try { await api('logout', { method: 'POST' }); showLogin('Sesión cerrada.'); byId('library-list').replaceChildren(); }
  catch (error) { uploadMessage.textContent = error.message; }
});

byId('refresh-library').addEventListener('click', () => {
  if (libraryBusy) return;
  setLibraryBusy(true);
  loadDashboard().catch(error => { if (error.status === 401) showLogin('La sesión terminó. Inicia sesión para continuar.'); else uploadMessage.textContent = 'No se pudo actualizar la biblioteca. Intenta nuevamente.'; }).finally(() => setLibraryBusy(false));
});

byId('upload-file').addEventListener('change', event => {
  const file = event.currentTarget.files?.[0];
  const extension = file ? /\.[a-z0-9]+$/i.exec(file.name)?.[0]?.toLowerCase() : '';
  const compatible = ['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(extension);
  byId('upload-button').disabled = !file || !compatible;
  uploadMessage.textContent = !file ? 'Ningún archivo seleccionado.' : compatible ? `${file.name} · ${formatBytes(file.size)}` : 'Este formato no es compatible. Usa JPG, PNG, WebP o MP4.';
});

byId('upload-button').addEventListener('click', async () => {
  const file = byId('upload-file').files?.[0]; if (!file) return;
  const button = byId('upload-button'); if (button.disabled || libraryBusy) return;
  button.disabled = true; button.textContent = 'Subiendo…'; uploadMessage.textContent = 'Subiendo contenido…';
  uploading = true;
  setLibraryBusy(true);
  try {
    await uploadRequest(file, percent => { uploadMessage.textContent = `Subiendo… ${percent}%`; });
    byId('upload-file').value = ''; uploadMessage.textContent = 'Contenido subido correctamente.'; await loadDashboard();
  } catch (error) {
    const detail = typeof error?.message === 'string' ? error.message.trim() : '';
    uploadMessage.textContent = detail && !/^(failed to fetch|typeerror|null|undefined|\[object Object\])$/i.test(detail) ? detail : 'No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.';
    button.disabled = false;
  } finally { uploading=false;setLibraryBusy(false);button.textContent = 'Subir contenido';await refreshStorage(); }
});

byId('password-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget; const message = byId('password-message'); message.textContent = 'Actualizando…';
  try {
    await api('password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: byId('current-password').value, newPassword: byId('new-password').value }) });
    form.reset(); message.textContent = 'Contraseña actualizada correctamente.';
  } catch (error) {
    const detail = typeof error?.message === 'string' ? error.message.trim() : '';
    message.textContent = error?.status && detail && !/^(null|undefined|\[object Object\])$/i.test(detail) ? detail : 'No se pudo cambiar la contraseña. Intenta nuevamente.';
  }
});

api('session').then(loadDashboard).catch(() => showLogin());
setInterval(()=>{if(!document.hidden&&!uploading)refreshStorage();},30000);
window.addEventListener('online',refreshStorage);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshStorage();});
