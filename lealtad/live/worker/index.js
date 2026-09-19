const encoder = new TextEncoder();
const CANONICAL_HOST = 'renacecafe.haloswebs.com';
const LEGACY_HOST = 'app.haloswebs.com';
const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

function response(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...extraHeaders } });
}

function error(message, status = 400, code = 'bad_request') {
  return response({ ok: false, error: { code, message } }, status);
}

function securityHeaders(res, isApi = false) {
  const headers = new Headers(res.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(self), geolocation=(), microphone=()');
  headers.set('content-security-policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  headers.set('cache-control', isApi ? 'no-store' : 'public, max-age=300');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function legacyServiceWorker() {
  const target = `https://${CANONICAL_HOST}`;
  return new Response(`self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const path = url.pathname === '/renace' ? '/' : (url.pathname.startsWith('/renace/') ? url.pathname.slice('/renace'.length) : url.pathname);
  event.respondWith(Response.redirect('${target}' + path + url.search, 308));
});`, { headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' } });
}

function randomToken(bytes = 32) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(values);
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function sha256(value) {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

const PASSWORD_ITERATIONS = 100000;
const DEMO_PIN = '246810';
const DEMO_CUSTOMERS = [
  { name: 'Cliente demo · 0 sellos', phone: '0000000001', stamps: 0 },
  { name: 'Cliente demo · 8 sellos', phone: '0000000008', stamps: 8 }
];

async function hashSecret(secret, salt = randomToken(16), iterations = PASSWORD_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const safeIterations = Number(iterations) || PASSWORD_ITERATIONS;
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: safeIterations, hash: 'SHA-256' }, material, 256);
  return { salt, hash: base64Url(new Uint8Array(bits)), iterations: safeIterations };
}

async function verifySecret(secret, salt, expected, iterations = PASSWORD_ITERATIONS) {
  const actual = (await hashSecret(secret, salt, iterations)).hash;
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('52') ? digits.slice(2) : digits;
}

function businessDay(timeZone, value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

function cookie(request, name) {
  const pair = (request.headers.get('cookie') || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}

function sessionCookie(token, days) {
  return `renace_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${days * 86400}`;
}

function clearSessionCookie() {
  return 'renace_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';
}

async function body(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw new ApiError(415, 'content_type', 'Envía los datos en formato JSON.');
  try { return await request.json(); } catch { throw new ApiError(400, 'invalid_json', 'El contenido JSON no es válido.'); }
}

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function getBusiness(env, slug = 'renace') {
  const business = await env.DB.prepare('SELECT * FROM businesses WHERE slug = ? AND active = 1').bind(slug).first();
  if (!business) throw new ApiError(404, 'business_not_found', 'No encontramos este negocio.');
  return business;
}

async function getSession(request, env) {
  const token = cookie(request, 'renace_session');
  if (!token) return null;
  const tokenHash = await sha256(token);
  const session = await env.DB.prepare(`
    SELECT s.id AS session_id, s.expires_at, s.last_seen_at, u.id, u.business_id, u.role, u.name, u.phone, u.username, u.active, u.must_change_secret
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1 AND u.deleted_at IS NULL
  `).bind(tokenHash, new Date().toISOString()).first();
  if (!session) return null;
  const lastSeen = Date.parse(session.last_seen_at.includes('T') ? session.last_seen_at : session.last_seen_at.replace(' ', 'T') + 'Z');
  if (Date.now() - lastSeen > 15 * 60000) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(new Date().toISOString(), session.session_id).run();
  }
  return session;
}

async function requireRole(request, env, roles) {
  const user = await getSession(request, env);
  if (!user) throw new ApiError(401, 'unauthorized', 'Inicia sesión para continuar.');
  if (!roles.includes(user.role)) throw new ApiError(403, 'forbidden', 'No tienes permiso para realizar esta acción.');
  return user;
}

async function createSession(env, userId) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const days = Math.max(1, Math.min(90, Number(env.SESSION_DAYS) || 30));
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id, token_hash, user_id, expires_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), tokenHash, userId, expires).run();
  return { token, days };
}

async function checkLoginLimit(env, key) {
  const row = await env.DB.prepare('SELECT attempts, blocked_until FROM login_attempts WHERE login_key = ?').bind(key).first();
  if (row?.blocked_until && Date.parse(row.blocked_until) > Date.now()) throw new ApiError(429, 'login_blocked', 'Demasiados intentos. Espera 15 minutos.');
}

async function failedLogin(env, key) {
  const now = new Date().toISOString();
  const current = await env.DB.prepare('SELECT attempts FROM login_attempts WHERE login_key = ?').bind(key).first();
  const attempts = (current?.attempts || 0) + 1;
  const blocked = attempts >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
  await env.DB.prepare(`INSERT INTO login_attempts (login_key, attempts, blocked_until, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(login_key) DO UPDATE SET attempts = excluded.attempts, blocked_until = excluded.blocked_until, updated_at = excluded.updated_at`)
    .bind(key, attempts, blocked, now).run();
}

async function login(request, env, kind) {
  const input = await body(request);
  const business = await getBusiness(env, input.business || 'renace');
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const identifier = kind === 'customer' ? normalizePhone(input.phone) : String(input.username || '').trim().toLowerCase();
  const loginKey = `${business.id}:${kind}:${identifier}:${ip}`;
  await checkLoginLimit(env, loginKey);
  const query = kind === 'customer'
    ? "SELECT * FROM users WHERE business_id = ? AND role = 'customer' AND phone = ? AND active = 1 AND deleted_at IS NULL"
    : "SELECT * FROM users WHERE business_id = ? AND role IN ('employee','admin') AND username = ? AND active = 1 AND deleted_at IS NULL";
  const user = await env.DB.prepare(query).bind(business.id, identifier).first();
  const secret = String(kind === 'customer' ? input.pin : input.password || '');
  if (!user || !(await verifySecret(secret, user.secret_salt, user.secret_hash, user.secret_iterations))) {
    await failedLogin(env, loginKey);
    throw new ApiError(401, 'invalid_credentials', 'Revisa tus datos de acceso.');
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE login_key = ?').bind(loginKey).run();
  const session = await createSession(env, user.id);
  return response({ ok: true, user: publicUser(user) }, 200, { 'set-cookie': sessionCookie(session.token, session.days) });
}

function publicUser(user) {
  return { id: user.id, role: user.role, name: user.name, phone: user.phone || null, username: user.username || null, mustChangeSecret: Boolean(user.must_change_secret) };
}

async function setup(request, env) {
  if (!env.BOOTSTRAP_SECRET || request.headers.get('x-bootstrap-secret') !== env.BOOTSTRAP_SECRET) throw new ApiError(404, 'not_found', 'Ruta no disponible.');
  const business = await getBusiness(env);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE business_id = ? AND role = 'admin'").bind(business.id).first();
  if (existing) throw new ApiError(409, 'already_setup', 'La administración ya fue configurada.');
  const input = await body(request);
  if (!/^[a-z0-9_-]{3,30}$/i.test(input.adminUsername || '') || String(input.adminPassword || '').length < 10) throw new ApiError(400, 'invalid_admin', 'El usuario debe ser válido y la contraseña debe tener al menos 10 caracteres.');
  if (!/^[a-z0-9_-]{3,30}$/i.test(input.employeeUsername || '') || String(input.employeePassword || '').length < 8) throw new ApiError(400, 'invalid_employee', 'Configura un empleado con contraseña de al menos 8 caracteres.');
  const adminSecret = await hashSecret(String(input.adminPassword));
  const employeeSecret = await hashSecret(String(input.employeePassword));
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id,business_id,role,name,username,secret_hash,secret_salt) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), business.id, 'admin', String(input.adminName || 'Administración'), input.adminUsername.toLowerCase(), adminSecret.hash, adminSecret.salt),
    env.DB.prepare("INSERT INTO users (id,business_id,role,name,username,secret_hash,secret_salt) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), business.id, 'employee', String(input.employeeName || 'Mostrador'), input.employeeUsername.toLowerCase(), employeeSecret.hash, employeeSecret.salt)
  ]);
  return response({ ok: true }, 201);
}

