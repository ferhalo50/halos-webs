import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const root = new URL('../', import.meta.url);

test('TV files are isolated and configured without backend services', async () => {
  const [wrangler, worker, serviceWorker, media, app] = await Promise.all([
    readFile(new URL('wrangler.jsonc', root), 'utf8'),
    readFile(new URL('worker/index.js', root), 'utf8'),
    readFile(new URL('public/service-worker.js', root), 'utf8'),
    readFile(new URL('public/media.json', root), 'utf8'),
    readFile(new URL('public/assets/tv.js', root), 'utf8')
  ]);
  assert.match(wrangler, /renacecafetv\.haloswebs\.com/);
  assert.doesNotMatch(wrangler, /d1_databases|r2_buckets/i);
  assert.doesNotMatch(`${worker}\n${app}`, /\/api\/|login|password|admin/i);
  assert.match(serviceWorker, /renace-tv-shell-/);
  assert.match(serviceWorker, /renace-tv-media-/);
  assert.match(serviceWorker, /PREPARE_OFFLINE/);
  assert.match(serviceWorker, /content-range/);
  const config = JSON.parse(media);
  assert.ok(config.version);
  assert.equal(config.slideDurationSeconds, 10);
  assert.ok(Array.isArray(config.items));
});

test('TV library, remote controls, looping, music and offline preparation', async t => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'allow' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    HTMLElement.prototype.requestFullscreen = function requestFullscreen() {
      window.__fullscreenRequests = (window.__fullscreenRequests || 0) + 1;
      return Promise.resolve();
    };
  });

  await page.goto('http://127.0.0.1:8790/');
  await page.waitForSelector('.media-card');
  assert.equal(await page.title(), 'Renace Café TV');
  assert.match(await page.locator('h1').innerText(), /Tu momento favorito[\s\S]*café/);
  assert.equal(await page.locator('.media-card').count(), 1);
  assert.equal(await page.locator('#toggle-music').isDisabled(), true);

  await page.click('.media-card');
  assert.match(await page.locator('#selection-count').innerText(), /1 elemento/);
  await page.click('#play-selected');
  await page.waitForSelector('#presentation:not([hidden]) .media-stage img');
  assert.equal(await page.evaluate(() => window.__fullscreenRequests), 1);
  const fit = await page.locator('.media-stage img').evaluate(node => getComputedStyle(node).objectFit);
  assert.equal(fit, 'contain');
  await page.keyboard.press('Backspace');
  await page.waitForSelector('#presentation', { state: 'hidden' });

  await page.click('#prepare-offline');
  await page.waitForFunction(() => document.querySelector('#offline-label')?.textContent.includes('Listo para usar'), null, { timeout: 15000 });
  assert.equal(await page.locator('#offline-progress').getAttribute('value'), '100');

  const mediaConfiguration = {
    version: 'test-loop-1',
    slideDurationSeconds: .25,
    music: { source: '/media/audio/test.mp3', name: 'Prueba ambiental' },
    items: [
      { id: 'one', name: 'Primera imagen', type: 'image', source: '/media/images/logo-renace.png' },
      { id: 'two', name: 'Segunda imagen', type: 'image', source: '/media/images/logo-renace.png' },
      { id: 'video', name: 'Video completo', type: 'video', source: '/media/videos/test.mp4', thumbnail: '/media/images/logo-renace.png' }
    ]
  };
  const secondContext = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
  const secondPage = await secondContext.newPage();
  const secondErrors = [];
  secondPage.on('pageerror', error => secondErrors.push(error.message));
  await secondPage.route('**/media.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mediaConfiguration) }));
  await secondPage.addInitScript(() => {
    HTMLElement.prototype.requestFullscreen = () => Promise.resolve();
    const addMediaListener = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function addEventListener(type, listener, options) {
      if (type === 'error') return;
      return addMediaListener.call(this, type, listener, options);
    };
    HTMLMediaElement.prototype.play = function play() { this.dataset.playRequested = 'true'; return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function pause() { this.dataset.pauseRequested = 'true'; };
  });
  await secondPage.goto('http://127.0.0.1:8790/?test=media');
  await secondPage.waitForSelector('.media-card:nth-child(3)');
  assert.equal(await secondPage.locator('.media-card').count(), 3);

  await secondPage.click('#toggle-music');
  assert.equal(await secondPage.locator('#toggle-music').getAttribute('aria-pressed'), 'true');
  assert.equal(await secondPage.locator('#ambient-audio').getAttribute('data-play-requested'), 'true');

  await secondPage.click('#play-all');
  await secondPage.waitForSelector('#presentation:not([hidden])');
  await secondPage.waitForFunction(() => document.querySelector('#now-playing-title')?.textContent.includes('Segunda imagen'), null, { timeout: 2000 });
  await secondPage.keyboard.press('ArrowRight');
  await secondPage.waitForSelector('#media-stage video');
  const videoState = await secondPage.locator('#media-stage video').evaluate(video => ({ muted: video.muted, controls: video.controls, loop: video.loop, playsInline: video.playsInline }));
  assert.deepEqual(videoState, { muted: true, controls: false, loop: false, playsInline: true });
  await secondPage.locator('#media-stage video').dispatchEvent('ended');
  await secondPage.waitForFunction(() => document.querySelector('#now-playing-title')?.textContent.includes('Primera imagen'));
  assert.equal(await secondPage.locator('#presentation-music').getAttribute('aria-pressed'), 'true');
  await secondPage.keyboard.press('Escape');
  await secondPage.waitForSelector('#presentation', { state: 'hidden' });
  assert.deepEqual(secondErrors, []);
  assert.deepEqual(errors, []);
  await secondContext.close();
});

test('TV controls remain usable on a phone-sized screen', async t => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await page.addInitScript(() => { HTMLElement.prototype.requestFullscreen = () => Promise.resolve(); });
  await page.goto('http://127.0.0.1:8790/?test=mobile');
  await page.waitForSelector('.media-card');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.equal(await page.locator('#play-all').isVisible(), true);
  assert.equal(await page.locator('#prepare-offline').isVisible(), true);
  await page.click('.media-card');
  await page.click('#play-selected');
  await page.waitForSelector('#presentation:not([hidden]) .media-stage img');
  assert.equal(await page.locator('#exit-presentation').isVisible(), true);
  assert.equal(await page.locator('.media-stage img').evaluate(node => getComputedStyle(node).objectFit), 'contain');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#presentation', { state: 'hidden' });
});
