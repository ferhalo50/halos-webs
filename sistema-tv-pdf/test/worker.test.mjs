import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import worker from '../worker/index.js';

const host = 'https://sistematv.haloswebs.com';
const pdfPath = '/assets/docs/Sistema_TV_Promocional_Negocios.pdf';
const pdf = await readFile(new URL('../public' + pdfPath, import.meta.url));
const documentInfo = JSON.parse(await readFile(new URL('../public/assets/document.json', import.meta.url), 'utf8'));
const request = (path, init) => new Request(host + path, init);
const env = { ASSETS: { async fetch(req) {
  const path = new URL(req.url).pathname;
  try {
    let bytes = await readFile(new URL('../public' + path, import.meta.url));
    const headers = { 'Content-Length': String(bytes.length) };
    const range = req.headers.get('range');
    if (range === 'bytes=0-63') {
      headers['Content-Range'] = `bytes 0-63/${bytes.length}`;
      bytes = bytes.subarray(0, 64);
      headers['Content-Length'] = '64';
    }
    return new Response(req.method === 'HEAD' ? null : bytes, { status: range ? 206 : 200, headers });
  } catch { return new Response('Missing', { status: 404 }); }
} } };

test('oferta TV confirmada y alcance fiel al documento aprobado', async () => {
  const html = await (await worker.fetch(request('/'), env)).text();
  assert.match(html, /PRIMER MES.*GRATIS/s);
  assert.match(html, /DESDE EL SEGUNDO MES.*\$150/s);
  assert.match(html, /Spotify es un enlace externo/);
  assert.match(html, /no se garantiza para todas las Smart TV/);
  assert.match(html, /Actualiza la biblioteca en la TV y vuelve a reproducir/);
  assert.doesNotMatch(html, /\$350|24\/7|Spotify integrado|Renace/);
});

test('proyecto comercial aislado sin bindings de datos o rutas de cafeterías', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.name, 'haloswebs-sistema-tv-pdf');
  assert.deepEqual(config.routes, [{ pattern: 'sistematv.haloswebs.com', custom_domain: true }]);
  assert.equal(config.d1_databases, undefined);
  assert.equal(config.r2_buckets, undefined);
});

test('la portada es HTML y separa lectura interna de descarga', async () => {
  const res = await worker.fetch(request('/'), env);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal(res.headers.get('content-disposition'), null);
  const html = await res.text();
  assert.match(html, /href="\/propuesta\/">Ver propuesta/);
  assert.match(html, /href="\/descargar-propuesta\/" download=/);
  assert.doesNotMatch(html, /viewer\.js|pdf\.min\.mjs|\.xlsx/);
});

test('el visor se abre directamente y tiene metadata, estado y zoom permitido', async () => {
  const res = await worker.fetch(request('/propuesta/'), env);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Propuesta de TV Promocional Digital \| Halos Webs/);
  assert.match(html, /Cargando propuesta…/);
  assert.match(html, /script type="module" src="\/assets\/viewer.js"/);
  assert.doesNotMatch(html, /<iframe|<embed|<object|user-scalable=no|maximum-scale/);
});

test('ruta permanente y URL antigua entregan exactamente el mismo PDF en línea', async () => {
  for (const path of [pdfPath, '/presentacion-sistema-tv.pdf']) {
    const res = await worker.fetch(request(path), env);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.match(res.headers.get('content-disposition'), /^inline;/);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), pdf);
  }
});

test('descarga explícita usa attachment y conserva el PDF aprobado', async () => {
  const res = await worker.fetch(request('/descargar-propuesta/'), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="Sistema_TV_Promocional_Negocios.pdf"');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), pdf);
});

test('HEAD conserva cabeceras sin enviar cuerpos de HTML, PDF ni descarga', async () => {
  for (const path of ['/', '/propuesta/', pdfPath, '/descargar-propuesta/']) {
    const res = await worker.fetch(request(path, { method: 'HEAD' }), env);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '');
    assert.ok(res.headers.get('content-type'));
  }
});

test('HTTP público redirige 308 conservando ruta y query; desarrollo local sigue disponible', async () => {
  const res = await worker.fetch(new Request('http://sistematv.haloswebs.com/propuesta/?a=1'), env);
  assert.equal(res.status, 308);
  assert.equal(res.headers.get('location'), host + '/propuesta/?a=1');
  assert.equal((await worker.fetch(new Request('http://127.0.0.1:8798/'), env)).status, 200);
});

