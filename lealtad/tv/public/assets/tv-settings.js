export const siteKey = document.body.dataset.tvSite || 'renace';
const storageKey = `${siteKey}-tv-display`;
let display = { orientation: 'auto', rotation: 0 };
try { display = normalizeDisplay(JSON.parse(localStorage.getItem(storageKey))); } catch {}

export function normalizeDisplay(value) {
  return {
    orientation: ['auto', 'horizontal', 'vertical'].includes(value?.orientation) ? value.orientation : 'auto',
    rotation: [0, 90, -90].includes(value?.rotation) ? value.rotation : 0,
  };
}

export function applyDisplay() {
  const stage = document.querySelector('#media-stage');
  const viewport = document.querySelector('#presentation');
  const rect = viewport.getBoundingClientRect();
  const width = rect.width || innerWidth, height = rect.height || innerHeight;
  const turned = display.rotation !== 0;
  const availableWidth = turned ? height : width, availableHeight = turned ? width : height;
  const ratio = display.orientation === 'horizontal' ? 16 / 9 : display.orientation === 'vertical' ? 9 / 16 : availableWidth / availableHeight;
  const stageWidth = Math.min(availableWidth, availableHeight * ratio);
  Object.assign(stage.style, {
    inset: 'auto', left: '50%', top: '50%', width: `${stageWidth}px`, height: `${stageWidth / ratio}px`,
    transform: `translate(-50%, -50%) rotate(${display.rotation}deg)`,
  });
  viewport.dataset.orientation = display.orientation;
  viewport.dataset.rotation = String(display.rotation);
  document.querySelectorAll('button[data-orientation]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.orientation === display.orientation)));
  document.querySelectorAll('button[data-rotation]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.rotation) === display.rotation)));
}

export function initSettings(getConfig, onSaved) {
  const panel = document.querySelector('#screen-settings');
  if (!panel) return { render() {} }; // Compatibility with an older cached shell.
  panel.addEventListener('click', event => {
    const button = event.target.closest('[data-orientation], [data-rotation]');
    if (!button) return;
    if (button.dataset.orientation) display.orientation = button.dataset.orientation;
    else display.rotation = Number(button.dataset.rotation);
    display = normalizeDisplay(display);
    try { localStorage.setItem(storageKey, JSON.stringify(display)); } catch {}
    applyDisplay();
  });
  addEventListener('resize', applyDisplay);
  document.addEventListener('fullscreenchange', applyDisplay);
  document.addEventListener('webkitfullscreenchange', applyDisplay);
  applyDisplay();

  const list = document.querySelector('#photo-durations');
  const login = document.querySelector('#duration-login');
  const edit = document.querySelector('#edit-durations');
  const close = document.querySelector('#close-durations');
  const message = document.querySelector('#duration-message');
  let editing = false, busy = false;
  const report = text => { message.textContent = text; };
  async function api(path, options = {}) {
    const response = await fetch(`/admin/api/${path}`, { credentials: 'same-origin', cache: 'no-store', ...options });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) { editing = false; login.hidden = false; close.hidden = true; }
      throw new Error(data.error || 'No se pudo guardar. Intenta nuevamente.');
    }
    return data;
  }
  function render(items = getConfig().items, authorized = false) {
    if (editing && !authorized) return; // Never overwrite an administrator's draft.
    list.replaceChildren();
    const photos = items.filter(item => item.type === 'image');
    for (const item of photos) {
      const row = document.createElement('form'); row.className = 'duration-row';
      const label = document.createElement('label'); label.htmlFor = `duration-${item.id}`;
      label.textContent = item.name + (item.active === false ? ' · Inactiva' : '');
      const input = document.createElement('input');
      input.id = label.htmlFor; input.type = 'number'; input.inputMode = 'numeric'; input.min = '1'; input.max = '300'; input.step = '1';
      input.value = String(item.durationSeconds || getConfig().slideDurationSeconds); input.required = true; input.disabled = !authorized;
      input.addEventListener('wheel', event => event.preventDefault(), { passive: false });
      const unit = document.createElement('span'); unit.textContent = 'segundos';
      row.append(label, input, unit);
      if (authorized) {
        const save = document.createElement('button'); save.type = 'submit'; save.className = 'button button-secondary'; save.textContent = 'Guardar'; row.append(save);
        row.addEventListener('submit', async event => {
          event.preventDefault(); if (busy) return;
          const seconds = Number(input.value);
          if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) return report('Elige entre 1 y 300 segundos enteros.');
          busy = true; list.querySelectorAll('button,input').forEach(node => { node.disabled = true; }); close.disabled = true;
          try {
            const result = await api(`content/${encodeURIComponent(item.id)}/duration`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ durationSeconds: seconds, revision: item.durationRevision }) });
            item.durationRevision = result.revision; item.durationSeconds = seconds;
            report(`Guardado: ${item.name}, ${seconds} segundos. Las pantallas conectadas se actualizan en hasta 30 segundos.`);
            await onSaved();
          } catch (error) { report(error.message === 'Failed to fetch' ? 'Sin conexión. No se confirmó el guardado; actualiza antes de reintentar.' : error.message); }
          finally {
            busy = false; close.disabled = false;
            list.querySelectorAll('button,input').forEach(node => { node.disabled = !editing; });
          }
        });
      }
      list.append(row);
    }
    if (!photos.length) { const empty = document.createElement('p'); empty.textContent = 'No hay fotografías disponibles. Puedes agregarlas desde Administración.'; list.append(empty); }
  }
  async function enableEditor() {
    const content = await api('content');
    editing = true; login.hidden = true; close.hidden = false; edit.textContent = 'Actualizar lista';
    render(content.items, true);
  }
  edit.addEventListener('click', async () => {
    if (busy) return; edit.disabled = true; report('');
    try { await enableEditor(); } catch (error) { report(error.message); }
    finally { edit.disabled = false; }
  });
  login.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return; busy = true;
    const submit = login.querySelector('button'); submit.disabled = true;
    try {
      await api('login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: login.elements.username.value, password: login.elements.password.value }) });
      login.elements.password.value = ''; await enableEditor(); report('Acceso autorizado. Guarda cada fotografía por separado.');
    } catch (error) { report(error.message); }
    finally { login.elements.password.value = ''; busy = false; submit.disabled = false; }
  });
  close.addEventListener('click', () => { if (busy) return; editing = false; login.hidden = true; close.hidden = true; edit.textContent = 'Editar duraciones'; render(); report('Edición cerrada. La sesión administrativa conserva su duración habitual.'); });
  return { render };
}
