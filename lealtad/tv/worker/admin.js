import {
  authConfigured, authenticate, checkRateLimit, clearLoginFailures, clearSessionCookie,
  createSession, hashPassword, normalizeUsername, recordLoginFailure, revokeSession,
  revokeUserSessions, safeAdminTransport, sameOrigin, sha256, verifyPassword,
} from './admin-auth.js';
import {
  audit, configuredUploadMax, listMedia, safeStorageKey, storageSummary,
  validateUploadMetadata, verifyFileSignature,
} from './admin-media.js';
import { objectResponse } from './media.js';

const ADMIN_FILES = new Map([
  ['/admin', '/admin/panel'], ['/admin/', '/admin/panel'],
  ['/admin/admin.css', '/admin/admin.css'], ['/admin/admin.js', '/admin/admin.js'],
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

function uploadJson(body, status, requestId) {
  return json(body, status, { 'x-request-id': requestId });
}

function uploadLog(level, event, details = {}) {
  const entry = JSON.stringify({ component: 'admin-upload', event, ...details });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

async function readJson(request, maximum = 8192) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return null;
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > maximum) return null;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > maximum) return null;
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

async function asset(request, env, pathname) {
  return protectedResponse(await env.ASSETS.fetch(new Request(new URL(pathname, request.url), request)));
}

async function bootstrap(request, env) {
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (env.TV_BOOTSTRAP_ENABLED !== 'true' || typeof env.TV_BOOTSTRAP_SECRET !== 'string' || env.TV_BOOTSTRAP_SECRET.length < 32) return json({ error: 'Bootstrap no disponible.' }, 404);
  const supplied = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!supplied || await sha256(supplied) !== await sha256(env.TV_BOOTSTRAP_SECRET)) return json({ error: 'Bootstrap no autorizado.' }, 401);
  const count = await env.TV_DB.prepare('SELECT COUNT(*) AS total FROM admin_users').first();
  if (Number(count?.total) > 0) return json({ error: 'El administrador inicial ya existe.' }, 409);
  const body = await readJson(request);
  const username = normalizeUsername(body?.username);
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim().slice(0, 80) : '';
  if (!username || !displayName) return json({ error: 'Usuario o nombre no válido.' }, 400);
  let passwordHash;
  try { passwordHash = await hashPassword(body?.password); }
  catch (error) { return json({ error: error.message }, 400); }
  const id = crypto.randomUUID();
  await env.TV_DB.prepare('INSERT INTO admin_users(id,username,display_name,password_hash) VALUES(?,?,?,?)').bind(id, username, displayName, passwordHash).run();
  await audit(env, id, 'bootstrap_admin', null, { username });
  return json({ ok: true, username }, 201);
}

async function login(request, env) {
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  if (!sameOrigin(request, env)) return json({ error: 'Solicitud no permitida.' }, 403);
  const body = await readJson(request);
  const username = normalizeUsername(body?.username);
  if (!username || typeof body?.password !== 'string') return json({ error: 'Datos de acceso no válidos.' }, 400);
  const rate = await checkRateLimit(request, env, username);
  if (!rate.allowed) return json({ error: 'Demasiados intentos. Intenta de nuevo en unos minutos.', retryAfter: rate.retryAfter }, 429, { 'Retry-After': String(rate.retryAfter) });
  const user = await env.TV_DB.prepare('SELECT id,username,display_name,password_hash,active FROM admin_users WHERE username=?').bind(username).first();
  const candidateHash = user?.password_hash || await hashPassword(body.password, '00000000000000000000000000000000');
  const valid = Boolean(user?.active) && await verifyPassword(body.password, candidateHash);
  if (!valid) {
    await recordLoginFailure(env, rate.key);
    return json({ error: 'Usuario o contraseña incorrectos.' }, 401);
  }
  await clearLoginFailures(env, rate.key);
  const session = await createSession(request, env, user.id);
  await audit(env, user.id, 'login');
  return json({ ok: true, displayName: user.display_name }, 200, { 'Set-Cookie': session.setCookie });
}

