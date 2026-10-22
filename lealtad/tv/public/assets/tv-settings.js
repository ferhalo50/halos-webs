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

export function initSettings() {
  const panel = document.querySelector('#screen-settings');
  if (!panel) return { render() {} };
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
  // Older cached player modules can still call render; editing is admin-only.
  return { render() {} };
}
