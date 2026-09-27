const byId = id => document.getElementById(id);
const loginPanel = byId('login-panel');
const dashboard = byId('dashboard');
const loginMessage = byId('login-message');
const uploadMessage = byId('upload-message');
let items = [];

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
  loginPanel.hidden = false;
  dashboard.hidden = true;
  byId('logout').hidden = true;
  loginMessage.textContent = message;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'Tamaño no disponible';
  if (bytes < 1000) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1000;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1000; index++) { value /= 1000; unit = units[index]; }
  return `${value.toLocaleString('es-MX', { maximumFractionDigits: 1 })} ${unit}`;
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
  const panel = byId('storage-panel');
  const percent = storage.percent ?? 0;
  panel.classList.remove('warning', 'critical', 'full');
  if (!['normal', 'unconfigured'].includes(storage.state)) panel.classList.add(storage.state);
  byId('storage-bar').style.width = `${percent}%`;
  byId('storage-track').setAttribute('aria-valuenow', String(percent));
  byId('storage-summary').textContent = storage.limitBytes ? `${formatBytes(storage.usedBytes)} de ${formatBytes(storage.limitBytes)}` : 'Límite por configurar';
  byId('storage-detail').textContent = storage.limitBytes ? `${percent}% utilizado` : 'Las subidas están bloqueadas hasta establecer un límite.';
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function mutate(path, options, success) {
  try { await api(path, options); await loadDashboard(); if (success) uploadMessage.textContent = success; }
  catch (error) { uploadMessage.textContent = error.message; }
}

function move(id, direction) {
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
  const status = element('div', 'media-meta');
  status.append(element('strong', '', 'Estado'), element('span', `pill ${item.active ? '' : 'inactive'}`, item.active ? 'Activo' : 'Inactivo'));
  const actions = element('div', 'row-actions');
  const toggle = element('button', '', item.active ? 'Desactivar' : 'Activar');
  toggle.type = 'button'; toggle.addEventListener('click', () => mutate(`content/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !item.active }) }));
  const up = element('button', '', '↑'); up.type = 'button'; up.title = 'Subir en el orden'; up.disabled = index === 0; up.addEventListener('click', () => move(item.id, -1));
  const down = element('button', '', '↓'); down.type = 'button'; down.title = 'Bajar en el orden'; down.disabled = index === items.length - 1; down.addEventListener('click', () => move(item.id, 1));
  const remove = element('button', 'danger', 'Eliminar'); remove.type = 'button'; remove.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar “${item.name}”? Esta acción quitará el archivo de la biblioteca.`)) return;
    await mutate(`content/${item.id}`, { method: 'DELETE' });
  });
  actions.append(toggle, up, down, remove);
  row.append(preview, main, status, actions);
  return row;
}

function renderLibrary() {
  byId('library-count').textContent = `${items.length} ${items.length === 1 ? 'elemento' : 'elementos'}`;
  byId('library-list').replaceChildren(...items.map(renderItem));
}

async function loadDashboard() {
  const data = await api('content');
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
  try { await api('logout', { method: 'POST' }); showLogin('Sesión cerrada.'); byId('library-list').replaceChildren(); }
  catch (error) { uploadMessage.textContent = error.message; }
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
  const button = byId('upload-button'); if (button.disabled) return;
  button.disabled = true; button.textContent = 'Subiendo…'; uploadMessage.textContent = 'Subiendo contenido…';
  try {
    await uploadRequest(file, percent => { uploadMessage.textContent = `Subiendo… ${percent}%`; });
    byId('upload-file').value = ''; uploadMessage.textContent = 'Contenido subido correctamente.'; await loadDashboard();
  } catch (error) {
    const detail = typeof error?.message === 'string' ? error.message.trim() : '';
    uploadMessage.textContent = detail && !/^(failed to fetch|typeerror|null|undefined|\[object Object\])$/i.test(detail) ? detail : 'No se pudo conectar con el servidor. Revisa tu conexión e intenta nuevamente.';
    button.disabled = false;
  } finally { button.textContent = 'Subir contenido'; }
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
