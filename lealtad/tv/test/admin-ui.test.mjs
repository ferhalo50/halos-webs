import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = 'http://127.0.0.1:8790';
const panel = await readFile(new URL('../public/admin/panel.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../public/admin/admin.js', import.meta.url), 'utf8');

test('cambio de contraseña muestra éxito limpio y conserva errores humanos', async t => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  t.after(() => browser.close());
  const page = await browser.newPage();
  let passwordResult = { status: 200, body: { ok: true } };
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/admin') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: panel });
    if (url.pathname === '/admin/admin.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: script });
    if (url.pathname === '/admin/admin.css') return route.fulfill({ contentType: 'text/css', body: '' });
    if (url.pathname === '/admin/api/session') return route.fulfill({ status: 401, json: { error: 'Inicia sesión para continuar.' } });
    if (url.pathname === '/admin/api/password') return route.fulfill({ status: passwordResult.status, json: passwordResult.body });
    return route.continue();
  });
  const adminReady = page.waitForResponse(response => new URL(response.url()).pathname === '/admin/api/session');
  await page.goto(`${base}/admin`);
  await adminReady;
  await page.waitForSelector('#login-panel:not([hidden])');
  await page.evaluate(() => { document.querySelector('#login-panel').hidden = true; document.querySelector('#dashboard').hidden = false; });

  await page.fill('#current-password', 'actual-segura');
  await page.fill('#new-password', 'nueva-segura-2026');
  await page.locator('#password-form').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => document.querySelector('#password-message').textContent === 'Contraseña actualizada correctamente.');
  const success = await page.locator('#password-message').innerText();
  assert.equal(success, 'Contraseña actualizada correctamente.');
  assert.doesNotMatch(success, /null|undefined|\[object Object\]/i);

  passwordResult = { status: 401, body: { error: 'La contraseña actual no es correcta.' } };
  await page.fill('#current-password', 'incorrecta');
  await page.fill('#new-password', 'otra-segura-2026');
  await page.locator('#password-form').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => document.querySelector('#password-message').textContent === 'La contraseña actual no es correcta.');
  assert.equal(await page.locator('#password-message').innerText(), 'La contraseña actual no es correcta.');
});