async function register(request, env) {
  const input = await body(request);
  const business = await getBusiness(env, input.business || 'renace');
  const phone = normalizePhone(input.phone);
  const name = String(input.name || '').trim();
  const pin = String(input.pin || '');
  if (name.length < 2 || name.length > 60) throw new ApiError(400, 'invalid_name', 'Escribe un nombre válido.');
  if (!/^\d{10}$/.test(phone)) throw new ApiError(400, 'invalid_phone', 'Escribe un celular de 10 dígitos.');
  if (!/^\d{4,8}$/.test(pin)) throw new ApiError(400, 'invalid_pin', 'El PIN debe tener entre 4 y 8 dígitos.');
  const existing = await env.DB.prepare('SELECT id FROM users WHERE business_id = ? AND phone = ?').bind(business.id, phone).first();
  if (existing) throw new ApiError(409, 'phone_exists', 'Ese celular ya tiene una tarjeta.');
  const customerId = crypto.randomUUID();
  const cardId = `REN-${randomToken(9).toUpperCase()}`;
  const qrToken = randomToken(24);
  const secret = await hashSecret(pin);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id,business_id,role,name,phone,secret_hash,secret_salt) VALUES (?,?,?,?,?,?,?)")
      .bind(customerId, business.id, 'customer', name, phone, secret.hash, secret.salt),
    env.DB.prepare('INSERT INTO loyalty_cards (id,business_id,customer_id,qr_token) VALUES (?,?,?,?)')
      .bind(cardId, business.id, customerId, qrToken)
  ]);
  const session = await createSession(env, customerId);
  return response({ ok: true, user: { id: customerId, role: 'customer', name, phone, mustChangeSecret: false } }, 201, { 'set-cookie': sessionCookie(session.token, session.days) });
}

async function cardForCustomer(env, customerId, businessId) {
  return env.DB.prepare(`SELECT c.id, c.qr_token, c.stamps, c.redeemed_count, c.created_at, u.name, u.phone,
    (SELECT MAX(created_at) FROM loyalty_events WHERE card_id = c.id AND event_type = 'stamp' AND voided=0) AS last_stamp_at,
    b.reward_goal, b.reward_name, b.timezone
    FROM loyalty_cards c JOIN users u ON u.id = c.customer_id JOIN businesses b ON b.id = c.business_id
    WHERE c.customer_id = ? AND c.business_id = ? AND u.active=1 AND u.deleted_at IS NULL`).bind(customerId, businessId).first();
}

function publicCard(card) {
  return { id: card.id, qrValue: `renace:${card.qr_token}`, name: card.name, phone: card.phone, stamps: card.stamps, goal: card.reward_goal, reward: card.reward_name, redeemed: card.redeemed_count, lastStampAt: card.last_stamp_at, canStampToday: !card.last_stamp_at || businessDay(card.timezone, new Date(card.last_stamp_at)) !== businessDay(card.timezone) };
}

