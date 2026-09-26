import { adminConfigured, authenticated, clearSessionCookie, createSessionCookie, safeAdminTransport, sameOrigin, verifyPassword } from './admin-auth.js';
import { baseContent, configuredUploadMax, storageSummary, validateUploadMetadata } from './admin-media.js';

const ADMIN_FILES = new Map([
  ['/admin', '/admin/panel'],
  ['/admin/', '/admin/panel'],
  ['/admin/admin.css', '/admin/admin.css'],
  ['/admin/admin.js', '/admin/admin.js'],
]);

function protectedResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=()');
  headers.set('content-security-policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(body, status = 200, headers = {}) {
  return protectedResponse(Response.json(body, { status, headers }));
}

async function readSmallJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return null;
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > 4096) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 4096) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const result = JSON.parse(new TextDecoder().decode(bytes));
    return result && typeof result === 'object' && !Array.isArray(result) ? result : null;
  } catch {
    return null;
  }
}

async function asset(request, env, pathname) {
  const response = await env.ASSETS.fetch(new Request(new URL(pathname, request.url), request));
  return protectedResponse(response);
}

async function login(request, env) {
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405, { Allow: 'POST' });
  if (!sameOrigin(request, env)) return json({ error: 'Solicitud no permitida.' }, 403);
  const body = await readSmallJson(request);
  if (typeof body?.username !== 'string' || typeof body?.password !== 'string') return json({ error: 'Datos de acceso no válidos.' }, 400);
  const valid = body.username === env.TV_ADMIN_USERNAME && await verifyPassword(body.password, env.TV_ADMIN_PASSWORD_HASH);
  if (!valid) return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
  return json({ ok: true }, 200, { 'Set-Cookie': await createSessionCookie(request, env) });
}

export async function handleAdmin(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (env.TV_ADMIN_ENABLED !== 'true') return protectedResponse(new Response('Panel no disponible.', { status: 404 }));
  if (!safeAdminTransport(request, env)) return protectedResponse(new Response('Se requiere HTTPS.', { status: 403 }));
  if (!adminConfigured(env)) return protectedResponse(new Response('Panel pendiente de configuración.', { status: 503 }));

  if (ADMIN_FILES.has(pathname)) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Método no permitido.' }, 405, { Allow: 'GET, HEAD' });
    return asset(request, env, ADMIN_FILES.get(pathname));
  }
  if (!pathname.startsWith('/admin/api/')) return protectedResponse(new Response('No encontrado.', { status: 404 }));
  if (pathname === '/admin/api/login') return login(request, env);

  if (!await authenticated(request, env)) return json({ error: 'Inicia sesión para continuar.' }, 401);
  if (request.method !== 'GET' && !sameOrigin(request, env)) return json({ error: 'Solicitud no permitida.' }, 403);

  if (pathname === '/admin/api/session' && request.method === 'GET') {
    return json({ username: env.TV_ADMIN_USERNAME, r2MediaEnabled: false, uploadEnabled: false });
  }
  if (pathname === '/admin/api/logout' && request.method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
  }
  if (pathname === '/admin/api/content' && request.method === 'GET') {
    try {
      const base = await baseContent(request, env);
      return json({ version: base.version, items: base.items, storage: storageSummary(env), uploadEnabled: false });
    } catch {
      return json({ error: 'No se pudo cargar la biblioteca actual.' }, 503);
    }
  }
  if (pathname === '/admin/api/upload-check' && request.method === 'POST') {
    const body = await readSmallJson(request);
    if (!body) return json({ error: 'Datos del archivo no válidos.' }, 400);
    const checked = validateUploadMetadata(body, storageSummary(env), configuredUploadMax(env));
    return checked.valid
      ? json({ ...checked, uploadEnabled: false })
      : json({ error: checked.message }, checked.status);
  }
  if (pathname === '/admin/api/uploads' && request.method === 'POST') {
    return json({ error: 'Las subidas permanecen desactivadas en esta fase.' }, 409);
  }
  const item = /^\/admin\/api\/content\/([^/]+)$/.exec(pathname);
  if (item && request.method === 'DELETE') {
    const base = await baseContent(request, env);
    let id;
    try { id = decodeURIComponent(item[1]); }
    catch { return json({ error: 'Identificador no válido.' }, 400); }
    if (base.items.some(entry => entry.id === id)) {
      return json({ error: 'El contenido base no se puede eliminar.' }, 403);
    }
    return json({ error: 'Contenido no encontrado.' }, 404);
  }
  if (item && request.method === 'PATCH') {
    return json({ error: 'Los cambios de estado y orden permanecen desactivados en esta fase.' }, 409);
  }
  return json({ error: 'No encontrado.' }, 404);
}
