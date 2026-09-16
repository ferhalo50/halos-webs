const ROOT = '';
const CANONICAL_HOST = 'hermanitos.haloswebs.com';
const LEGACY_HOST = 'app.haloswebs.com';
const encoder = new TextEncoder();
const iso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
class Fault extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const fail = (status, code, message) => { throw new Fault(status, code, message); };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const query = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const all = async (env, sql, ...args) => (await query(env, sql, ...args).all()).results;
const first = (env, sql, ...args) => query(env, sql, ...args).first();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async text => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
export async function hashPassword(password, salt = random()) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = b64(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256)));
  return { hash, salt };
}
const equal = (a, b) => {
  let different = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) different |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return different === 0;
};
export const username = name => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const publicUser = u => ({ id: u.id, name: u.name, phone: u.phone, role: u.role, active: u.active, created_at: u.created_at });
const cookieValue = req => (req.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('hermanitos_session='))?.slice(19) || '';
function sessionCookie(token, maxAge = 2592000) {
  return `hermanitos_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
async function body(req) {
  if (!req.headers.get('content-type')?.startsWith('application/json')) fail(415, 'json_required', 'Envía los datos como JSON.');
  if (Number(req.headers.get('content-length')) > 16384) fail(413, 'too_large', 'Demasiados datos.');
  const text = await req.text();
  if (text.length > 16384) fail(413, 'too_large', 'Demasiados datos.');
  try { const data = JSON.parse(text); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error(); return data; }
  catch { fail(400, 'bad_json', 'Revisa los datos enviados.'); }
}
function profile(data) {
  const name = String(data.name || '').trim().replace(/\s+/g, ' ');
  const phone = String(data.phone || '').replace(/\D/g, '');
  if (name.length < 2 || name.length > 40 || !/^[\p{L}\p{N} ._-]+$/u.test(name)) fail(400, 'bad_name', 'Usa un nombre de 2 a 40 letras o números.');
  if (phone && !/^\d{10,15}$/.test(phone)) fail(400, 'bad_phone', 'Escribe un teléfono de 10 a 15 dígitos.');
  return { name, username: username(name), phone: phone || null };
}
function passwordInput(value, min = 3) {
  if (typeof value !== 'string' || value.length < min || value.length > 128) fail(400, 'bad_password', `La contraseña debe tener de ${min} a 128 caracteres.`);
  return value;
}
async function throttle(env, key, limit, windowMs) {
  const now = Date.now();
  const row = await query(env, `INSERT INTO rate_limits(key,count,expires_ms) VALUES(?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_ms<=? THEN 1 ELSE count+1 END,
    expires_ms=CASE WHEN expires_ms<=? THEN excluded.expires_ms ELSE expires_ms END RETURNING count`, key, now + windowMs, now, now).first();
  if (row.count > limit) fail(429, 'rate_limit', 'Demasiados intentos. Espera 15 minutos y vuelve a intentar.');
}
async function session(env, userId) {
  const token = random();
  await query(env, 'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)', await digest(token), userId, new Date(Date.now() + 2592000000).toISOString()).run();
  return sessionCookie(token);
}
async function authenticate(req, env) {
  const token = cookieValue(req);
  const u = token && await first(env, `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 AND u.deleted_at IS NULL`, await digest(token), iso());
  if (!u) fail(401, 'login_required', 'Inicia sesión para continuar.');
  return u;
}
const member = u => { if (u.role !== 'member') fail(403, 'members_only', 'Esta acción es para los hermanos.'); };
const admin = u => { if (u.role !== 'admin') fail(403, 'admin_only', 'Solo el administrador puede realizar esta acción.'); };
const audit = (env, actor, action, entity, details = {}) => query(env, 'INSERT INTO audit(actor_id,action,entity_id,details,created_at) VALUES(?,?,?,?,?)', actor, action, entity, JSON.stringify(details), iso());
const notification = (env, userId, actor, kind, ref) => query(env, 'INSERT INTO notifications(user_id,actor_id,kind,reference_id,created_at) VALUES(?,?,?,?,?)', userId, actor, kind, ref, iso());

export function monthKey(value = new Date(), timeZone = 'America/Tijuana') {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(value);
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
}
export function monthStart(key, timeZone = 'America/Tijuana') {
  // Convert local calendar midnight to UTC, including Tijuana daylight saving time.
  const [year, month] = key.split('-').map(Number);
  const desired = Date.UTC(year, month - 1, 1);
  let timestamp = desired;
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let n = 0; n < 3; n++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(timestamp)).map(x => [x.type, x.value]));
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    timestamp += desired - represented;
  }
  return new Date(timestamp).toISOString();
}
export function monthAfter(key) {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(Date.UTC(y, m, 15)), 'UTC');
}
async function totals(env, u) {
  const start = monthStart(monthKey(new Date(), env.APP_TIMEZONE), env.APP_TIMEZONE);
  const rows = await first(env, `SELECT
    (SELECT COUNT(*) FROM stamps WHERE scanner_id=? AND voided_at IS NULL) stamps,
    (SELECT COUNT(*) FROM favors WHERE creditor_id=? AND status<>'cancelled') spent,
    (SELECT COUNT(*) FROM favors WHERE debtor_id=? AND status='pending') owed,
    (SELECT COUNT(*) FROM favors WHERE creditor_id=? AND status='pending') owing_to_me,
    (SELECT COUNT(*) FROM favors WHERE debtor_id=? AND status='completed' AND completed_at>=? AND completed_at>COALESCE(?,'')) completed`,
  u.id, u.id, u.id, u.id, u.id, start, u.completed_reset_at);
  return { ...rows, progress: rows.stamps % 10, credits: Math.max(0, Math.floor(rows.stamps / 10) - rows.spent), cooldown_until: u.last_scan_ms + 60000, month: monthKey(new Date(), env.APP_TIMEZONE) };
}
const favorSql = `SELECT f.*,c.name creditor_name,d.name debtor_name FROM favors f JOIN users c ON c.id=f.creditor_id JOIN users d ON d.id=f.debtor_id`;
const stampSql = `SELECT s.*,c.name scanner_name,d.name target_name FROM stamps s JOIN users c ON c.id=s.scanner_id JOIN users d ON d.id=s.target_id`;
async function dashboard(env, u) {
  const [stats, favors, siblings, notifications, unread] = await Promise.all([
    totals(env, u),
    all(env, `${favorSql} WHERE (f.creditor_id=? OR f.debtor_id=?) AND (f.status='pending' OR f.id IN
      (SELECT id FROM favors WHERE (creditor_id=? OR debtor_id=?) AND status<>'pending' ORDER BY closed_at DESC LIMIT 30))
      ORDER BY CASE WHEN f.status='pending' THEN 0 ELSE 1 END,f.created_at DESC`, u.id, u.id, u.id, u.id),
    all(env, `SELECT id,name FROM users WHERE role='member' AND active=1 AND deleted_at IS NULL AND id<>? ORDER BY name`, u.id),
    all(env, `SELECT n.*,u.name actor_name FROM notifications n LEFT JOIN users u ON u.id=n.actor_id WHERE n.user_id=? ORDER BY n.id DESC LIMIT 30`, u.id),
    first(env, 'SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL', u.id)
  ]);
  return { user: publicUser(u), qr: `hermanitos:v1:${u.qr_token}`, stats, favors, siblings, notifications, unread: unread.n, server_time: Date.now() };
}
async function history(env, u, url) {
  const key = url.searchParams.get('month') || monthKey(new Date(), env.APP_TIMEZONE);
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(key)) fail(400, 'bad_month', 'Mes inválido.');
  const start = monthStart(key, env.APP_TIMEZONE), end = monthStart(monthAfter(key), env.APP_TIMEZONE);
  const [stamps, favors, summary] = await Promise.all([
    all(env, `${stampSql} WHERE (s.scanner_id=? OR s.target_id=?) AND s.created_at>=? AND s.created_at<? ORDER BY s.created_at DESC LIMIT 200`, u.id, u.id, start, end),
    all(env, `${favorSql} WHERE (f.creditor_id=? OR f.debtor_id=?) AND ((f.created_at>=? AND f.created_at<?) OR (f.closed_at>=? AND f.closed_at<?) OR (f.completed_at>=? AND f.completed_at<?)) ORDER BY COALESCE(f.completed_at,f.closed_at,f.created_at) DESC LIMIT 200`, u.id, u.id, start, end, start, end, start, end),
    first(env, `SELECT
      (SELECT COUNT(*) FROM favors WHERE debtor_id=? AND completed_at>=? AND completed_at<?) completed,
      (SELECT COUNT(*) FROM favor_events e WHERE e.debtor_id=? AND e.status='pending' AND e.created_at<? AND e.id=
        (SELECT MAX(e2.id) FROM favor_events e2 WHERE e2.favor_id=e.favor_id AND e2.recorded_at<?)) pending_at_end,
      (SELECT COUNT(*) FROM stamps WHERE scanner_id=? AND created_at>=? AND created_at<? AND voided_at IS NULL) stamps`, u.id, start, end, u.id, end, end, u.id, start, end)
  ]);
  return { month: key, current: key === monthKey(new Date(), env.APP_TIMEZONE), summary, stamps, favors, max_rows: 200 };
}
async function authRoutes(req, env, path) {
  const data = await body(req);
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  await throttle(env, `auth-ip:${ip}`, 30, 900000);
  if (path === '/signup') {
    await throttle(env, `signup-ip:${ip}`, 5, 900000);
    const p = profile(data); passwordInput(data.password, 6);
    if (!p.phone) fail(400, 'phone_required', 'Escribe tu número de teléfono.');
    if (p.username === 'admin') fail(409, 'name_taken', 'Ese nombre ya está en uso.');
    const secret = await hashPassword(data.password), id = uuid();
    await env.DB.batch([
      query(env, `INSERT INTO users(id,name,username,phone,password_hash,password_salt,qr_token,created_at) VALUES(?,?,?,?,?,?,?,?)`, id, p.name, p.username, p.phone, secret.hash, secret.salt, random(), iso()),
      audit(env, id, 'signup', id)
    ]);
    return json({ ok: true }, 201, { 'set-cookie': await session(env, id) });
  }
  const name = username(data.name); passwordInput(data.password);
  await throttle(env, `login:${name}`, 5, 900000);
  const u = await first(env, 'SELECT * FROM users WHERE username=? AND active=1 AND deleted_at IS NULL', name);
  const actual = await hashPassword(data.password, u?.password_salt || 'hermanitos-unknown-user-fixed-salt');
  if (!u || !equal(actual.hash, u.password_hash)) fail(401, 'invalid_login', 'Nombre o contraseña incorrectos.');
  await query(env, 'DELETE FROM rate_limits WHERE key=?', `login:${name}`).run();
  return json({ ok: true, user: publicUser(u) }, 200, { 'set-cookie': await session(env, u.id) });
}

async function adminRoutes(req, env, u, path, url) {
  admin(u);
  if (path === '/admin' && req.method === 'GET') {
    const offset = Math.max(0, Math.min(100000, Number(url.searchParams.get('offset')) || 0));
    const start = monthStart(monthKey(new Date(), env.APP_TIMEZONE), env.APP_TIMEZONE);
    const [users, stamps, favors, logs] = await Promise.all([
      all(env, `SELECT id,name,phone,role,active,deleted_at,created_at,
        (SELECT COUNT(*) FROM stamps WHERE scanner_id=u.id AND voided_at IS NULL) stamps,
        (SELECT COUNT(*) FROM favors WHERE creditor_id=u.id AND status<>'cancelled') spent,
        (SELECT COUNT(*) FROM favors WHERE debtor_id=u.id AND status='pending') owed,
        (SELECT COUNT(*) FROM favors WHERE debtor_id=u.id AND status='completed' AND completed_at>=? AND completed_at>COALESCE(u.completed_reset_at,'')) completed
        FROM users u ORDER BY role,name`, start),
      all(env, `${stampSql} ORDER BY s.created_at DESC LIMIT 50 OFFSET ?`, offset),
      all(env, `${favorSql} ORDER BY f.created_at DESC LIMIT 50 OFFSET ?`, offset),
      all(env, `SELECT a.*,u.name actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 50 OFFSET ?`, offset)
    ]);
    for (const person of users) if (person.role === 'member') person.stats = { stamps: person.stamps, credits: Math.max(0, Math.floor(person.stamps/10)-person.spent), owed: person.owed, completed: person.completed };
    return json({ users, stamps, favors, audit: logs, offset, has_more: stamps.length === 50 || favors.length === 50 || logs.length === 50 });
  }
  const match = path.match(/^\/admin\/(users|stamps|favors)\/([^/]+)(?:\/(clear-completed|clear-pending))?$/);
  if (!match) fail(404, 'not_found', 'Acción no encontrada.');
  const [, type, id, action] = match;
  const data = req.method === 'DELETE' ? {} : await body(req);
  if (type === 'users') {
    const target = await first(env, 'SELECT * FROM users WHERE id=?', id);
    if (!target || target.role === 'admin') fail(400, 'invalid_member', 'Elige una cuenta de hermano.');
    if (action && req.method === 'POST') {
      if (data.confirm !== true) fail(400, 'confirmation_required', 'Confirma la limpieza.');
      const now = iso();
      const statement = action === 'clear-completed'
        ? query(env, 'UPDATE users SET completed_reset_at=? WHERE id=?', now, id)
        : query(env, `UPDATE favors SET status='cleared',closed_at=? WHERE debtor_id=? AND status='pending'`, now, id);
      const before = await totals(env, target);
      const statements = [statement, audit(env, u.id, action, id, { before }), notification(env, id, u.id, action, id)];
      if (action === 'clear-pending') {
        // Notify creditors before closing the debts, atomically with the cleanup.
        statements.unshift(query(env, `INSERT INTO notifications(user_id,actor_id,kind,reference_id,created_at)
          SELECT creditor_id,?,'admin-cleared',id,? FROM favors WHERE debtor_id=? AND status='pending'`, u.id, now, id));
      }
      await env.DB.batch(statements);
      return json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await env.DB.batch([
        query(env, 'UPDATE users SET active=0,deleted_at=?,qr_token=? WHERE id=?', iso(), random(), id),
        query(env, 'DELETE FROM sessions WHERE user_id=?', id), audit(env, u.id, 'delete-user', id, { name: target.name })
      ]);
      return json({ ok: true });
    }
    if (req.method === 'PATCH') {
      if (target.deleted_at) fail(409, 'deleted', 'La cuenta fue eliminada.');
      const p = profile(data);
      if (p.username === 'admin') fail(409, 'name_taken', 'Ese nombre está reservado.');
      const active = data.active === false ? 0 : 1;
      const statements = [query(env, 'UPDATE users SET name=?,username=?,phone=?,active=? WHERE id=?', p.name, p.username, p.phone, active, id), query(env, 'DELETE FROM sessions WHERE user_id=?', id)];
      if (data.password) {
        const secret = await hashPassword(passwordInput(data.password));
        statements.push(query(env, 'UPDATE users SET password_hash=?,password_salt=? WHERE id=?', secret.hash, secret.salt, id));
      }
      statements.push(audit(env, u.id, 'edit-user', id, { before: publicUser(target), after: { ...p, active }, password_changed: !!data.password }));
      await env.DB.batch(statements);
      return json({ ok: true });
    }
  }
  if (type === 'stamps') {
    const stamp = await first(env, 'SELECT * FROM stamps WHERE id=?', id);
    if (!stamp || stamp.voided_at) fail(404, 'not_found', 'Sellito no disponible.');
    if (req.method === 'DELETE') {
      await env.DB.batch([query(env, 'UPDATE stamps SET voided_at=? WHERE id=?', iso(), id), audit(env, u.id, 'delete-stamp', id, { before: stamp }), notification(env, stamp.scanner_id, u.id, 'delete-stamp', id)]);
      return json({ ok: true });
    }
    if (req.method === 'PATCH') {
      const target = await first(env, `SELECT id FROM users WHERE id=? AND role='member' AND active=1`, String(data.target_id || ''));
      if (!target || target.id === stamp.scanner_id) fail(400, 'invalid_member', 'Elige a otro hermano.');
      const date = new Date(data.created_at);
      if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now()) fail(400, 'bad_date', 'La fecha debe ser válida y no futura.');
      await env.DB.batch([query(env, 'UPDATE stamps SET target_id=?,created_at=? WHERE id=?', target.id, date.toISOString(), id), audit(env, u.id, 'edit-stamp', id, { before: stamp, target_id: target.id, created_at: date.toISOString() })]);
      return json({ ok: true });
    }
  }
  if (type === 'favors') {
    const favor = await first(env, 'SELECT * FROM favors WHERE id=?', id);
    if (!favor || favor.status === 'cancelled') fail(404, 'not_found', 'Favor no disponible.');
    if (req.method === 'DELETE') {
      await env.DB.batch([query(env, `UPDATE favors SET status='cancelled',closed_at=? WHERE id=?`, iso(), id), audit(env, u.id, 'delete-favor', id, { before: favor }), notification(env, favor.creditor_id, u.id, 'delete-favor', id), notification(env, favor.debtor_id, u.id, 'delete-favor', id)]);
      return json({ ok: true });
    }
    if (req.method === 'PATCH') {
      if (favor.status !== 'pending') fail(409, 'closed', 'Solo se editan favores pendientes; los cerrados conservan su historial.');
      const debtor = await first(env, `SELECT id FROM users WHERE id=? AND role='member' AND active=1`, String(data.debtor_id || ''));
      if (!debtor || debtor.id === favor.creditor_id) fail(400, 'invalid_member', 'Elige a otro hermano.');
      await env.DB.batch([query(env, 'UPDATE favors SET debtor_id=? WHERE id=? AND status=\'pending\'', debtor.id, id), audit(env, u.id, 'edit-favor', id, { before: favor, debtor_id: debtor.id }), notification(env, debtor.id, u.id, 'favor-assigned', id), notification(env, favor.debtor_id, u.id, 'favor-reassigned', id)]);
      return json({ ok: true });
    }
  }
  fail(405, 'method_not_allowed', 'Acción no permitida.');
}

async function api(req, env, url) {
  const path = url.pathname.slice('/api'.length);
  if (req.method === 'GET' && path === '/config') return json({ music: env.MUSIC_ENABLED === 'true', timezone: env.APP_TIMEZONE || 'America/Tijuana' });
  if (req.method === 'POST' && ['/login', '/signup'].includes(path)) return authRoutes(req, env, path);
  const u = await authenticate(req, env);
  if (path.startsWith('/admin')) return adminRoutes(req, env, u, path, url);
  if (path === '/me' && req.method === 'GET') return json(u.role === 'admin' ? { user: publicUser(u) } : await dashboard(env, u));
  if (path === '/history' && req.method === 'GET') { member(u); return json(await history(env, u, url)); }
  if (path === '/logout' && req.method === 'POST') {
    await query(env, 'DELETE FROM sessions WHERE token_hash=?', await digest(cookieValue(req))).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }
  if (path === '/password' && req.method === 'POST') {
    const data = await body(req); passwordInput(data.current); passwordInput(data.password, u.role === 'admin' ? 8 : 6);
    if (!equal((await hashPassword(data.current, u.password_salt)).hash, u.password_hash)) fail(400, 'wrong_password', 'La contraseña actual no coincide.');
    const secret = await hashPassword(data.password);
    await env.DB.batch([query(env, 'UPDATE users SET password_hash=?,password_salt=? WHERE id=?', secret.hash, secret.salt, u.id), query(env, 'DELETE FROM sessions WHERE user_id=?', u.id), audit(env, u.id, 'password-changed', u.id)]);
    return json({ ok: true }, 200, { 'set-cookie': await session(env, u.id) });
  }
  if (path === '/notifications/read' && req.method === 'POST') {
    const data = await body(req), max = Number(data.through_id);
    if (!Number.isSafeInteger(max) || max < 0) fail(400, 'bad_id', 'Notificación inválida.');
    await query(env, 'UPDATE notifications SET read_at=? WHERE user_id=? AND id<=? AND read_at IS NULL', iso(), u.id, max).run();
    return json({ ok: true });
  }
  member(u);
  if (path === '/scan' && req.method === 'POST') {
    const data = await body(req), id = String(data.request_id || '');
    if (!/^[\da-f-]{36}$/i.test(id)) fail(400, 'bad_id', 'Identificador de escaneo inválido.');
    const existing = await first(env, 'SELECT id FROM stamps WHERE id=? AND scanner_id=?', id, u.id);
    if (existing) return json({ ok: true, duplicate: true });
    const token = String(data.qr || '').match(/^hermanitos:v1:([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) fail(400, 'invalid_qr', 'Este QR no pertenece a Hermanitos Card.');
    const target = await first(env, `SELECT id,name FROM users WHERE qr_token=? AND active=1 AND deleted_at IS NULL AND role='member'`, token);
    if (!target) fail(404, 'invalid_qr', 'Este QR ya no está disponible.');
    if (target.id === u.id) fail(400, 'self_scan', 'No puedes escanear tu propio QR.');
    const remaining = u.last_scan_ms + 60000 - Date.now();
    if (remaining > 0) return json({ error: `Espera ${Math.ceil(remaining / 1000)} segundos para tu siguiente sellito.`, code: 'scan_cooldown', retry_after: Math.ceil(remaining / 1000) }, 429, { 'retry-after': String(Math.ceil(remaining / 1000)) });
    await query(env, 'INSERT INTO stamps(id,scanner_id,target_id,created_at) VALUES(?,?,?,?)', id, u.id, target.id, iso()).run();
    return json({ ok: true, target: target.name }, 201);
  }
  if (path === '/favors' && req.method === 'POST') {
    const data = await body(req), id = String(data.request_id || ''), debtor = String(data.debtor_id || '');
    if (!/^[\da-f-]{36}$/i.test(id)) fail(400, 'bad_id', 'Identificador de favor inválido.');
    if (debtor === u.id) fail(400, 'self_favor', 'Elige a otro hermano.');
    if (await first(env, 'SELECT id FROM favors WHERE id=? AND creditor_id=?', id, u.id)) return json({ ok: true, duplicate: true });
    await query(env, 'INSERT INTO favors(id,creditor_id,debtor_id,created_at) VALUES(?,?,?,?)', id, u.id, debtor, iso()).run();
    return json({ ok: true }, 201);
  }
  const complete = path.match(/^\/favors\/([^/]+)\/complete$/);
  if (complete && req.method === 'POST') {
    await body(req);
    const favor = await first(env, 'SELECT * FROM favors WHERE id=? AND creditor_id=?', complete[1], u.id);
    if (!favor) fail(404, 'not_found', 'Solo quien recibe el favor puede confirmarlo.');
    if (favor.status !== 'pending') fail(409, 'already_closed', 'Este favor ya está cerrado.');
    const now = iso();
    const result = await env.DB.batch([
      query(env, `UPDATE favors SET status='completed',completed_at=?,closed_at=? WHERE id=? AND creditor_id=? AND status='pending' RETURNING id`, now, now, favor.id, u.id),
      query(env, `INSERT INTO audit(actor_id,action,entity_id,details,created_at) SELECT ?,'favor-completed',?,'{}',? WHERE changes()>0`, u.id, favor.id, now)
    ]);
    if (!result[0].results.length) fail(409, 'already_closed', 'Este favor ya está cerrado.');
    return json({ ok: true });
  }
  fail(404, 'not_found', 'No encontramos esa acción.');
}
function secure(response, apiRoute) {
  const h = new Headers(response.headers);
  h.set('x-content-type-options', 'nosniff'); h.set('x-frame-options', 'DENY');
  h.set('referrer-policy', 'same-origin');
  h.set('permissions-policy', 'camera=(self), microphone=(), geolocation=()');
  h.set('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
  h.set('cache-control', apiRoute ? 'no-store' : 'no-cache');
  return new Response(response.body, { status: response.status, headers: h });
}
export default {
  async fetch(req, env) {
    const url = new URL(req.url), apiRoute = url.pathname.startsWith('/api/');
    try {
      if (url.hostname === LEGACY_HOST && (url.pathname === '/hermanitos' || url.pathname.startsWith('/hermanitos/'))) {
        const path = url.pathname.slice('/hermanitos'.length) || '/';
        return secure(Response.redirect(`https://${CANONICAL_HOST}${path}${url.search}`, 308), false);
      }
      if (url.hostname === CANONICAL_HOST && (url.pathname === '/hermanitos' || url.pathname.startsWith('/hermanitos/'))) {
        const path = url.pathname.slice('/hermanitos'.length) || '/';
        return secure(Response.redirect(`https://${CANONICAL_HOST}${path}${url.search}`, 308), false);
      }
      if (apiRoute) {
        if (!['GET', 'HEAD'].includes(req.method) && req.headers.get('origin') !== url.origin) fail(403, 'origin', 'Recarga la página para continuar de forma segura.');
        return secure(await api(req, env, url), true);
      }
      return secure(await env.ASSETS.fetch(req), false);
    } catch (e) {
      let status = e.status || 500, code = e.code || 'unavailable', message = e.status ? e.message : 'No pudimos guardar los cambios. Inténtalo de nuevo.';
      const detail = `${e.message || ''} ${e.cause?.message || ''}`;
      if (detail.includes('scan_cooldown')) { status = 429; code = 'scan_cooldown'; message = 'Espera un minuto entre sellitos.'; }
      else if (detail.includes('no_credit')) { status = 409; code = 'no_credit'; message = 'Necesitas 10 sellitos disponibles para pedir un favor mayor.'; }
      else if (detail.includes('invalid_member')) { status = 400; code = 'invalid_member'; message = 'Elige a un hermano con cuenta activa.'; }
      else if (detail.includes('users.username')) { status = 409; code = 'name_taken'; message = 'Ese nombre ya está en uso. Elige otro.'; }
      else if (detail.includes('UNIQUE constraint failed')) { status = 409; code = 'duplicate'; message = 'Este movimiento ya fue registrado. Actualiza tu tarjeta.'; }
      if (status === 500) console.error('Hermanitos operation failed', detail.slice(0, 300));
      return secure(json({ error: message, code }, status), true);
    }
  },
  async scheduled(_controller, env) {
    await env.DB.batch([query(env, 'DELETE FROM sessions WHERE expires_at<?', iso()), query(env, 'DELETE FROM rate_limits WHERE expires_ms<?', Date.now())]);
  }
};
