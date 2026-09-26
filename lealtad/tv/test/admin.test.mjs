import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import worker from '../worker/index.js';

const origin = 'https://renacecafetv.haloswebs.com';
const password = randomBytes(18).toString('base64url');
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, 310000, 32, 'sha256');
const config = JSON.parse(await readFile(new URL('../public/media.json', import.meta.url)));

const assets = {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    const file = pathname === '/' ? '/index.html' : pathname === '/admin/panel' ? '/admin/panel.html' : pathname;
    let info;
    try { info = await stat(new URL(`../public${file}`, import.meta.url)); }
    catch { return new Response('Missing', { status: 404 }); }
    const contentType = file.endsWith('.json') ? 'application/json' : file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
    return new Response(request.method === 'HEAD' ? null : await readFile(new URL(`../public${file}`, import.meta.url)), {
      status: 200,
      headers: { 'content-type': contentType, 'content-length': String(info.size) },
    });
  },
};
const enabled = {
  ASSETS: assets,
  TV_ADMIN_ENABLED: 'true',
  R2_MEDIA_ENABLED: 'false',
  TV_ADMIN_USERNAME: 'renace-tv-admin',
  TV_ADMIN_PASSWORD_HASH: `pbkdf2-sha256:310000:${salt.toString('hex')}:${hash.toString('hex')}`,
  TV_SESSION_SECRET: randomBytes(32).toString('base64url'),
  TV_STORAGE_LIMIT_BYTES: '1000',
};