test('URLs sin slash se normalizan sin disparar descarga al abrir propuesta', async () => {
  for (const path of ['/propuesta', '/descargar-propuesta']) {
    const res = await worker.fetch(request(path + '?a=1'), env);
    assert.equal(res.status, 308);
    assert.equal(res.headers.get('location'), host + path + '/?a=1');
  }
});

test('no se publican XLSX, archivos privados ni rutas arbitrarias', async () => {
  for (const path of ['/otra', '/assets/docs/Sistema_TV_Promocional_Negocios.xlsx', '/wrangler.jsonc', '/.env', '/index.html']) {
    assert.equal((await worker.fetch(request(path), env)).status, 404);
  }
});

test('se rechazan métodos de escritura sin llamar al almacenamiento de assets', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const res = await worker.fetch(request('/descargar-propuesta/', { method }), {});
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET, HEAD');
  }
});

test('CSP estricta y HSTS también protegen descarga y errores', async () => {
  for (const path of ['/', '/propuesta/', '/descargar-propuesta/', '/missing']) {
    const res = await worker.fetch(request(path), env);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /worker-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https:|\*/);
    if (path === '/' || path === '/propuesta/') {
      assert.equal(res.headers.get('cache-control'), 'public, max-age=0, must-revalidate, no-transform');
    }
    assert.equal(res.headers.get('strict-transport-security'), 'max-age=31536000');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  }
});

test('PDF, visor y configuración se revalidan; la librería versionada es inmutable', async () => {
  for (const path of [pdfPath, '/assets/viewer.js', '/assets/document.json']) {
    const res = await worker.fetch(request(path), env);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  }
  const res = await worker.fetch(request('/assets/vendor/pdfjs-6.3.289/pdf.worker.min.mjs'), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.match(res.headers.get('cache-control'), /immutable/);
});

test('las respuestas parciales preservan Range y Content-Range para PDF.js', async () => {
  const res = await worker.fetch(request(pdfPath, { headers: { Range: 'bytes=0-63' } }), env);
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), `bytes 0-63/${pdf.length}`);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), pdf.subarray(0, 64));
});

test('fallos del almacenamiento no filtran detalles técnicos y no se cachean', async () => {
  const res = await worker.fetch(request(pdfPath), { ASSETS: { fetch: async () => new Response(null, { status: 500 }) } });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(await res.text(), 'Contenido no disponible.');
});

test('PDF.js abre las cuatro páginas reales en orden y su versión coincide con la huella', async () => {
  assert.equal(documentInfo.sha256, createHash('sha256').update(pdf).digest('hex'));
  assert.equal(documentInfo.url, pdfPath + '?v=' + documentInfo.sha256.slice(0, 12));
  const loadingTask = getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, useWasm: false,
    standardFontDataUrl: fileURLToPath(new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url)).replaceAll('\\', '/') });
  const doc = await loadingTask.promise;
  try {
    assert.equal(doc.numPages, 4);
    const expected = ['TV PROMOCIONAL DIGITAL', 'Qué incluye', 'Cómo funciona', 'Tu negocio, en pantalla'];
    for (let i = 1; i <= 4; i++) {
      const page = await doc.getPage(i);
      const text = (await page.getTextContent()).items.map(item => item.str).join(' ');
      assert.ok(text.includes(expected[i - 1]), `Page ${i}: ${expected[i - 1]}`);
      if (i === 1 || i === 4) {
        assert.match(text, /\$150/);
        assert.match(text, /\$0 MXN/);
        assert.match(text, /\+ impuestos aplicables/);
      }
      if (i === 4) assert.match(text, /precio base del servicio/);
      assert.doesNotMatch(text, /\d+\s*%|\$378|\$406/);
    }
  } finally { await loadingTask.destroy(); }
});

test('la web aclara impuestos únicamente para la mensualidad y mantiene el mes gratis', async () => {
  const html = await (await worker.fetch(request('/'), env)).text();
  assert.match(html, /GRATIS<\/p><p>\$0 MXN<\/p><\/div>/);
  assert.match(html, /\$150<\/p><p>MXN \/ MES<\/p><p>\+ impuestos aplicables<\/p>/);
  assert.match(html, /Los importes de mensualidad corresponden al precio base del servicio/);
  assert.doesNotMatch(html, /\d+\s*%|\$378|\$406/);
});