async function lookupCard(request, env, staff) {
  const url = new URL(request.url);
  const value = String(url.searchParams.get('value') || '').trim();
  if (!value) throw new ApiError(400, 'missing_value', 'Escribe o escanea una tarjeta.');
  const qrToken = value.startsWith('renace:') ? value.slice(7) : '';
  const phone = normalizePhone(value);
  const card = await env.DB.prepare(`SELECT c.id,c.qr_token,c.stamps,c.redeemed_count,u.id AS customer_id,u.name,u.phone,b.reward_goal,b.reward_name,b.timezone,
    (SELECT MAX(created_at) FROM loyalty_events WHERE card_id=c.id AND event_type='stamp' AND voided=0) AS last_stamp_at
    FROM loyalty_cards c JOIN users u ON u.id=c.customer_id JOIN businesses b ON b.id=c.business_id
    WHERE c.business_id=? AND u.active=1 AND u.deleted_at IS NULL AND (c.id=? OR c.qr_token=? OR u.phone=?)`).bind(staff.business_id, value, qrToken, phone).first();
  if (!card) throw new ApiError(404, 'card_not_found', 'No encontramos esa tarjeta.');
  return publicCard(card);
}

async function stamp(request, env, staff) {
  const input = await body(request);
  const card = await env.DB.prepare(`SELECT c.*,u.id AS customer_id,u.name,b.reward_goal,b.timezone,
    (SELECT MAX(created_at) FROM loyalty_events WHERE card_id=c.id AND event_type='stamp' AND voided=0) AS last_stamp_at
    FROM loyalty_cards c JOIN users u ON u.id=c.customer_id JOIN businesses b ON b.id=c.business_id WHERE c.id=? AND c.business_id=? AND u.active=1 AND u.deleted_at IS NULL`).bind(input.cardId, staff.business_id).first();
  if (!card) throw new ApiError(404, 'card_not_found', 'No encontramos esa tarjeta.');
  if (card.stamps >= card.reward_goal) throw new ApiError(409, 'reward_ready', 'La recompensa ya está disponible.');
  const now = new Date();
  const day = businessDay(card.timezone, now);
  if (card.last_stamp_at && businessDay(card.timezone, new Date(card.last_stamp_at)) === day) throw new ApiError(409, 'already_stamped_today', 'Este cliente ya recibió su sello de hoy.');
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO loyalty_events (id,business_id,card_id,customer_id,employee_id,event_type,business_day,created_at) VALUES (?,?,?,?,?,'stamp',?,?)")
        .bind(crypto.randomUUID(), staff.business_id, card.id, card.customer_id, staff.id, day, now.toISOString()),
      env.DB.prepare('UPDATE loyalty_cards SET stamps=stamps+1,updated_at=? WHERE id=? AND stamps < ?')
        .bind(now.toISOString(), card.id, card.reward_goal)
    ]);
  } catch (cause) {
    if (String(cause).includes('UNIQUE')) throw new ApiError(409, 'already_stamped_today', 'Este cliente ya recibió su sello de hoy.');
    throw cause;
  }
  return publicCard(await cardById(env, card.id, staff.business_id));
}

async function cardById(env, cardId, businessId) {
  return env.DB.prepare(`SELECT c.id,c.qr_token,c.stamps,c.redeemed_count,u.id AS customer_id,u.name,u.phone,b.reward_goal,b.reward_name,b.timezone,
    (SELECT MAX(created_at) FROM loyalty_events WHERE card_id=c.id AND event_type='stamp' AND voided=0) AS last_stamp_at
    FROM loyalty_cards c JOIN users u ON u.id=c.customer_id JOIN businesses b ON b.id=c.business_id WHERE c.id=? AND c.business_id=? AND u.active=1 AND u.deleted_at IS NULL`).bind(cardId, businessId).first();
}

async function redeem(request, env, staff) {
  const input = await body(request);
  const card = await cardById(env, input.cardId, staff.business_id);
  if (!card) throw new ApiError(404, 'card_not_found', 'No encontramos esa tarjeta.');
  const now = new Date().toISOString();
  const updated = await env.DB.prepare('UPDATE loyalty_cards SET stamps=0,redeemed_count=redeemed_count+1,updated_at=? WHERE id=? AND business_id=? AND stamps>=? RETURNING id')
    .bind(now, card.id, staff.business_id, card.reward_goal).first();
  if (!updated) throw new ApiError(409, 'reward_unavailable', 'La recompensa todavía no está disponible.');
  await env.DB.prepare("INSERT INTO loyalty_events (id,business_id,card_id,customer_id,employee_id,event_type,business_day,created_at) VALUES (?,?,?,?,?,'redeem',?,?)")
    .bind(crypto.randomUUID(), staff.business_id, card.id, card.customer_id, staff.id, businessDay(card.timezone), now).run();
  return publicCard(await cardById(env, card.id, staff.business_id));
}

function positiveInteger(value, fallback, maximum) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