function request(path, method = 'GET', body = undefined, cookie = undefined, includeOrigin = true) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  if (includeOrigin && method !== 'GET') headers.origin = origin;
  return new Request(`${origin}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function login() {
  const result = await worker.fetch(request('/admin/api/login', 'POST', { username: enabled.TV_ADMIN_USERNAME, password }), enabled);
  assert.equal(result.status, 200);
  return result.headers.get('set-cookie').split(';')[0];
}

test('la TV y media.json conservan exactamente los archivos actuales con R2 apagado', async () => {
  const originalHome = await readFile(new URL('../public/index.html', import.meta.url));
  const home = await worker.fetch(request('/'), { ...enabled, TV_ADMIN_ENABLED: 'false' });
  assert.equal(home.status, 200);
  assert.deepEqual(Buffer.from(await home.arrayBuffer()), originalHome);
  const media = await worker.fetch(request('/media.json'), { ...enabled, TV_ADMIN_ENABLED: 'false' });
  assert.equal(media.status, 200);
  assert.deepEqual(await media.json(), config);
  const stillMedia = await worker.fetch(request('/media.json'), { ...enabled, R2_MEDIA_ENABLED: 'true' });
  assert.deepEqual(await stillMedia.json(), config);
});

test('el panel está apagado por defecto y requiere configuración completa', async () => {
  assert.equal((await worker.fetch(request('/admin'), { ...enabled, TV_ADMIN_ENABLED: 'false' })).status, 404);
  assert.equal((await worker.fetch(request('/admin/api/content'), { ...enabled, TV_ADMIN_ENABLED: 'false' })).status, 404);
  assert.equal((await worker.fetch(request('/admin'), { ...enabled, TV_SESSION_SECRET: undefined })).status, 503);
  assert.equal((await worker.fetch(new Request('http://renacecafetv.haloswebs.com/admin'), enabled)).status, 403);
  const local = { ...enabled, TV_ADMIN_LOCAL_HTTP: 'true' };
  assert.equal((await worker.fetch(new Request('http://renacecafetv.haloswebs.com/admin/'), local)).status, 200);
  const localLogin = await worker.fetch(new Request('http://renacecafetv.haloswebs.com/admin/api/login', { method: 'POST', headers: { origin: 'http://127.0.0.1:8790', 'content-type': 'application/json' }, body: JSON.stringify({ username: enabled.TV_ADMIN_USERNAME, password }) }), local);
  assert.equal(localLogin.status, 200);
  assert.doesNotMatch(localLogin.headers.get('set-cookie'), /; Secure/);
});

test('login independiente, sesión firmada y cierre de sesión', async () => {
  const page = await worker.fetch(request('/admin'), enabled);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Entrar al panel/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal((await worker.fetch(request('/admin/api/content'), enabled)).status, 401);
  assert.equal((await worker.fetch(request('/admin/api/login', 'POST', { username: enabled.TV_ADMIN_USERNAME, password }, undefined, false), enabled)).status, 403);
  assert.equal((await worker.fetch(request('/admin/api/login', 'POST', { username: enabled.TV_ADMIN_USERNAME, password: 'contraseña-incorrecta' }), enabled)).status, 401);
  const result = await worker.fetch(request('/admin/api/login', 'POST', { username: enabled.TV_ADMIN_USERNAME, password }), enabled);
  const setCookie = result.headers.get('set-cookie');
  assert.equal(result.status, 200);
  for (const part of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/admin']) assert.match(setCookie, new RegExp(part));
  const cookie = setCookie.split(';')[0];
  assert.equal((await worker.fetch(request('/admin/api/session', 'GET', undefined, cookie), enabled)).status, 200);
  assert.equal((await worker.fetch(request('/admin/api/session', 'GET', undefined, `${cookie}changed`), enabled)).status, 401);
  const logout = await worker.fetch(request('/admin/api/logout', 'POST', undefined, cookie), enabled);
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});

test('la lista autentificada es de solo lectura y protege el contenido base', async () => {
  const cookie = await login();
  const response = await worker.fetch(request('/admin/api/content', 'GET', undefined, cookie), enabled);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.items.length, config.items.length);
  assert.deepEqual(data.items.map(item => item.id), config.items.map(item => item.id));
  assert.ok(data.items.every(item => item.origin === 'base' && item.active && item.sizeBytes > 0));
  assert.deepEqual(data.storage, { usedBytes: 0, limitBytes: 1000, percent: 0, state: 'normal' });
  const id = config.items[0].id;
  assert.equal((await worker.fetch(request(`/admin/api/content/${id}`, 'DELETE'), enabled)).status, 401);
  assert.equal((await worker.fetch(request(`/admin/api/content/${id}`, 'DELETE', undefined, cookie, false), enabled)).status, 403);
  const denied = await worker.fetch(request(`/admin/api/content/${id}`, 'DELETE', undefined, cookie), enabled);
  assert.equal(denied.status, 403);
  assert.match((await denied.json()).error, /contenido base/i);
  assert.equal((await worker.fetch(request(`/admin/api/content/${id}`, 'PATCH', { active: false }, cookie), enabled)).status, 409);
});

test('el servidor valida formato y cuota; ninguna subida queda habilitada', async () => {
  const cookie = await login();
  const check = body => worker.fetch(request('/admin/api/upload-check', 'POST', body, cookie), enabled);
  const valid = await check({ name: 'foto.webp', mime: 'image/webp', size: 600 });
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).uploadEnabled, false);
  assert.equal((await check({ name: 'foto.exe', mime: 'image/png', size: 600 })).status, 415);
  assert.equal((await check({ name: 'foto.png', mime: 'image/png', size: 1001 })).status, 413);
  assert.equal((await check({ name: 'video.mp4', mime: 'video/mp4', size: 0 })).status, 400);
  assert.equal((await worker.fetch(request('/admin/api/upload-check', 'POST', { name: 'foto.png', mime: 'image/png', size: 1 }, cookie), { ...enabled, TV_STORAGE_LIMIT_BYTES: undefined })).status, 503);
  assert.equal((await worker.fetch(request('/admin/api/uploads', 'POST'), enabled)).status, 401);
  assert.equal((await worker.fetch(request('/admin/api/uploads', 'POST', undefined, cookie), enabled)).status, 409);
});
