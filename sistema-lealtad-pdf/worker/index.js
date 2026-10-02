const HOSTNAME = 'sistemalealtad.haloswebs.com';
const PDF_PATH = '/assets/docs/Tarjeta_Lealtad_Digital_Cafeterias.pdf';
const PDF_FILENAME = 'Tarjeta_Lealtad_Digital_Cafeterias.pdf';
const CSP = [
  "default-src 'none'", "script-src 'self'", "worker-src 'self'", "style-src 'self'",
  "img-src 'self' data:", "font-src 'self' blob:", "connect-src 'self'",
  "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'none'",
].join('; ');

function secureResponse(request, body, status, sourceHeaders = {}) {
  const headers = new Headers(sourceHeaders);
  headers.set('Content-Security-Policy', CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (new URL(request.url).protocol === 'https:') headers.set('Strict-Transport-Security', 'max-age=31536000');
  return new Response(request.method === 'HEAD' ? null : body, { status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === HOSTNAME && url.protocol === 'http:') {
      url.protocol = 'https:';
      return secureResponse(request, null, 308, { Location: url.href });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return secureResponse(request, null, 405, { Allow: 'GET, HEAD' });
    }
    if (['/propuesta', '/descargar-propuesta'].includes(url.pathname)) {
      url.pathname += '/';
      return secureResponse(request, null, 308, { Location: url.href });
    }
    const download = url.pathname === '/descargar-propuesta/';
    const pdf = download || url.pathname === PDF_PATH || url.pathname === '/presentacion-sistema-lealtad.pdf';
    const html = url.pathname === '/' || url.pathname === '/propuesta/';
    const assetPath = pdf ? PDF_PATH : url.pathname === '/' ? '/index.html'
      : url.pathname === '/propuesta/' ? '/propuesta/index.html' : url.pathname;
    const publicAsset = /^\/assets\/(?:site\.css|viewer\.js|document\.json|favicon\.svg)$/.test(assetPath)
      || /^\/assets\/vendor\/pdfjs-[\d.]+\/(?:pdf(?:\.worker)?\.min\.mjs|LICENSE|standard_fonts\/[\w.-]+)$/.test(assetPath);
    if (!pdf && !html && !publicAsset) {
      return secureResponse(request, 'No encontrado.', 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    const assetResponse = await env.ASSETS.fetch(new Request(new URL(assetPath, request.url), request));
    if (![200, 206, 304].includes(assetResponse.status)) {
      return secureResponse(request, 'Contenido no disponible.', assetResponse.status === 404 ? 404 : 503,
        { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    const headers = new Headers(assetResponse.headers);
    headers.set('Cache-Control', assetPath.startsWith('/assets/vendor/')
      ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
    if (pdf) {
      headers.set('Content-Type', 'application/pdf');
      headers.set('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${PDF_FILENAME}"`);
    } else if (html) {
      headers.set('Content-Type', 'text/html; charset=utf-8');
      // Preserve the reviewed HTML without injected third-party scripts.
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate, no-transform');
    } else if (assetPath.endsWith('.mjs') || assetPath.endsWith('.js')) {
      headers.set('Content-Type', 'text/javascript; charset=utf-8');
    }
    return secureResponse(request, assetResponse.body, assetResponse.status, headers);
  },
};
