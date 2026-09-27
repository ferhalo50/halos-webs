import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base = 'http://127.0.0.1:8790';
const panel = await readFile(new URL('../public/admin/panel.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../public/admin/admin.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../public/admin/admin.css', import.meta.url), 'utf8');

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

test('selector móvil es visible, usa unidades decimales y sube una sola vez con mensajes humanos', async t => {
  assert.doesNotMatch(panel, /id="upload-name"/);
  assert.match(panel, /id="upload-file"[^>]+accept="\.jpg,\.jpeg,\.png,\.webp,\.mp4/);
  assert.doesNotMatch(panel, /id="upload-file"[^>]+capture=/);
  assert.doesNotMatch(styles, /\.upload-control input\s*\{[^}]*opacity\s*:\s*0/s);
  assert.match(script, /new XMLHttpRequest\(\)/);

  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  t.after(() => browser.close());
  for (const viewport of [{ width: 360, height: 800 }, { width: 430, height: 932 }]) {
    const page = await browser.newPage({ viewport });
    let uploads=0;
    let failUpload=false;
    const received=[];
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/admin') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: panel });
      if (url.pathname === '/admin/admin.js') return route.fulfill({ contentType: 'text/javascript; charset=utf-8', body: script });
      if (url.pathname === '/admin/admin.css') return route.fulfill({ contentType: 'text/css', body: styles });
      if (url.pathname === '/admin/api/session') return route.fulfill({ status: 401, json: { error: 'Inicia sesión para continuar.' } });
      if (url.pathname === '/admin/api/uploads') {
        uploads++;
        if (failUpload) return route.abort('internetdisconnected');
        received.push({headers:route.request().headers(),body:route.request().postDataBuffer()});
        await new Promise(resolve => setTimeout(resolve,100));
        return route.fulfill({ status: 201, json: { ok:true,id:'media-test' } });
      }
      if (url.pathname === '/admin/api/content') return route.fulfill({ json: { items:[],storage:{usedBytes:0,limitBytes:5_000_000_000,percent:0,state:'normal'},uploadEnabled:true } });
      return route.continue();
    });
    const adminReady = page.waitForResponse(response => new URL(response.url()).pathname === '/admin/api/session');
    await page.goto(`${base}/admin`);
    await adminReady;
    await page.evaluate(() => { document.querySelector('#login-panel').hidden=true; document.querySelector('#dashboard').hidden=false; });
    const input=page.locator('#upload-file');
    await input.setInputFiles({name:'captura-android.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(1_500_000,1)});
    await page.waitForFunction(() => document.querySelector('#upload-message').textContent.includes('1.5 MB'));
    const box=await input.boundingBox();
    assert.ok(box&&box.width>=200&&box.height>=44,`selector táctil ${viewport.width}px`);
    await page.locator('#upload-button').dblclick({delay:10});
    await page.waitForFunction(() => document.querySelector('#upload-message').textContent === 'Contenido subido correctamente.');
    assert.equal(uploads,1,'el doble toque no duplica la subida');
    assert.equal(received[0].headers['content-type'],'image/jpeg');
    assert.equal(received[0].headers['x-upload-filename'],'captura-android.jpg');
    assert.equal(Number(received[0].headers['x-upload-size']),1_500_000);
    assert.equal(received[0].body.byteLength,1_500_000);
    assert.doesNotMatch(received[0].headers['content-type'],/multipart\/form-data/i);

    failUpload=true;
    await input.setInputFiles({name:'captura-iphone.jpg',mimeType:'image/jpeg',buffer:Buffer.from([0xff,0xd8,0xff,0x00])});
    await page.locator('#upload-button').click();
    await page.waitForFunction(() => document.querySelector('#upload-message').textContent.includes('No se pudo conectar con el servidor'));
    assert.doesNotMatch(await page.locator('#upload-message').innerText(),/failed to fetch|typeerror/i);
    await page.close();
  }
});
