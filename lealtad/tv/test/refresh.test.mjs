import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = 'http://127.0.0.1:8790';
const source = JSON.parse(await readFile(new URL('../public/media.json', import.meta.url)));

test('actualización dinámica reemplaza la biblioteca de forma atómica y conserva la anterior si falla', async t => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  t.after(() => browser.close());
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const first = source.items[0], removed = source.items[1];
  const added = { ...source.items[2], id: 'nuevo-contenido', name: 'Nuevo contenido' };
  let current = { ...source, version: 'initial', items: [first, removed] };
  let failRefresh = false, playlistRequests = 0, activeRequests = 0, maxConcurrent = 0, pageRequests = 0;
  page.on('request', request => { if (request.url() === `${base}/`) pageRequests++; });
  await page.route('**/playlist.json*', async route => {
    playlistRequests++; activeRequests++; maxConcurrent = Math.max(maxConcurrent, activeRequests);
    const fresh = new URL(route.request().url()).searchParams.has('refresh');
    if (fresh) await new Promise(resolve => setTimeout(resolve, 140));
    activeRequests--;
    if (fresh && failRefresh) return route.abort('internetdisconnected');
    return route.fulfill({ json: current });
  });

  await page.goto(base);
  await page.waitForSelector('.media-card');
  assert.equal(await page.locator('#refresh-content').innerText(), 'Actualizar contenido');
  assert.equal(await page.locator('.media-card').count(), 2);
  await page.click(`[data-media-id="${first.id}"]`);

  current = { ...source, version: 'updated', items: [added, first, added] };
  await page.evaluate(() => { const button = document.querySelector('#refresh-content'); button.click(); button.click(); });
  await page.waitForFunction(() => document.querySelector('#refresh-content').disabled && document.querySelector('#refresh-content').textContent === 'Actualizando…');
  await page.waitForFunction(() => document.querySelector('#refresh-content').textContent === 'Contenido actualizado');
  assert.deepEqual(await page.locator('.media-card').evaluateAll(cards => cards.map(card => card.dataset.mediaId)), [added.id, first.id]);
  assert.equal(await page.locator(`[data-media-id="${removed.id}"]`).count(), 0);
  assert.equal(await page.locator('.media-card[aria-pressed="true"]').getAttribute('data-media-id'), first.id);
  assert.equal(maxConcurrent, 1);

  current = { ...source, version: 'removed', items: [first] };
  await page.click('#refresh-content');
  await page.waitForFunction(() => document.querySelectorAll('.media-card').length === 1);
  assert.equal(await page.locator('.media-card').getAttribute('data-media-id'), first.id);

  failRefresh = true;
  await page.click('#refresh-content');
  await page.waitForFunction(() => document.querySelector('#toast').textContent === 'No se pudo actualizar el contenido. Intenta nuevamente.');
  assert.deepEqual(await page.locator('.media-card').evaluateAll(cards => cards.map(card => card.dataset.mediaId)), [first.id]);
  assert.equal(pageRequests, 1);
  assert.equal(playlistRequests, 4);

  failRefresh = false;
  await page.click('#play-all');
  await page.waitForFunction(() => document.body.classList.contains('presenting'));
  assert.equal(await page.locator('#refresh-content').evaluate(element => getComputedStyle(element).visibility), 'hidden');
  assert.equal(await page.locator('.admin-link[href="/admin"]').evaluate(element => getComputedStyle(element).visibility), 'hidden');
  await page.keyboard.press('Escape');
});