export async function upload(request, env, auth) {
  const requestId = request.headers.get('cf-ray') || crypto.randomUUID();
  const context = { requestId };
  if (!env.MEDIA_BUCKET) {
    uploadLog('error', 'upload.storage_unavailable', context);
    return uploadJson({ error: 'El almacenamiento no está disponible. Intenta nuevamente.' }, 503, requestId);
  }
  const maximum = configuredUploadMax(env);
  const lengthHeader = request.headers.get('content-length');
  const length = lengthHeader === null ? null : Number(lengthHeader);
  uploadLog('info', 'upload.start', { ...context, contentLength: Number.isFinite(length) ? length : null });
  if (Number.isFinite(length) && length > maximum + 1_000_000) {
    uploadLog('warn', 'upload.validation_error', { ...context, stage: 'request_size', status: 413 });
    return uploadJson({ error: 'El archivo supera el tamaño máximo permitido.' }, 413, requestId);
  }
  let form;
  try { form = await request.formData(); }
  catch {
    uploadLog('warn', 'upload.form_error', { ...context, status: 400 });
    return uploadJson({ error: 'No se pudo leer el archivo. Selecciónalo de nuevo e intenta otra vez.' }, 400, requestId);
  }
  const file = form.get('file');
  if (!file || typeof file.name !== 'string' || typeof file.stream !== 'function') {
    uploadLog('warn', 'upload.validation_error', { ...context, stage: 'missing_file', status: 400 });
    return uploadJson({ error: 'Selecciona una imagen o video.' }, 400, requestId);
  }
  let storage;
  try { storage = await storageSummary(env); }
  catch {
    uploadLog('error', 'upload.database_error', { ...context, stage: 'storage_summary', status: 503 });
    return uploadJson({ error: 'No se pudo consultar el espacio disponible. Intenta nuevamente.' }, 503, requestId);
  }
  const checked = validateUploadMetadata(file, storage, maximum);
  if (!checked.valid) {
    uploadLog('warn', 'upload.validation_error', { ...context, stage: checked.code || 'metadata', status: checked.status, size: Number(file.size) || null });
    return uploadJson({ error: checked.message }, checked.status, requestId);
  }
  let signatureValid = false;
  try { signatureValid = await verifyFileSignature(file, checked); } catch {}
  if (!signatureValid) {
    uploadLog('warn', 'upload.validation_error', { ...context, stage: 'signature', status: 415, size: checked.size, canonicalMime: checked.mime });
    return uploadJson({ error: 'Este formato no es compatible.' }, 415, requestId);
  }
  uploadLog('info', 'upload.validation_ok', { ...context, size: checked.size, canonicalMime: checked.mime });
  const id = crypto.randomUUID();
  const storageKey = safeStorageKey(id, checked.extension);
  const displayName = (file.name.replace(/\.[^.]+$/, '').trim() || 'Contenido').slice(0, 120);
  try {
    await env.MEDIA_BUCKET.put(storageKey, file.stream(), { httpMetadata: { contentType: checked.mime }, customMetadata: { mediaId: id } });
    uploadLog('info', 'upload.r2_ok', { ...context, mediaId: id, size: checked.size, canonicalMime: checked.mime });
  } catch {
    uploadLog('error', 'upload.r2_error', { ...context, mediaId: id, status: 503, size: checked.size, canonicalMime: checked.mime });
    return uploadJson({ error: 'No se pudo guardar el archivo. Intenta nuevamente.' }, 503, requestId);
  }
  try {
    const statements = [
      env.TV_DB.prepare(`INSERT INTO media(id,original_filename,display_name,storage_key,media_type,mime_type,size_bytes,active,sort_order,created_by)
        SELECT ?,?,?,?,?,?,?,1,COALESCE((SELECT MAX(sort_order)+1 FROM media),1),? FROM settings
        WHERE id='main' AND used_bytes+?<=storage_limit_bytes`).bind(id, file.name, displayName, storageKey, checked.type, checked.mime, checked.size, auth.user_id, checked.size),
      env.TV_DB.prepare(`UPDATE settings SET used_bytes=used_bytes+?,updated_at=CURRENT_TIMESTAMP
        WHERE id='main' AND EXISTS(SELECT 1 FROM media WHERE id=?)`).bind(checked.size, id),
    ];
    const results = await env.TV_DB.batch(statements);
    if (!Number(results[0]?.meta?.changes)) {
      await env.MEDIA_BUCKET.delete(storageKey);
      uploadLog('warn', 'upload.validation_error', { ...context, mediaId: id, stage: 'storage_quota', status: 413, size: checked.size });
      return uploadJson({ error: 'No hay espacio suficiente para este archivo.' }, 413, requestId);
    }
    uploadLog('info', 'upload.database_ok', { ...context, mediaId: id, size: checked.size });
  } catch {
    await env.MEDIA_BUCKET.delete(storageKey).catch(() => {});
    uploadLog('error', 'upload.database_error', { ...context, mediaId: id, stage: 'media_insert', status: 503, size: checked.size });
    return uploadJson({ error: 'No se pudo registrar el contenido. Intenta nuevamente.' }, 503, requestId);
  }
  try { await audit(env, auth.user_id, 'upload', id, { sizeBytes: checked.size, mime: checked.mime }); }
  catch { uploadLog('warn', 'upload.audit_error', { ...context, mediaId: id }); }
  uploadLog('info', 'upload.complete', { ...context, mediaId: id, status: 201, size: checked.size, canonicalMime: checked.mime });
  return uploadJson({ ok: true, id }, 201, requestId);
}

