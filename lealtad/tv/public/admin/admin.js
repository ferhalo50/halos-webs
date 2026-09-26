const byId = id => document.getElementById(id);
const loginPanel = byId('login-panel');
const dashboard = byId('dashboard');
const loginMessage = byId('login-message');
const uploadMessage = byId('upload-message');

async function api(path, options = {}) {
  const response = await fetch(`/admin/api/${path}`, { credentials: 'same-origin', cache: 'no-store', ...options });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
  return data;
}

function showLogin(message = '') {
  loginPanel.hidden = false;
  dashboard.hidden = true;
  byId('logout').hidden = true;
  loginMessage.textContent = message;
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return 'Tamaño no disponible';
  if (bytes < 1024) return `${bytes} B`;
  const unit = bytes < 1024 ** 2 ? 'KB' : bytes < 1024 ** 3 ? 'MB' : 'GB';
  const divisor = unit === 'KB' ? 1024 : unit === 'MB' ? 1024 ** 2 : 1024 ** 3;
  return `${(bytes / divisor).toLocaleString('es-MX', { maximumFractionDigits: 1 })} ${unit}`;
}

function storageView(storage) {
  const panel = byId('storage-panel');
  const track = byId('storage-track');
  const percent = storage.percent ?? 0;
  panel.classList.remove('warning', 'critical', 'full');
  if (storage.state !== 'normal' && storage.state !== 'unconfigured') panel.classList.add(storage.state);
  byId('storage-bar').style.width = `${percent}%`;
  track.setAttribute('aria-valuenow', String(percent));
  if (storage.limitBytes === null) {
    byId('storage-summary').textContent = 'Límite por configurar';
    byId('storage-detail').textContent = 'Las subidas seguirán bloqueadas hasta establecer un límite.';
  } else {
    byId('storage-summary').textContent = `${formatBytes(storage.usedBytes)} de ${formatBytes(storage.limitBytes)}`;
    byId('storage-detail').textContent = `${percent}% utilizado · el espacio solo contempla futuras subidas de Renace.`;
  }
}

function cell(tag, className, content) {
  const element = document.createElement(tag);
  element.className = className;
  if (content !== undefined) element.textContent = content;
  return element;
}

function renderItem(item) {
  const row = cell('article', 'media-row');
  const preview = cell('div', 'preview');
  if (item.type === 'image') {
    const image = document.createElement('img');
    image.src = item.thumbnail || item.source;
    image.alt = '';
    image.loading = 'lazy';
    preview.append(image);
  } else {
    const video = document.createElement('video');
    video.src = item.source;
    video.preload = 'none';
    video.controls = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-label', `Vista previa: ${item.name}`);
    preview.append(video);
  }
  row.append(preview);
  const main = cell('div', 'media-main');
  main.append(cell('strong', '', item.name), cell('small', '', `Contenido base · ${item.type === 'image' ? 'Imagen' : 'Video'}`));
  row.append(main);
  const size = cell('div', 'media-meta');
  size.append(cell('strong', '', 'Tamaño'), document.createTextNode(formatBytes(item.sizeBytes)));
  row.append(size);
  const status = cell('div', 'media-meta');
  status.append(cell('strong', '', 'Estado'), cell('span', 'pill', item.active ? 'Activo' : 'Inactivo'));
  row.append(status);
  const actions = cell('div', 'row-actions');
  for (const [label, title] of [['Activar', 'Disponible al conectar D1'], ['Ordenar', 'Disponible al conectar D1'], ['Eliminar', 'El contenido base está protegido']]) {
    const button = cell('button', '', label);
    button.type = 'button';
    button.disabled = true;
    button.title = title;
    actions.append(button);
  }
  row.append(actions);
  return row;
}

async function showDashboard() {
  const data = await api('content');
  loginPanel.hidden = true;
  dashboard.hidden = false;
  byId('logout').hidden = false;
  byId('base-count').textContent = String(data.items.length);
  byId('uploaded-count').textContent = '0';
  byId('library-count').textContent = `${data.items.length} elementos · biblioteca ${data.version}`;
  storageView(data.storage);
  byId('library-list').replaceChildren(...data.items.map(renderItem));
}

byId('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  loginMessage.textContent = 'Comprobando acceso…';
  try {
    await api('login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: byId('username').value.trim(), password: byId('password').value }),
    });
    byId('password').value = '';
    await showDashboard();
  } catch (error) {
    showLogin(error.message);
  } finally {
    button.disabled = false;
  }
});

byId('logout').addEventListener('click', async () => {
  try {
    await api('logout', { method: 'POST' });
    showLogin('Sesión cerrada.');
    byId('library-list').replaceChildren();
  } catch (error) {
    alert(error.message);
  }
});

byId('upload-file').addEventListener('change', async event => {
  const file = event.currentTarget.files?.[0];
  if (!file) { uploadMessage.textContent = 'Ningún archivo seleccionado.'; return; }
  uploadMessage.textContent = 'Comprobando formato y espacio…';
  try {
    const checked = await api('upload-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: file.name, mime: file.type, size: file.size }),
    });
    uploadMessage.textContent = `${file.name} · ${formatBytes(file.size)}. ${checked.message} La subida aún está desactivada.`;
  } catch (error) {
    uploadMessage.textContent = error.message;
  }
});

api('session').then(showDashboard).catch(() => showLogin());