async function dashboard(request, env, admin) {
  const business = await env.DB.prepare('SELECT * FROM businesses WHERE id=?').bind(admin.business_id).first();
  const today = businessDay(business.timezone);
  const url = new URL(request.url);
  const page = positiveInteger(url.searchParams.get('page'), 1, 100000);
  const perPage = positiveInteger(url.searchParams.get('perPage'), 25, 100);
  const search = String(url.searchParams.get('q') || '').trim().slice(0, 60);
  const offset = (page - 1) * perPage;
  const eventPage = positiveInteger(url.searchParams.get('eventPage'), 1, 100000);
  const eventPerPage = 25;
  const eventOffset = (eventPage - 1) * eventPerPage;
  const customerWhere = search
    ? "u.business_id=? AND u.role='customer' AND u.active=1 AND u.deleted_at IS NULL AND (instr(lower(u.name), lower(?)) > 0 OR instr(u.phone, ?) > 0 OR instr(c.id, ?) > 0)"
    : "u.business_id=? AND u.role='customer' AND u.active=1 AND u.deleted_at IS NULL";
  const customerBindings = search ? [admin.business_id, search, normalizePhone(search), search.toUpperCase()] : [admin.business_id];
  const eventSource = `SELECT id,created_at,event_type,card_id,customer,employee,reason FROM (
      SELECT e.id,e.created_at,CASE WHEN e.voided=1 THEN 'stamp_voided' ELSE e.event_type END AS event_type,e.card_id,customer.name AS customer,employee.name AS employee,'' AS reason
      FROM loyalty_events e JOIN users customer ON customer.id=e.customer_id JOIN users employee ON employee.id=e.employee_id WHERE e.business_id=?
      UNION ALL
      SELECT audit.id,audit.created_at,
        CASE WHEN audit.action='customer_updated' AND audit.metadata='{"kind":"demo_reset"}' THEN 'demo_reset' ELSE audit.action END AS event_type,
        COALESCE(card.id,'') AS card_id,customer.name AS customer,administrator.name AS employee,'' AS reason
      FROM admin_audit_log audit JOIN users customer ON customer.id=audit.target_user_id JOIN users administrator ON administrator.id=audit.admin_id
      LEFT JOIN loyalty_cards card ON card.customer_id=customer.id WHERE audit.business_id=?
      UNION ALL
      SELECT a.id,a.created_at,CASE WHEN a.after_stamps>a.before_stamps THEN 'stamp_added' ELSE 'stamp_removed' END,a.card_id,customer.name,administrator.name,a.reason
      FROM stamp_adjustments a JOIN users customer ON customer.id=a.customer_id JOIN users administrator ON administrator.id=a.admin_id WHERE a.business_id=?
    )`;
  const eventBindings = [admin.business_id, admin.business_id, admin.business_id];
  const [metrics, customerCount, customers, employees, eventCount, events] = await Promise.all([
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM users WHERE business_id=? AND role='customer' AND active=1 AND deleted_at IS NULL) AS customers,
      (SELECT COUNT(*) FROM loyalty_events WHERE business_id=? AND event_type='stamp' AND voided=0 AND business_day=?) AS stamps_today,
      (SELECT COUNT(*) FROM loyalty_cards c JOIN users u ON u.id=c.customer_id WHERE c.business_id=? AND c.stamps>=? AND u.active=1 AND u.deleted_at IS NULL) AS rewards_ready,
      (SELECT COALESCE(SUM(redeemed_count),0) FROM loyalty_cards WHERE business_id=?) AS redeemed`).bind(admin.business_id, admin.business_id, today, admin.business_id, business.reward_goal, admin.business_id).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM users u JOIN loyalty_cards c ON c.customer_id=u.id WHERE ${customerWhere}`).bind(...customerBindings).first(),
    env.DB.prepare(`SELECT u.id AS customer_id,c.id,c.stamps,c.redeemed_count,u.name,u.phone,u.created_at,(SELECT MAX(created_at) FROM loyalty_events WHERE card_id=c.id AND event_type='stamp' AND voided=0) AS last_stamp_at FROM users u JOIN loyalty_cards c ON c.customer_id=u.id WHERE ${customerWhere} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).bind(...customerBindings, perPage, offset).all(),
    env.DB.prepare("SELECT id,name,username,role,active,created_at FROM users WHERE business_id=? AND role IN ('employee','admin') AND deleted_at IS NULL ORDER BY role,name").bind(admin.business_id).all(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM (${eventSource})`).bind(...eventBindings).first(),
    env.DB.prepare(`${eventSource} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...eventBindings, eventPerPage, eventOffset).all()
  ]);
  const total = Number(customerCount.total) || 0;
  return {
    business,
    metrics,
    customers: customers.results,
    customerPage: { page, perPage, total, pages: Math.max(1, Math.ceil(total / perPage)), search },
    eventPage: { page: eventPage, perPage: eventPerPage, total: Number(eventCount.total) || 0, pages: Math.max(1, Math.ceil((Number(eventCount.total) || 0) / eventPerPage)) },
    employees: employees.results,
    events: events.results
  };
}

async function cleanup(env) {
  const now = new Date();
  const staleAttempts = new Date(now.getTime() - 86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now.toISOString()),
    env.DB.prepare('DELETE FROM login_attempts WHERE updated_at < ? AND (blocked_until IS NULL OR blocked_until <= ?)').bind(staleAttempts, now.toISOString())
  ]);
}

async function addEmployee(request, env, admin) {
  const input = await body(request);
  const username = String(input.username || '').trim().toLowerCase();
  const password = String(input.password || '');
  const name = String(input.name || '').trim();
  if (name.length < 2 || !/^[a-z0-9_-]{3,30}$/i.test(username) || password.length < 8) throw new ApiError(400, 'invalid_employee', 'Escribe nombre, usuario válido y contraseña de al menos 8 caracteres.');
  const secret = await hashSecret(password);
  try {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id,business_id,role,name,username,secret_hash,secret_salt) VALUES (?,?,'employee',?,?,?,?)")
      .bind(id, admin.business_id, name, username, secret.hash, secret.salt).run();
    return { id, name, username, role: 'employee', active: 1 };
  } catch (cause) {
    if (String(cause).includes('UNIQUE')) throw new ApiError(409, 'username_exists', 'Ese usuario ya existe.');
    throw cause;
  }
}

async function toggleEmployee(request, env, admin, id) {
  const input = await body(request);
  if (id === admin.id) throw new ApiError(400, 'self_change', 'No puedes desactivar tu propia cuenta.');
  const result = await env.DB.prepare("UPDATE users SET active=?,updated_at=? WHERE id=? AND business_id=? AND role='employee' AND deleted_at IS NULL")
    .bind(input.active ? 1 : 0, new Date().toISOString(), id, admin.business_id).run();
  if (!result.meta.changes) throw new ApiError(404, 'employee_not_found', 'No encontramos ese empleado.');
  if (!input.active) await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
  return { id, active: Boolean(input.active) };
}

async function resetCustomerPin(request, env, admin, customerId) {
  const customer = await env.DB.prepare("SELECT id,name,phone FROM users WHERE id=? AND business_id=? AND role='customer' AND active=1 AND deleted_at IS NULL")
    .bind(customerId, admin.business_id).first();
  if (!customer) throw new ApiError(404, 'customer_not_found', 'No encontramos ese cliente.');
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  const pin = String(100000 + (random[0] % 900000));
  const secret = await hashSecret(pin);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET secret_hash=?,secret_salt=?,secret_iterations=?,must_change_secret=1,updated_at=? WHERE id=? AND business_id=? AND role='customer'")
      .bind(secret.hash, secret.salt, secret.iterations, now, customer.id, admin.business_id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(customer.id),
    env.DB.prepare('DELETE FROM login_attempts WHERE login_key LIKE ?').bind(`${admin.business_id}:customer:${customer.phone}:%`),
    env.DB.prepare("INSERT INTO admin_audit_log (id,business_id,admin_id,target_user_id,action,created_at) VALUES (?,?,?,?, 'pin_reset', ?)")
      .bind(crypto.randomUUID(), admin.business_id, admin.id, customer.id, now)
  ]);
  return { id: customer.id, name: customer.name, phone: customer.phone, temporaryPin: pin };
}

async function resetDemoCustomers(env, admin) {
  const now = new Date().toISOString();
  const statements = [];
  const restored = [];

  for (const demo of DEMO_CUSTOMERS) {
    const secret = await hashSecret(DEMO_PIN);
    const existing = await env.DB.prepare(`SELECT u.id,c.id AS card_id
      FROM users u LEFT JOIN loyalty_cards c ON c.customer_id=u.id
      WHERE u.business_id=? AND u.role='customer' AND u.phone=?`).bind(admin.business_id, demo.phone).first();
    const customerId = existing?.id || crypto.randomUUID();
    const cardId = existing?.card_id || `REN-${randomToken(9).toUpperCase()}`;

    if (existing) {
      statements.push(env.DB.prepare(`UPDATE users SET name=?,active=1,secret_hash=?,secret_salt=?,secret_iterations=?,must_change_secret=0,deleted_at=NULL,updated_at=?
        WHERE id=? AND business_id=? AND role='customer'`)
        .bind(demo.name, secret.hash, secret.salt, secret.iterations, now, customerId, admin.business_id));
      if (existing.card_id) {
        statements.push(env.DB.prepare('UPDATE loyalty_cards SET stamps=?,redeemed_count=0,updated_at=? WHERE id=? AND business_id=?')
          .bind(demo.stamps, now, cardId, admin.business_id));
      } else {
        statements.push(env.DB.prepare('INSERT INTO loyalty_cards (id,business_id,customer_id,qr_token,stamps,redeemed_count,updated_at) VALUES (?,?,?,?,?,0,?)')
          .bind(cardId, admin.business_id, customerId, randomToken(24), demo.stamps, now));
      }
    } else {
      statements.push(
        env.DB.prepare("INSERT INTO users (id,business_id,role,name,phone,secret_hash,secret_salt,secret_iterations,must_change_secret) VALUES (?,?,'customer',?,?,?,?,?,0)")
          .bind(customerId, admin.business_id, demo.name, demo.phone, secret.hash, secret.salt, secret.iterations),
        env.DB.prepare('INSERT INTO loyalty_cards (id,business_id,customer_id,qr_token,stamps,redeemed_count,updated_at) VALUES (?,?,?,?,?,0,?)')
          .bind(cardId, admin.business_id, customerId, randomToken(24), demo.stamps, now)
      );
    }

    statements.push(
      env.DB.prepare('DELETE FROM loyalty_events WHERE business_id=? AND customer_id=?').bind(admin.business_id, customerId),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(customerId),
      env.DB.prepare('DELETE FROM login_attempts WHERE login_key LIKE ?').bind(`${admin.business_id}:customer:${demo.phone}:%`),
      env.DB.prepare("INSERT INTO admin_audit_log (id,business_id,admin_id,target_user_id,action,created_at,metadata) VALUES (?,?,?,?, 'customer_updated', ?, ?)")
        .bind(crypto.randomUUID(), admin.business_id, admin.id, customerId, now, '{"kind":"demo_reset"}')
    );
    restored.push({ id: customerId, cardId, name: demo.name, phone: demo.phone, stamps: demo.stamps });
  }

  await env.DB.batch(statements);
  return { customers: restored, pin: DEMO_PIN };
}


async function adjustCustomerStamps(request, env, admin, customerId) {
  const input = await body(request);
  const reason = String(input.reason || '').trim();
  if (![1, -1].includes(input.delta) || !Number.isInteger(input.expectedStamps) || reason.length < 5 || reason.length > 200 ||
      (input.cancelToday !== undefined && typeof input.cancelToday !== 'boolean') || (input.cancelToday && input.delta !== -1)) {
    throw new ApiError(400, 'invalid_adjustment', 'Elige sumar o quitar un sello y escribe un motivo de 5 a 200 caracteres.');
  }
  const card = await cardForCustomer(env, customerId, admin.business_id);
  if (!card) throw new ApiError(404, 'customer_not_found', 'No encontramos ese cliente.');
  if (card.stamps !== input.expectedStamps) throw new ApiError(409, 'card_changed', 'La tarjeta cambió. Actualízala antes de ajustar los sellos.');
  const after = card.stamps + input.delta;
  if (after < 0 || after > card.reward_goal) throw new ApiError(400, 'invalid_balance', `La tarjeta debe tener entre 0 y ${card.reward_goal} sellos.`);
  const now = new Date();
  let voidEvent = null;
  if (input.cancelToday) {
    voidEvent = await env.DB.prepare("SELECT id FROM loyalty_events WHERE card_id=? AND business_id=? AND event_type='stamp' AND voided=0 AND business_day=?")
      .bind(card.id, admin.business_id, businessDay(card.timezone, now)).first();
    if (!voidEvent) throw new ApiError(409, 'no_visit_today', 'No hay un sello de hoy para anular. Actualiza la tarjeta.');
  }
  try {
    await env.DB.prepare('INSERT INTO stamp_adjustments (id,business_id,card_id,customer_id,admin_id,before_stamps,after_stamps,reason,void_event_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), admin.business_id, card.id, customerId, admin.id, card.stamps, after, reason, voidEvent?.id || null, now.toISOString()).run();
  } catch (cause) {
    if (String(cause).includes('stamp_adjustment_conflict')) throw new ApiError(409, 'card_changed', 'La tarjeta cambió. Actualízala antes de ajustar los sellos.');
    throw cause;
  }
  return publicCard(await cardForCustomer(env, customerId, admin.business_id));
}

async function editCustomer(request, env, admin, customerId) {
  const input = await body(request);
  const name = String(input.name || '').trim();
  const phone = normalizePhone(input.phone);
  if (name.length < 2 || name.length > 60 || phone.length !== 10) throw new ApiError(400, 'invalid_customer', 'Escribe un nombre válido y un celular de 10 dígitos.');
  const customer = await env.DB.prepare("SELECT id,phone FROM users WHERE id=? AND business_id=? AND role='customer' AND active=1 AND deleted_at IS NULL")
    .bind(customerId, admin.business_id).first();
  if (!customer) throw new ApiError(404, 'customer_not_found', 'No encontramos ese cliente.');
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET name=?,phone=?,updated_at=? WHERE id=? AND business_id=? AND role='customer'")
        .bind(name, phone, now, customer.id, admin.business_id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(customer.id),
      env.DB.prepare('DELETE FROM login_attempts WHERE login_key LIKE ? OR login_key LIKE ?')
        .bind(`${admin.business_id}:customer:${customer.phone}:%`, `${admin.business_id}:customer:${phone}:%`),
      env.DB.prepare("INSERT INTO admin_audit_log (id,business_id,admin_id,target_user_id,action,created_at) VALUES (?,?,?,?, 'customer_updated', ?)")
        .bind(crypto.randomUUID(), admin.business_id, admin.id, customer.id, now)
    ]);
  } catch (cause) {
    if (String(cause).includes('UNIQUE')) throw new ApiError(409, 'phone_exists', 'Ese número de celular ya está registrado.');
    throw cause;
  }
  return { id: customer.id, name, phone };
}

async function deleteCustomer(env, admin, customerId) {
  const customer = await env.DB.prepare("SELECT id,phone FROM users WHERE id=? AND business_id=? AND role='customer' AND active=1 AND deleted_at IS NULL")
    .bind(customerId, admin.business_id).first();
  if (!customer) throw new ApiError(404, 'customer_not_found', 'No encontramos ese cliente.');
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET name='Cliente eliminado',phone=NULL,active=0,secret_hash=?,secret_salt=?,must_change_secret=0,deleted_at=?,updated_at=? WHERE id=? AND business_id=? AND role='customer'")
      .bind(randomToken(32), randomToken(16), now, now, customer.id, admin.business_id),
    env.DB.prepare('UPDATE loyalty_cards SET qr_token=?,stamps=0,updated_at=? WHERE customer_id=? AND business_id=?')
      .bind(randomToken(32), now, customer.id, admin.business_id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(customer.id),
    env.DB.prepare('DELETE FROM login_attempts WHERE login_key LIKE ?').bind(`${admin.business_id}:customer:${customer.phone}:%`),
    env.DB.prepare("INSERT INTO admin_audit_log (id,business_id,admin_id,target_user_id,action,created_at) VALUES (?,?,?,?, 'customer_deleted', ?)")
      .bind(crypto.randomUUID(), admin.business_id, admin.id, customer.id, now)
  ]);
  return { id: customer.id, deleted: true };
}

async function editEmployee(request, env, admin, employeeId) {
  const input = await body(request);
  const name = String(input.name || '').trim();
  const username = String(input.username || '').trim().toLowerCase();
  if (name.length < 2 || name.length > 60 || !/^[a-z0-9_-]{3,30}$/i.test(username)) throw new ApiError(400, 'invalid_employee', 'Escribe un nombre y un usuario válido de 3 a 30 caracteres.');
  const employee = await env.DB.prepare("SELECT id,username FROM users WHERE id=? AND business_id=? AND role='employee' AND deleted_at IS NULL")
    .bind(employeeId, admin.business_id).first();
  if (!employee) throw new ApiError(404, 'employee_not_found', 'No encontramos ese empleado.');
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET name=?,username=?,updated_at=? WHERE id=? AND business_id=? AND role='employee'")
        .bind(name, username, now, employee.id, admin.business_id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(employee.id),
      env.DB.prepare('DELETE FROM login_attempts WHERE login_key LIKE ? OR login_key LIKE ?')
        .bind(`${admin.business_id}:staff:${employee.username}:%`, `${admin.business_id}:staff:${username}:%`),
      env.DB.prepare("INSERT INTO admin_audit_log (id,business_id,admin_id,target_user_id,action,created_at) VALUES (?,?,?,?, 'employee_updated', ?)")
        .bind(crypto.randomUUID(), admin.business_id, admin.id, employee.id, now)
    ]);
  } catch (cause) {
    if (String(cause).includes('UNIQUE')) throw new ApiError(409, 'username_exists', 'Ese usuario ya existe.');
    throw cause;
  }
  return { id: employee.id, name, username };
}

async function deleteEmployee(env, admin, employeeId) {
  const employee = await env.DB.prepare("SELECT id,username FROM users WHERE id=? AND business_id=? AND role='employee' AND deleted_at IS NULL")
    .bind(employeeId, admin.business_id).first();
  if (!employee) throw new ApiError(404, 'employee_not_found', 'No encontramos ese empleado.');
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET name='Empleado eliminado',username=NULL,active=0,secret_hash=?,secret_salt=?,must_change_secret=0,deleted_at=?,updated_at=? WHERE id=? AND business_id=? AND role='employee'")
      .bind(randomToken(32), randomToken(16), now, now, employee.id, admin.business_id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(employee.id),
    env.DB.prepare('DELETE FROM login_attempts WHERE login_key LIKE ?').bind(`${admin.business_id}:staff:${employee.username}:%`),
    env.DB.prepare("INSERT INTO admin_audit_log (id,business_id,admin_id,target_user_id,action,created_at) VALUES (?,?,?,?, 'employee_deleted', ?)")
      .bind(crypto.randomUUID(), admin.business_id, admin.id, employee.id, now)
  ]);
  return { id: employee.id, deleted: true };
}

async function changeSecret(request, env, user) {
  const input = await body(request);
  const currentSecret = String(input.currentSecret || '');
  const newSecret = String(input.newSecret || '');
  const account = await env.DB.prepare('SELECT secret_hash,secret_salt,secret_iterations FROM users WHERE id=? AND business_id=? AND active=1')
    .bind(user.id, user.business_id).first();
  if (!account || !(await verifySecret(currentSecret, account.secret_salt, account.secret_hash, account.secret_iterations))) {
    throw new ApiError(401, 'invalid_current_secret', user.role === 'customer' ? 'El PIN actual no es correcto.' : 'La contraseña actual no es correcta.');
  }
  if (user.role === 'customer' && !/^\d{4,8}$/.test(newSecret)) {
    throw new ApiError(400, 'invalid_new_pin', 'El PIN nuevo debe tener entre 4 y 8 dígitos.');
  }
  if (user.role !== 'customer' && newSecret.length < 10) {
    throw new ApiError(400, 'invalid_new_password', 'La contraseña nueva debe tener al menos 10 caracteres.');
  }
  if (currentSecret === newSecret) throw new ApiError(400, 'same_secret', 'Elige un acceso diferente al actual.');
  const next = await hashSecret(newSecret);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET secret_hash=?,secret_salt=?,secret_iterations=?,must_change_secret=0,updated_at=? WHERE id=? AND business_id=?')
      .bind(next.hash, next.salt, next.iterations, new Date().toISOString(), user.id, user.business_id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id<>?').bind(user.id, user.session_id)
  ]);
  return { changed: true };
}

function verifyMutationOrigin(request) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, 'invalid_origin', 'Origen no permitido.');
}

async function api(request, env) {
  verifyMutationOrigin(request);
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === 'GET' && path === '/api/health') {
    await env.DB.prepare('SELECT 1 AS healthy').first();
    return response({ ok: true, service: 'renace-lealtad', database: 'connected', checkedAt: new Date().toISOString() });
  }
  if (request.method === 'POST' && path === '/api/setup') return setup(request, env);
  if (request.method === 'POST' && path === '/api/register') return register(request, env);
  if (request.method === 'POST' && path === '/api/login/customer') return login(request, env, 'customer');
  if (request.method === 'POST' && path === '/api/login/staff') return login(request, env, 'staff');
  if (request.method === 'POST' && path === '/api/logout') {
    const token = cookie(request, 'renace_session');
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();
    return response({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
  }
  if (request.method === 'GET' && path === '/api/me') {
    const user = await requireRole(request, env, ['customer', 'employee', 'admin']);
    return response({ ok: true, user: publicUser(user) });
  }
  if (request.method === 'GET' && path === '/api/card') {
    const user = await requireRole(request, env, ['customer']);
    if (user.must_change_secret) throw new ApiError(403, 'secret_change_required', 'Cambia tu PIN temporal para abrir tu tarjeta.');
    const card = await cardForCustomer(env, user.id, user.business_id);
    return response({ ok: true, card: publicCard(card) });
  }
  if (request.method === 'POST' && path === '/api/account/secret') {
    const user = await requireRole(request, env, ['customer', 'employee', 'admin']);
    return response({ ok: true, ...(await changeSecret(request, env, user)) });
  }
  if (request.method === 'GET' && path === '/api/staff/card') {
    const user = await requireRole(request, env, ['employee', 'admin']);
    return response({ ok: true, card: await lookupCard(request, env, user) });
  }
  if (request.method === 'POST' && path === '/api/staff/stamp') {
    const user = await requireRole(request, env, ['employee', 'admin']);
    return response({ ok: true, card: await stamp(request, env, user) });
  }
  if (request.method === 'POST' && path === '/api/staff/redeem') {
    const user = await requireRole(request, env, ['employee', 'admin']);
    return response({ ok: true, card: await redeem(request, env, user) });
  }
  if (request.method === 'GET' && path === '/api/admin/dashboard') {
    const user = await requireRole(request, env, ['admin']);
    return response({ ok: true, ...(await dashboard(request, env, user)) });
  }
  if (request.method === 'POST' && path === '/api/admin/demo-customers/reset') {
    const user = await requireRole(request, env, ['admin']);
    return response({ ok: true, demo: await resetDemoCustomers(env, user) });
  }
  if (request.method === 'POST' && path === '/api/admin/employees') {
    const user = await requireRole(request, env, ['admin']);
    return response({ ok: true, employee: await addEmployee(request, env, user) }, 201);
  }
  const employeeMatch = path.match(/^\/api\/admin\/employees\/([^/]+)$/);
  if (request.method === 'PATCH' && employeeMatch) {
    const user = await requireRole(request, env, ['admin']);
    return response({ ok: true, employee: await toggleEmployee(request, env, user, employeeMatch[1]) });
  }
  if (request.method === 'PUT' && employeeMatch) {
    const user = await requireRole(request, env, ['admin']);
    return response({ ok: true, employee: await editEmployee(request, env, user, employeeMatch[1]) });
  }
  if (request.method === 'DELETE' && employeeMatch) {
    const user = await requireRole(request, env, ['admin']);
    return response({ ok: true, employee: await deleteEmployee(env, user, employeeMatch[1]) });
  }
  const stampAdjustmentMatch = path.match(/^\/api\/admin\/customers\/([^/]+)\/stamps$/);
  if (request.method === 'POST' && stampAdjustmentMatch) {
    const user = await requireRole(request, env, ['admin']);
    return response({ ok: true, card: await adjustCustomerStamps(request, env, user, stampAdjustmentMatch[1]) });
  }
  const customerPinMatch = path.match(/^\/api\/admin\/customers\/([^/]+)\/pin$/);
  if (request.method === 'PATCH' && customerPinMatch) {
    const user = await requireRole(request, env, ['admin']);
    return response({ ok: true, customer: await resetCustomerPin(request, env, user, customerPinMatch[1]) });
  }
  const customerMatch = path.match(/^\/api\/admin\/customers\/([^/]+)$/);
  if (request.method === 'PUT' && customerMatch) {
    const user = await requireRole(request, env, ['admin']);
    return response({ ok: true, customer: await editCustomer(request, env, user, customerMatch[1]) });
  }
  if (request.method === 'DELETE' && customerMatch) {
    const user = await requireRole(request, env, ['admin']);
    return response({ ok: true, customer: await deleteCustomer(env, user, customerMatch[1]) });
  }
  return error('Ruta no encontrada.', 404, 'not_found');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith('/api/');
    try {
      if (url.hostname === LEGACY_HOST) {
        if (url.pathname === '/renace/service-worker.js') return securityHeaders(legacyServiceWorker(), false);
        const path = url.pathname === '/renace' ? '/' : url.pathname.startsWith('/renace/') ? url.pathname.slice('/renace'.length) : url.pathname;
        return securityHeaders(Response.redirect(`https://${CANONICAL_HOST}${path}${url.search}`, 308), false);
      }
      if (url.hostname === CANONICAL_HOST && (url.pathname === '/renace' || url.pathname.startsWith('/renace/'))) {
        const path = url.pathname.slice('/renace'.length) || '/';
        return securityHeaders(Response.redirect(`https://${CANONICAL_HOST}${path}${url.search}`, 308), false);
      }
      const result = isApi ? await api(request, env) : await env.ASSETS.fetch(request);
      return securityHeaders(result, isApi);
    } catch (cause) {
      if (cause instanceof ApiError) return securityHeaders(error(cause.message, cause.status, cause.code), isApi);
      console.error(cause);
      return securityHeaders(error('Ocurrió un error inesperado.', 500, 'server_error'), isApi);
    }
  },
  async scheduled(_controller, env, context) {
    context.waitUntil(cleanup(env));
  }
};

export const testables = { businessDay, normalizePhone, hashSecret, verifySecret };