async function deleteMedia(env, auth, id) {
  const row = await env.TV_DB.prepare('SELECT id,storage_key,size_bytes FROM media WHERE id=? AND deleting=0').bind(id).first();
  if (!row) return json({ error: 'Contenido no encontrado.' }, 404);
  const claimed = await env.TV_DB.prepare('UPDATE media SET deleting=1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleting=0').bind(id).run();
  if (!Number(claimed.meta?.changes)) return json({ error: 'El contenido ya está siendo eliminado.' }, 409);
  try { await env.MEDIA_BUCKET.delete(row.storage_key); }
  catch {
    await env.TV_DB.prepare('UPDATE media SET deleting=0 WHERE id=?').bind(id).run();
    return json({ error: 'No se pudo eliminar el archivo. Intenta de nuevo.' }, 503);
  }
  await env.TV_DB.batch([
    env.TV_DB.prepare('DELETE FROM media WHERE id=? AND deleting=1').bind(id),
    env.TV_DB.prepare('UPDATE settings SET used_bytes=MAX(0,used_bytes-?),updated_at=CURRENT_TIMESTAMP WHERE id=\'main\'').bind(row.size_bytes),
  ]);
  await audit(env, auth.user_id, 'delete', id, { sizeBytes: Number(row.size_bytes) });
  return json({ ok: true });
}

async function updateMedia(request, env, auth, id) {
  const body = await readJson(request);
  if (typeof body?.active !== 'boolean') return json({ error: 'Estado no válido.' }, 400);
  const result = await env.TV_DB.prepare('UPDATE media SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleting=0').bind(body.active ? 1 : 0, id).run();
  if (!Number(result.meta?.changes)) return json({ error: 'Contenido no encontrado.' }, 404);
  await audit(env, auth.user_id, body.active ? 'activate' : 'deactivate', id);
  return json({ ok: true });
}

