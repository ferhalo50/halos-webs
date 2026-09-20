function withSecurityHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=()');
  headers.set('content-security-policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'");
  if (pathname === '/service-worker.js' || pathname === '/media.json' || pathname === '/' || pathname.endsWith('.html')) {
    headers.set('cache-control', 'no-cache');
  } else {
    headers.set('cache-control', 'public, max-age=300');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const response = await env.ASSETS.fetch(request);
    return withSecurityHeaders(response, url.pathname);
  }
};