async function reorder(request, env, auth) {
  const body = await readJson(request, 65536);
  const ids = body?.ids;
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string')) return json({ error: 'Orden no válido.' }, 400);
  const existing = await env.TV_DB.prepare('SELECT id FROM media WHERE deleting=0 ORDER BY sort_order').all();
  const expected = (existing.results || []).map(row => row.id);
  if (ids.length !== expected.length || ids.some(id => !expected.includes(id))) return json({ error: 'La biblioteca cambió. Recarga antes de ordenar.' }, 409);
  await env.TV_DB.batch(ids.map((id, index) => env.TV_DB.prepare('UPDATE media SET sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(index + 1, id)));
  await audit(env, auth.user_id, 'reorder', null, { count: ids.length });
  return json({ ok: true });
}

async function changePassword(request, env, auth) {
  const body = await readJson(request);
  if (typeof body?.currentPassword !== 'string' || typeof body?.newPassword !== 'string') return json({ error: 'Datos no válidos.' }, 400);
  const user = await env.TV_DB.prepare('SELECT password_hash FROM admin_users WHERE id=?').bind(auth.user_id).first();
  if (!user || !await verifyPassword(body.currentPassword, user.password_hash)) return json({ error: 'La contraseña actual no es correcta.' }, 401);
  let passwordHash;
  try { passwordHash = await hashPassword(body.newPassword); }
  catch (error) { return json({ error: error.message }, 400); }
  await env.TV_DB.prepare('UPDATE admin_users SET password_hash=?,updated_at=CURRENT_TIMESTAMP,password_changed_at=CURRENT_TIMESTAMP WHERE id=?').bind(passwordHash, auth.user_id).run();
  await revokeUserSessions(env, auth.user_id);
  const session = await createSession(request, env, auth.user_id);
  await audit(env, auth.user_id, 'password_change');
  return json({ ok: true }, 200, { 'Set-Cookie': session.setCookie });
}

export async function handleAdmin(request, env) {
  const pathname = new URL(request.url).pathname;
  if (env.TV_ADMIN_ENABLED !== 'true') return protectedResponse(new Response('Panel no disponible.', { status: 404 }));
  if (!safeAdminTransport(request, env)) return protectedResponse(new Response('Se requiere HTTPS.', { status: 403 }));
  if (!authConfigured(env)) return protectedResponse(new Response('Panel pendiente de configuración.', { status: 503 }));
  if (ADMIN_FILES.has(pathname)) {
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Método no permitido.' }, 405);
    return asset(request, env, ADMIN_FILES.get(pathname));
  }
  if (!pathname.startsWith('/admin/api/')) return protectedResponse(new Response('No encontrado.', { status: 404 }));
  if (pathname === '/admin/api/bootstrap') return bootstrap(request, env);
  if (pathname === '/admin/api/login') return login(request, env);

  const auth = await authenticate(request, env);
  if (!auth) return json({ error: 'Inicia sesión para continuar.' }, 401);
  if (request.method !== 'GET' && request.method !== 'HEAD' && !sameOrigin(request, env)) return json({ error: 'Solicitud no permitida.' }, 403);
  if (pathname === '/admin/api/session' && request.method === 'GET') return json({ username: auth.username, displayName: auth.display_name });
  if (pathname === '/admin/api/logout' && request.method === 'POST') {
    await revokeSession(env, auth.tokenHash);
    return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
  }
  if (pathname === '/admin/api/password' && request.method === 'POST') return changePassword(request, env, auth);
  if (pathname === '/admin/api/content' && request.method === 'GET') return json({ items: await listMedia(env), storage: await storageSummary(env), uploadEnabled: true });
  if (pathname === '/admin/api/uploads' && request.method === 'POST') return upload(request, env, auth);
  if (pathname === '/admin/api/reorder' && request.method === 'POST') return reorder(request, env, auth);
  const preview = /^\/admin\/api\/media\/([a-z0-9][a-z0-9-]{0,63})$/.exec(pathname);
  if (preview && ['GET', 'HEAD'].includes(request.method)) {
    const row = await env.TV_DB.prepare('SELECT id,storage_key,mime_type,size_bytes,active,deleting FROM media WHERE id=?').bind(preview[1]).first();
    return protectedResponse(await objectResponse(request, env, row, true));
  }
  const item = /^\/admin\/api\/content\/([a-z0-9][a-z0-9-]{0,63})$/.exec(pathname);
  if (item && request.method === 'PATCH') return updateMedia(request, env, auth, item[1]);
  if (item && request.method === 'DELETE') return deleteMedia(env, auth, item[1]);
  return json({ error: 'No encontrado.' }, 404);
}
