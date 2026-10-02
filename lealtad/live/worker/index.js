import { TENANTS, resolveTenant } from './tenants.js';
import { tenantAssets } from './tenant-assets.js';
import { activitySource } from './activity.js';
import { recordRewardOperation, recordRewardChoice } from './per-item-rewards.js';
const encoder = new TextEncoder();
const CANONICAL_HOST = 'renacecafe.haloswebs.com';
const LEGACY_HOST = 'app.haloswebs.com';
const HTTPS_HOSTS = new Set(['renacecafe.haloswebs.com', 'mooncoffee.haloswebs.com', 'santofe.haloswebs.com', 'vainillacoffee.haloswebs.com']);
const jsonHeaders = { 'content-type': 'application/json; charset=utf-8' };

function response(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...extraHeaders } });
}

function error(message, status = 400, code = 'bad_request') {
  return response({ ok: false, error: { code, message } }, status);
}

// Missing/OFF preserves existing deployments. Any other value fails closed.
function maintenanceEnabled(env) {
  const mode = String(env.MAINTENANCE_MODE ?? 'OFF').trim().toUpperCase();
  return mode !== 'OFF';
}

function maintenanceResponse() {
  return response({ ok: false, error: { code: 'maintenance', message: 'Estamos realizando una actualización breve. Intenta nuevamente en unos minutos.' } }, 503, { 'retry-after': '300' });
}

function securityHeaders(res, isApi = false, url) {
  const headers = new Headers(res.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(self), geolocation=(), microphone=()');
  headers.set('content-security-policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  headers.set('cache-control', isApi ? 'no-store' : 'public, max-age=300');
  if (url?.protocol === 'https:' && HTTPS_HOSTS.has(url.hostname)) headers.set('strict-transport-security', 'max-age=31536000');
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
  { name: 'Cliente demo · recompensa próxima', phone: '0000000008', stamps: 'goal-minus-one' }
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

async function getBusiness(env, slug = env.TENANT.slug) {
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
    FROM sessions s JOIN users u ON u.id = s.user_id JOIN businesses b ON b.id=u.business_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1 AND u.deleted_at IS NULL AND b.slug=? AND b.active=1
  `).bind(tokenHash, new Date().toISOString(), env.TENANT.slug).first();
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
  const business = await getBusiness(env);
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
  const business = await getBusiness(env);
  const phone = normalizePhone(input.phone);
  const name = String(input.name || '').trim();
  const pin = String(input.pin || '');
  if (name.length < 2 || name.length > 60) throw new ApiError(400, 'invalid_name', 'Escribe un nombre válido.');
  if (!/^\d{10}$/.test(phone)) throw new ApiError(400, 'invalid_phone', 'Escribe un celular de 10 dígitos.');
  if (!/^\d{4,6}$/.test(pin)) throw new ApiError(400, 'invalid_pin', 'El PIN debe tener entre 4 y 6 dígitos.');
  const existing = await env.DB.prepare('SELECT id FROM users WHERE business_id = ? AND phone = ?').bind(business.id, phone).first();
  if (existing) throw new ApiError(409, 'phone_exists', 'Ese celular ya tiene una tarjeta.');
  const customerId = crypto.randomUUID();
  const cardId = `${env.TENANT.cardPrefix}-${randomToken(9).toUpperCase()}`;
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
  return env.DB.prepare(`SELECT c.id, c.customer_id, c.qr_token, c.stamps,c.rewards_pending,c.reward_choices_pending,c.reward_version, COALESCE((SELECT p.stamp_style FROM loyalty_card_preferences p WHERE p.card_id=c.id AND p.business_id=c.business_id),c.stamp_style) AS stamp_style, c.redeemed_count, c.created_at, u.name, u.phone,
    (SELECT MAX(created_at) FROM loyalty_events WHERE card_id = c.id AND event_type = 'stamp' AND voided=0) AS last_stamp_at,
    b.slug AS business_slug,b.reward_goal, b.reward_name, b.timezone,b.stamp_policy
    FROM loyalty_cards c JOIN users u ON u.id = c.customer_id JOIN businesses b ON b.id = c.business_id
    WHERE c.customer_id = ? AND c.business_id = ? AND u.active=1 AND u.deleted_at IS NULL`).bind(customerId, businessId).first();
}


function publicCard(card) {
  const tenant=TENANTS[card.business_slug];
  const stampPolicy=card.stamp_policy||tenant.stampPolicy||'daily';
  const canStampToday=stampPolicy==='per_item'
    ? card.reward_choices_pending===0
    : !card.last_stamp_at||businessDay(card.timezone,new Date(card.last_stamp_at))!==businessDay(card.timezone);
  return { stampStyle: Object.hasOwn(tenant.stampStyles,card.stamp_style) ? card.stamp_style : Object.keys(tenant.stampStyles)[0], customerId: card.customer_id, id: card.id, qrValue: `${card.business_slug}:${card.qr_token}`, name: card.name, phone: card.phone, stamps: card.stamps, goal: card.reward_goal, reward: card.reward_name, redeemed: card.redeemed_count, lastStampAt: card.last_stamp_at, stampPolicy, maxStampsPerTransaction: tenant.maxStampsPerTransaction||1, canStampToday,...(stampPolicy==='per_item'?{rewardsPending:card.rewards_pending,rewardChoicesPending:card.reward_choices_pending,rewardVersion:card.reward_version}:{}) };
}

async function lookupCard(request, env, staff) {
  const url = new URL(request.url);
  const value = String(url.searchParams.get('value') || '').trim();
  if (!value) throw new ApiError(400, 'missing_value', 'Escribe o escanea una tarjeta.');
  const prefix=env.TENANT.slug+':';
  if(value.includes(':')&&!value.startsWith(prefix))throw new ApiError(404,'card_not_found','Esta tarjeta pertenece a otra cafetería.');
  const qrToken = value.startsWith(prefix) ? value.slice(prefix.length) : '';
  const phone = normalizePhone(value);
  const card = await env.DB.prepare(`SELECT c.id,c.qr_token,c.stamps,c.rewards_pending,c.reward_choices_pending,c.reward_version,COALESCE((SELECT p.stamp_style FROM loyalty_card_preferences p WHERE p.card_id=c.id AND p.business_id=c.business_id),c.stamp_style) AS stamp_style,c.redeemed_count,u.id AS customer_id,u.name,u.phone,b.slug AS business_slug,b.reward_goal,b.reward_name,b.timezone,b.stamp_policy,
    (SELECT MAX(created_at) FROM loyalty_events WHERE card_id=c.id AND event_type='stamp' AND voided=0) AS last_stamp_at
    FROM loyalty_cards c JOIN users u ON u.id=c.customer_id JOIN businesses b ON b.id=c.business_id
    WHERE c.business_id=? AND u.active=1 AND u.deleted_at IS NULL AND (c.id=? OR c.qr_token=? OR u.phone=?)`).bind(staff.business_id, value, qrToken, phone).first();
  if (!card) throw new ApiError(404, 'card_not_found', 'No encontramos esa tarjeta.');
  return publicCard(card);
}

async function stamp(request, env, staff) {
  const input = await body(request);
  const card = await env.DB.prepare(`SELECT c.*,u.id AS customer_id,u.name,b.slug AS business_slug,b.reward_goal,b.timezone,b.stamp_policy,
    (SELECT MAX(created_at) FROM loyalty_events WHERE card_id=c.id AND event_type='stamp' AND voided=0) AS last_stamp_at
    FROM loyalty_cards c JOIN users u ON u.id=c.customer_id JOIN businesses b ON b.id=c.business_id WHERE c.id=? AND c.business_id=? AND u.active=1 AND u.deleted_at IS NULL`).bind(input.cardId, staff.business_id).first();
  if (!card) throw new ApiError(404, 'card_not_found', 'No encontramos esa tarjeta.');
  const policy=card.stamp_policy||'daily';
  if(policy==='per_item'&&card.reward_choices_pending>0)throw new ApiError(409,'reward_decision_required','Primero decide qué hacer con tu bebida gratis para continuar.');
  const quantity=Number(input.quantity??1);
  const maxQuantity=TENANTS[card.business_slug].maxStampsPerTransaction||1;
  if(!Number.isInteger(quantity)||quantity<1||quantity>maxQuantity)throw new ApiError(400,'invalid_stamp_quantity',`La cantidad debe estar entre 1 y ${maxQuantity}.`);
  if(policy!=='per_item'&&quantity!==1)throw new ApiError(400,'invalid_stamp_quantity','Esta cafetería registra un sello por visita.');
  if(policy!=='per_item'&&card.stamps>=card.reward_goal)throw new ApiError(409,'reward_ready','La recompensa ya está disponible.');
  const now = new Date();
  const day = businessDay(card.timezone, now);
  if (policy==='daily'&&card.last_stamp_at && businessDay(card.timezone, new Date(card.last_stamp_at)) === day) throw new ApiError(409, 'already_stamped_today', 'Este cliente ya recibió su sello de hoy.');
  let operation={totalCoffees:quantity,paidCoffees:quantity,freeCoffees:0,stampsAfter:card.stamps+quantity};
  try {
    if(policy==='per_item'){
      const total=card.stamps+quantity,rewardsGenerated=Math.floor(total/card.reward_goal);
      operation={totalCoffees:quantity,paidCoffees:quantity,freeCoffees:0,stampsAfter:total%card.reward_goal,rewardsGenerated,rewardsPendingAfter:card.rewards_pending,rewardChoicesPendingAfter:card.reward_choices_pending+rewardsGenerated};
      await recordRewardOperation(env,staff,card,input,'purchase',quantity,day,now.toISOString(),ApiError);
    }else{
      await env.DB.batch([
        env.DB.prepare("INSERT INTO loyalty_events (id,business_id,card_id,customer_id,employee_id,event_type,business_day,created_at,quantity,daily_limited) VALUES (?,?,?,?,?,'stamp',?,?,1,1)")
          .bind(crypto.randomUUID(), staff.business_id, card.id, card.customer_id, staff.id, day, now.toISOString()),
        env.DB.prepare('UPDATE loyalty_cards SET stamps=stamps+1,updated_at=? WHERE id=? AND stamps < ?')
          .bind(now.toISOString(), card.id, card.reward_goal)
      ]);
    }
  } catch (cause) {
    if (String(cause).includes('UNIQUE')) throw new ApiError(409, 'already_stamped_today', 'Este cliente ya recibió su sello de hoy.');
    if (String(cause).includes('purchase_conflict')||String(cause).includes('stamp_conflict')) throw new ApiError(409, 'card_changed', 'La tarjeta cambió. Vuelve a buscarla antes de registrar la compra.');
    throw cause;
  }
  return {card:publicCard(await cardById(env,card.id,staff.business_id)),operation};
}

async function cardById(env, cardId, businessId) {
  return env.DB.prepare(`SELECT c.id,c.qr_token,c.stamps,c.rewards_pending,c.reward_choices_pending,c.reward_version,COALESCE((SELECT p.stamp_style FROM loyalty_card_preferences p WHERE p.card_id=c.id AND p.business_id=c.business_id),c.stamp_style) AS stamp_style,c.redeemed_count,u.id AS customer_id,u.name,u.phone,b.slug AS business_slug,b.reward_goal,b.reward_name,b.timezone,b.stamp_policy,
    (SELECT MAX(created_at) FROM loyalty_events WHERE card_id=c.id AND event_type='stamp' AND voided=0) AS last_stamp_at
    FROM loyalty_cards c JOIN users u ON u.id=c.customer_id JOIN businesses b ON b.id=c.business_id WHERE c.id=? AND c.business_id=? AND u.active=1 AND u.deleted_at IS NULL`).bind(cardId, businessId).first();
}

async function redeem(request, env, staff) {
  const input = await body(request);
  const card = await cardById(env, input.cardId, staff.business_id);
  if (!card) throw new ApiError(404, 'card_not_found', 'No encontramos esa tarjeta.');
  const now = new Date().toISOString();
  if(card.stamp_policy==='per_item'){
    await recordRewardOperation(env,staff,card,input,'redeem',0,businessDay(card.timezone),now,ApiError);
    return publicCard(await cardById(env,card.id,staff.business_id));
  }
  const updated = await env.DB.prepare('UPDATE loyalty_cards SET stamps=0,redeemed_count=redeemed_count+1,updated_at=? WHERE id=? AND business_id=? AND stamps>=? RETURNING id')
    .bind(now, card.id, staff.business_id, card.reward_goal).first();
  if (!updated) throw new ApiError(409, 'reward_unavailable', 'La recompensa todavía no está disponible.');
  await env.DB.prepare("INSERT INTO loyalty_events (id,business_id,card_id,customer_id,employee_id,event_type,business_day,created_at) VALUES (?,?,?,?,?,'redeem',?,?)")
    .bind(crypto.randomUUID(), staff.business_id, card.id, card.customer_id, staff.id, businessDay(card.timezone), now).run();
  return publicCard(await cardById(env, card.id, staff.business_id));
}

async function decideReward(request, env, staff) {
  const input=await body(request);
  const card=await cardById(env,input.cardId,staff.business_id);
  if(!card)throw new ApiError(404,'card_not_found','No encontramos esa tarjeta.');
  const now=new Date();
  await recordRewardChoice(env,staff,card,input,businessDay(card.timezone,now),now.toISOString(),ApiError);
  return publicCard(await cardById(env,card.id,staff.business_id));
}

function validatedName(value) {
  const name=typeof value==='string'?value.trim():'';
  if([...name].length<2||[...name].length>60||!/^\p{L}[\p{L}\p{M} .’'\-]*$/u.test(name))throw new ApiError(400,'invalid_name','Escribe un nombre válido de 2 a 60 caracteres.');
  return name;
}

async function changeOwnName(request,env,user) {
  const input=await body(request);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='name'))throw new ApiError(400,'invalid_profile','Solo puedes cambiar tu nombre desde aquí.');
  const name=validatedName(input.name),now=new Date().toISOString();
  // Audit only an actual change. The check and update share one atomic batch,
  // so repeating the same request cannot produce duplicate rename events.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO admin_audit_log(id,business_id,admin_id,actor_id,target_user_id,action,created_at,metadata)
      SELECT ?,business_id,id,id,id,?,?,? FROM users WHERE id=? AND business_id=? AND role=? AND active=1 AND deleted_at IS NULL AND name<>?`)
      .bind(crypto.randomUUID(),user.role==='customer'?'customer_updated':'employee_updated',now,JSON.stringify({kind:'profile_name_changed'}),user.id,user.business_id,user.role,name),
    env.DB.prepare('UPDATE users SET name=?,updated_at=? WHERE id=? AND business_id=? AND role=? AND active=1 AND deleted_at IS NULL AND name<>?')
      .bind(name,now,user.id,user.business_id,user.role,name)
  ]);
  const updated=await env.DB.prepare('SELECT id,role,name,phone,username,must_change_secret FROM users WHERE id=? AND business_id=? AND active=1 AND deleted_at IS NULL').bind(user.id,user.business_id).first();
  if(!updated)throw new ApiError(403,'forbidden','No tienes permiso para esta acción.');
  return publicUser(updated);
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
  const perPage = positiveInteger(url.searchParams.get('perPage'), 6, 100);
  const search = String(url.searchParams.get('q') || '').trim().slice(0, 60);
  const offset = (page - 1) * perPage;
  const eventPage = positiveInteger(url.searchParams.get('eventPage'), 1, 100000);
  const eventPerPage = positiveInteger(url.searchParams.get('eventPerPage'), 6, 100);
  const eventOffset = (eventPage - 1) * eventPerPage;
  const eventStart = String(url.searchParams.get('eventStart') || '');
  const eventEnd = String(url.searchParams.get('eventEnd') || '');
  const eventCustomer = String(url.searchParams.get('eventCustomer') || '').trim().slice(0, 60);
  const eventType = String(url.searchParams.get('eventType') || '');
  const eventEmployee = String(url.searchParams.get('eventEmployee') || '').trim().slice(0, 60);
  const validEventDate = value => { const date = new Date(value); return value && !Number.isNaN(date.getTime()) ? date.toISOString() : ''; };
  const validEventTypes = new Set(['stamp','redeem','pin_reset','demo_reset','stamp_added','stamp_removed','stamp_voided','customer_updated','customer_deleted','employee_updated','employee_deleted','team_admin_created','team_admin_updated','team_admin_deleted','team_staff_created','profile_name_changed','reward_generated','reward_saved','reward_redeemed_now','saved_reward_redeemed']);
  const customerWhere = search
    ? "u.business_id=? AND u.role='customer' AND u.active=1 AND u.deleted_at IS NULL AND (instr(lower(u.name), lower(?)) > 0 OR instr(u.phone, ?) > 0 OR instr(c.id, ?) > 0)"
    : "u.business_id=? AND u.role='customer' AND u.active=1 AND u.deleted_at IS NULL";
  const customerBindings = search ? [admin.business_id, search, normalizePhone(search), search.toUpperCase()] : [admin.business_id];
  const eventSource = activitySource();
  const eventBindings = [admin.business_id, admin.business_id, admin.business_id, admin.business_id];
  const eventFilters = [];
  const eventStartIso = validEventDate(eventStart), eventEndIso = validEventDate(eventEnd);
  if (eventStartIso) { eventFilters.push('created_at >= ?'); eventBindings.push(eventStartIso); }
  if (eventEndIso) { eventFilters.push('created_at < ?'); eventBindings.push(eventEndIso); }
  if (eventCustomer) { eventFilters.push('instr(lower(customer), lower(?)) > 0'); eventBindings.push(eventCustomer); }
  if (validEventTypes.has(eventType)) { eventFilters.push('event_type = ?'); eventBindings.push(eventType); }
  if (eventEmployee) { eventFilters.push('instr(lower(employee), lower(?)) > 0'); eventBindings.push(eventEmployee); }
  const eventWhere = eventFilters.length ? ` WHERE ${eventFilters.join(' AND ')}` : '';
  const [metrics, customerCount, customers, employees, eventCount, events] = await Promise.all([
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM users WHERE business_id=? AND role='customer' AND active=1 AND deleted_at IS NULL) AS customers,
      (SELECT COALESCE(SUM(quantity),0) FROM loyalty_events WHERE business_id=? AND event_type='stamp' AND voided=0 AND business_day=?) AS stamps_today,
      (SELECT COALESCE(SUM(CASE WHEN '${business.stamp_policy}'='per_item' THEN c.rewards_pending ELSE c.stamps>=? END),0) FROM loyalty_cards c JOIN users u ON u.id=c.customer_id WHERE c.business_id=? AND u.active=1 AND u.deleted_at IS NULL) AS rewards_ready,
      (SELECT COALESCE(SUM(redeemed_count),0) FROM loyalty_cards WHERE business_id=?) AS redeemed`).bind(admin.business_id, admin.business_id, today, business.reward_goal, admin.business_id, admin.business_id).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM users u JOIN loyalty_cards c ON c.customer_id=u.id WHERE ${customerWhere}`).bind(...customerBindings).first(),
    env.DB.prepare(`SELECT u.id AS customer_id,c.id,c.stamps,c.rewards_pending,c.reward_choices_pending,c.reward_version,COALESCE((SELECT p.stamp_style FROM loyalty_card_preferences p WHERE p.card_id=c.id AND p.business_id=c.business_id),c.stamp_style) AS stamp_style,c.redeemed_count,u.name,u.phone,u.created_at,(SELECT MAX(created_at) FROM loyalty_events WHERE card_id=c.id AND event_type='stamp' AND voided=0) AS last_stamp_at FROM users u JOIN loyalty_cards c ON c.customer_id=u.id WHERE ${customerWhere} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).bind(...customerBindings, perPage, offset).all(),
    env.DB.prepare("SELECT id,name,username,role,active,created_at FROM users WHERE business_id=? AND role IN ('employee','admin') AND deleted_at IS NULL ORDER BY role,name").bind(admin.business_id).all(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM (${eventSource})${eventWhere}`).bind(...eventBindings).first(),
    env.DB.prepare(`${eventSource}${eventWhere} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...eventBindings, eventPerPage, eventOffset).all()
  ]);
  const total = Number(customerCount.total) || 0;
  const initialAdminId=await primaryAdminId(env,admin.business_id);
  return {
    business,
    metrics,
    customers: customers.results,
    customerPage: { page, perPage, total, pages: Math.max(1, Math.ceil(total / perPage)), search },
    eventPage: { page: eventPage, perPage: eventPerPage, total: Number(eventCount.total) || 0, pages: Math.max(1, Math.ceil((Number(eventCount.total) || 0) / eventPerPage)), filters: { eventStart: eventStartIso, eventEnd: eventEndIso, eventCustomer, eventType: validEventTypes.has(eventType) ? eventType : '', eventEmployee } },
    employees: employees.results,
    teamPermissions: { primaryAdminId: initialAdminId, canManageAdmins: admin.id===initialAdminId },
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

async function primaryAdminId(env,businessId) {
  // Accounts created from Equipo carry an atomic creation audit and can never
  // inherit this authority. Keep the original identity even if inactive/deleted;
  // changing its name or username does not transfer the permission.
  const original=await env.DB.prepare(`SELECT u.id FROM users u WHERE u.business_id=? AND u.role='admin'
    AND NOT EXISTS (SELECT 1 FROM admin_audit_log a WHERE a.business_id=u.business_id AND a.target_user_id=u.id
      AND json_extract(a.metadata,'$.kind')='team_created' AND json_extract(a.metadata,'$.role')='admin')
    ORDER BY julianday(u.created_at),u.id LIMIT 1`).bind(businessId).first();
  return original?.id??null;
}

async function isPrimaryAdmin(env,admin) {
  return admin.role==='admin'&&admin.id===await primaryAdminId(env,admin.business_id);
}

async function requirePrimaryAdmin(env,admin) {
  if(!await isPrimaryAdmin(env,admin))throw new ApiError(403,'primary_admin_required','Solo el administrador inicial puede gestionar administradores.');
}

async function managedTeamUser(env,admin,id,{protectPrimary=false}={}) {
  const target=await env.DB.prepare("SELECT id,username,role FROM users WHERE id=? AND business_id=? AND role IN ('employee','admin') AND deleted_at IS NULL").bind(id,admin.business_id).first();
  if(!target)throw new ApiError(404,'employee_not_found','No encontramos esa cuenta del equipo.');
  if(target.role==='admin'){
    await requirePrimaryAdmin(env,admin);
    if(protectPrimary&&target.id===admin.id)throw new ApiError(400,'primary_admin_protected','No puedes eliminar ni desactivar al administrador inicial.');
  }
  return target;
}

async function createTeamUser(request, env, admin) {
  const input = await body(request);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['name','username','password','role'].includes(key)))throw new ApiError(400,'invalid_team_user','Solo puedes indicar nombre, usuario, rol y contraseña.');
  const role=input.role===undefined?'employee':input.role;
  if(!['employee','admin'].includes(role))throw new ApiError(400,'invalid_role','Elige Mostrador o Administrador.');
  if(role==='admin')await requirePrimaryAdmin(env,admin);
  const name=validatedName(input.name);
  const username=typeof input.username==='string'?input.username.trim().toLowerCase():'';
  const password=typeof input.password==='string'?input.password:'';
  if(!/^[a-z0-9_-]{3,30}$/.test(username))throw new ApiError(400,'invalid_username','Usa un usuario de 3 a 30 caracteres: letras, números, guion o guion bajo.');
  if(password.length<(role==='admin'?10:8))throw new ApiError(400,'invalid_password',role==='admin'?'La contraseña del administrador debe tener al menos 10 caracteres.':'La contraseña debe tener al menos 8 caracteres.');
  const secret = await hashSecret(password);
  try {
    const id=crypto.randomUUID(),now=new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users(id,business_id,role,name,username,secret_hash,secret_salt,secret_iterations,active,must_change_secret,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,0,?,?)')
        .bind(id,admin.business_id,role,name,username,secret.hash,secret.salt,secret.iterations,now,now),
      env.DB.prepare("INSERT INTO admin_audit_log(id,business_id,admin_id,actor_id,target_user_id,action,created_at,metadata) VALUES(?,?,?,?,?,'employee_updated',?,?)")
        .bind(crypto.randomUUID(),admin.business_id,admin.id,admin.id,id,now,JSON.stringify({kind:'team_created',role}))
    ]);
    return {id,name,username,role,active:1};
  } catch (cause) {
    if (String(cause).includes('UNIQUE')) throw new ApiError(409, 'username_exists', 'Ese usuario ya existe.');
    throw cause;
  }
}

async function toggleEmployee(request, env, admin, id) {
  const input = await body(request);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='active')||typeof input.active!=='boolean')throw new ApiError(400,'invalid_team_user','Solo puedes cambiar el estado de esta cuenta.');
  const target=await managedTeamUser(env,admin,id,{protectPrimary:true});
  if (id === admin.id) throw new ApiError(400, 'self_change', 'No puedes desactivar tu propia cuenta.');
  const now=new Date().toISOString(),statements=[env.DB.prepare('UPDATE users SET active=?,updated_at=? WHERE id=? AND business_id=? AND role=? AND deleted_at IS NULL').bind(input.active?1:0,now,id,admin.business_id,target.role)];
  if(!input.active)statements.push(env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id));
  if(target.role==='admin')statements.push(env.DB.prepare("INSERT INTO admin_audit_log(id,business_id,admin_id,actor_id,target_user_id,action,created_at,metadata) VALUES(?,?,?,?,?,'employee_updated',?,?)").bind(crypto.randomUUID(),admin.business_id,admin.id,admin.id,id,now,JSON.stringify({kind:'team_updated',role:'admin',active:input.active})));
  await env.DB.batch(statements);
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
    env.DB.prepare("INSERT INTO admin_audit_log (id,business_id,admin_id,actor_id,target_user_id,action,created_at) VALUES (?,?,?,?,?, 'pin_reset', ?)")
      .bind(crypto.randomUUID(), admin.business_id, admin.id, admin.id, customer.id, now)
  ]);
  return { id: customer.id, name: customer.name, phone: customer.phone, temporaryPin: pin };
}

async function resetDemoCustomers(env, admin) {
  const now = new Date().toISOString();
  const statements = [];
  const restored = [];

  for (const demo of DEMO_CUSTOMERS) {
    const demoStamps=demo.stamps==='goal-minus-one'?env.TENANT.rewardGoal-1:demo.stamps;
    const demoName=demo.stamps==='goal-minus-one'?`Cliente demo · ${demoStamps} sellos`:demo.name;
    const secret = await hashSecret(DEMO_PIN);
    const existing = await env.DB.prepare(`SELECT u.id,c.id AS card_id
      FROM users u LEFT JOIN loyalty_cards c ON c.customer_id=u.id
      WHERE u.business_id=? AND u.role='customer' AND u.phone=?`).bind(admin.business_id, demo.phone).first();
    const customerId = existing?.id || crypto.randomUUID();
    const cardId = existing?.card_id || `${env.TENANT.cardPrefix}-${randomToken(9).toUpperCase()}`;

    if (existing) {
      statements.push(env.DB.prepare(`UPDATE users SET name=?,active=1,secret_hash=?,secret_salt=?,secret_iterations=?,must_change_secret=0,deleted_at=NULL,updated_at=?
        WHERE id=? AND business_id=? AND role='customer'`)
        .bind(demoName, secret.hash, secret.salt, secret.iterations, now, customerId, admin.business_id));
      if (existing.card_id) {
        statements.push(env.DB.prepare('UPDATE loyalty_cards SET stamps=?,redeemed_count=0,updated_at=? WHERE id=? AND business_id=?')
          .bind(demoStamps, now, cardId, admin.business_id));
      } else {
        statements.push(env.DB.prepare('INSERT INTO loyalty_cards (id,business_id,customer_id,qr_token,stamps,redeemed_count,updated_at) VALUES (?,?,?,?,?,0,?)')
          .bind(cardId, admin.business_id, customerId, randomToken(24), demoStamps, now));
      }
    } else {
      statements.push(
        env.DB.prepare("INSERT INTO users (id,business_id,role,name,phone,secret_hash,secret_salt,secret_iterations,must_change_secret) VALUES (?,?,'customer',?,?,?,?,?,0)")
          .bind(customerId, admin.business_id, demoName, demo.phone, secret.hash, secret.salt, secret.iterations),
        env.DB.prepare('INSERT INTO loyalty_cards (id,business_id,customer_id,qr_token,stamps,redeemed_count,updated_at) VALUES (?,?,?,?,?,0,?)')
          .bind(cardId, admin.business_id, customerId, randomToken(24), demoStamps, now)
      );
    }

    statements.push(
      env.DB.prepare('DELETE FROM loyalty_events WHERE business_id=? AND customer_id=?').bind(admin.business_id, customerId),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(customerId),
      env.DB.prepare('DELETE FROM login_attempts WHERE login_key LIKE ?').bind(`${admin.business_id}:customer:${demo.phone}:%`),
      env.DB.prepare("INSERT INTO admin_audit_log (id,business_id,admin_id,target_user_id,action,created_at,metadata) VALUES (?,?,?,?, 'customer_updated', ?, ?)")
        .bind(crypto.randomUUID(), admin.business_id, admin.id, customerId, now, '{"kind":"demo_reset"}')
    );
    restored.push({ id: customerId, cardId, name: demoName, phone: demo.phone, stamps: demoStamps });
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
  if(card.stamp_policy==='per_item'&&card.reward_choices_pending>0&&input.delta===1)throw new ApiError(409,'reward_decision_required','Primero decide qué hacer con tu bebida gratis para continuar.');
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
    if (String(cause).includes('reward_decision_required')) throw new ApiError(409,'reward_decision_required','Primero decide qué hacer con tu bebida gratis para continuar.');
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
      env.DB.prepare("INSERT INTO admin_audit_log (id,business_id,admin_id,actor_id,target_user_id,action,created_at) VALUES (?,?,?,?,?, 'customer_updated', ?)")
        .bind(crypto.randomUUID(), admin.business_id, admin.id, admin.id, customer.id, now)
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
    env.DB.prepare("INSERT INTO admin_audit_log (id,business_id,admin_id,actor_id,target_user_id,action,created_at) VALUES (?,?,?,?,?, 'customer_deleted', ?)")
      .bind(crypto.randomUUID(), admin.business_id, admin.id, admin.id, customer.id, now)
  ]);
  return { id: customer.id, deleted: true };
}

async function editEmployee(request, env, admin, employeeId) {
  const input = await body(request);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['name','username'].includes(key)))throw new ApiError(400,'invalid_team_user','Solo puedes editar el nombre y usuario de esta cuenta.');
  const name = validatedName(input.name);
  const username = String(input.username || '').trim().toLowerCase();
  if (name.length < 2 || name.length > 60 || !/^[a-z0-9_-]{3,30}$/i.test(username)) throw new ApiError(400, 'invalid_employee', 'Escribe un nombre y un usuario válido de 3 a 30 caracteres.');
  const employee=await managedTeamUser(env,admin,employeeId);
  const now = new Date().toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET name=?,username=?,updated_at=? WHERE id=? AND business_id=? AND role=? AND deleted_at IS NULL')
        .bind(name, username, now, employee.id, admin.business_id,employee.role),
      env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(employee.id),
      env.DB.prepare('DELETE FROM login_attempts WHERE instr(login_key,?)=1 OR instr(login_key,?)=1')
        .bind(`${admin.business_id}:staff:${employee.username}:`, `${admin.business_id}:staff:${username}:`),
      env.DB.prepare("INSERT INTO admin_audit_log (id,business_id,admin_id,actor_id,target_user_id,action,created_at,metadata) VALUES (?,?,?,?,?, 'employee_updated', ?,?)")
        .bind(crypto.randomUUID(),admin.business_id,admin.id,admin.id,employee.id,now,JSON.stringify({kind:'team_updated',role:employee.role}))
    ]);
  } catch (cause) {
    if (String(cause).includes('UNIQUE')) throw new ApiError(409, 'username_exists', 'Ese usuario ya existe.');
    throw cause;
  }
  return { id: employee.id, name, username,role:employee.role };
}

async function deleteEmployee(env, admin, employeeId) {
  const employee=await managedTeamUser(env,admin,employeeId,{protectPrimary:true});
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET name=?,username=NULL,active=0,secret_hash=?,secret_salt=?,must_change_secret=0,deleted_at=?,updated_at=? WHERE id=? AND business_id=? AND role=? AND deleted_at IS NULL')
      .bind(employee.role==='admin'?'Administrador eliminado':'Empleado eliminado',randomToken(32),randomToken(16),now,now,employee.id,admin.business_id,employee.role),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(employee.id),
    env.DB.prepare('DELETE FROM login_attempts WHERE instr(login_key,?)=1').bind(`${admin.business_id}:staff:${employee.username}:`),
    env.DB.prepare("INSERT INTO admin_audit_log (id,business_id,admin_id,actor_id,target_user_id,action,created_at,metadata) VALUES (?,?,?,?,?, 'employee_deleted', ?,?)")
      .bind(crypto.randomUUID(),admin.business_id,admin.id,admin.id,employee.id,now,JSON.stringify({kind:'team_deleted',role:employee.role}))
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
  if (user.role === 'customer' && !/^\d{4,6}$/.test(newSecret)) {
    throw new ApiError(400, 'invalid_new_pin', 'El PIN nuevo debe tener entre 4 y 6 dígitos.');
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
    return response({ ok: true, service: env.TENANT.slug+'-lealtad', database: 'connected', checkedAt: new Date().toISOString() });
  }
  if (request.method === 'POST' && path === '/api/setup') return setup(request, env);
  if (request.method === 'POST' && path === '/api/register') return register(request, env);
  if (request.method === 'POST' && path === '/api/login/customer') return login(request, env, 'customer');
  if (request.method === 'POST' && path === '/api/login/staff') return login(request, env, 'staff');
  if (request.method === 'POST' && path === '/api/logout') {
    const session=await getSession(request,env);
    if(session)await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(session.session_id).run();
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
  if (request.method === 'PATCH' && path === '/api/card/style') {
    const user = await requireRole(request, env, ['customer']);
    if (user.must_change_secret) throw new ApiError(403, 'secret_change_required', 'Cambia tu PIN temporal antes de personalizar tu tarjeta.');
    const input = await body(request);
    if (typeof input.stampStyle!=='string'||!Object.hasOwn(env.TENANT.stampStyles,input.stampStyle)) throw new ApiError(400, 'invalid_stamp_style', 'Elige un diseño de sellos disponible.');
    await env.DB.prepare(`INSERT INTO loyalty_card_preferences(card_id,business_id,stamp_style) SELECT id,business_id,? FROM loyalty_cards WHERE customer_id=? AND business_id=? ON CONFLICT(card_id) DO UPDATE SET stamp_style=excluded.stamp_style`).bind(input.stampStyle,user.id,user.business_id).run();
    return response({ ok: true, stampStyle: input.stampStyle });
  }
  if (request.method === 'PATCH' && path === '/api/account/profile') {
    const user=await requireRole(request,env,['customer','employee','admin']);
    return response({ok:true,user:await changeOwnName(request,env,user)});
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
    return response({ ok: true, ...(await stamp(request, env, user)) });
  }
  if (request.method === 'POST' && path === '/api/staff/reward-choice') {
    const user=await requireRole(request,env,['employee','admin']);
    return response({ok:true,card:await decideReward(request,env,user)});
  }
  if (request.method === 'POST' && path === '/api/staff/redeem') {
    const user = await requireRole(request, env, ['employee', 'admin']);
    return response({ ok: true, card: await redeem(request, env, user) });
  }
  if (request.method === 'GET' && ['/api/admin/export/clients','/api/admin/export/activity'].includes(path)) {
    const user=await requireRole(request,env,['admin']), business=await getBusiness(env);
    const offset=Math.max(0,Number.parseInt(url.searchParams.get('offset')||'0',10)||0);
    const clients=path.endsWith('/clients');
    const query=clients ? `SELECT c.id,u.name,u.phone,c.stamps,c.redeemed_count${business.stamp_policy==='per_item'?',c.rewards_pending,c.reward_choices_pending':''},u.created_at,(SELECT MAX(created_at) FROM loyalty_events WHERE card_id=c.id AND event_type='stamp' AND voided=0) AS last_stamp_at FROM loyalty_cards c JOIN users u ON u.id=c.customer_id WHERE c.business_id=? AND u.business_id=? AND u.role='customer' AND u.active=1 AND u.deleted_at IS NULL ORDER BY u.created_at,u.id LIMIT 500 OFFSET ?` : `${activitySource()} ORDER BY created_at,id LIMIT 500 OFFSET ?`;
    const binds=clients?[user.business_id,user.business_id,offset]:[user.business_id,user.business_id,user.business_id,user.business_id,offset];
    const rows=(await env.DB.prepare(query).bind(...binds).all()).results;
    return response({ok:true,rows,nextOffset:rows.length===500?offset+500:null,business:{name:business.name,slug:business.slug,reward_goal:business.reward_goal,stamp_policy:business.stamp_policy,timezone:business.timezone},generatedAt:new Date().toISOString()});
  }
  const staffPin=path.match(/^\/api\/staff\/customers\/([^/]+)\/pin$/);
  if(request.method==='PATCH'&&staffPin){const user=await requireRole(request,env,['employee','admin']);return response({ok:true,customer:await resetCustomerPin(request,env,user,staffPin[1])});}
  if (request.method === 'GET' && path === '/api/admin/dashboard') {
    const user = await requireRole(request, env, ['admin']);
    return response({ ok: true, ...(await dashboard(request, env, user)) });
  }
  if (request.method === 'POST' && path === '/api/admin/demo-customers/reset') {
    if(!env.TENANT.demo)throw new ApiError(404,'not_found','Ruta no disponible.');
    const user = await requireRole(request, env, ['admin']);
    return response({ ok: true, demo: await resetDemoCustomers(env, user) });
  }
  if (request.method === 'POST' && path === '/api/admin/employees') {
    const user = await requireRole(request, env, ['admin']);
    return response({ ok: true, employee: await createTeamUser(request, env, user) }, 201);
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
    // Redirect approved public hosts before reading configuration, tenant, session or D1.
    // 308 preserves methods/bodies; it cannot protect a request already sent without TLS.
    if (url.protocol === 'http:' && HTTPS_HOSTS.has(url.hostname)) {
      url.protocol = 'https:';
      return securityHeaders(Response.redirect(url.href, 308));
    }
    const isApi = url.pathname.startsWith('/api/');
    // Covers canonical APIs and their legacy aliases before redirects, tenant or D1 access.
    if (maintenanceEnabled(env) && /^\/(?:renace\/)?api(?:\/|$)/.test(url.pathname)) {
      return securityHeaders(maintenanceResponse(), true, url);
    }
    try {
      if (url.hostname === LEGACY_HOST) {
        if (url.pathname === '/renace/service-worker.js') return securityHeaders(legacyServiceWorker(), false, url);
        const path = url.pathname === '/renace' ? '/' : url.pathname.startsWith('/renace/') ? url.pathname.slice('/renace'.length) : url.pathname;
        return securityHeaders(Response.redirect(`https://${CANONICAL_HOST}${path}${url.search}`, 308), false, url);
      }
      if (url.hostname === CANONICAL_HOST && (url.pathname === '/renace' || url.pathname.startsWith('/renace/'))) {
        const path = url.pathname.slice('/renace'.length) || '/';
        return securityHeaders(Response.redirect(`https://${CANONICAL_HOST}${path}${url.search}`, 308), false, url);
      }
      const tenant=resolveTenant(url,env);
      if(!tenant)return securityHeaders(error('Negocio no disponible.',404,'unknown_host'),true,url);
      const tenantEnv={...env,TENANT:tenant};
      const result = isApi ? await api(request, tenantEnv) : await tenantAssets(request,tenantEnv);
      return securityHeaders(result, isApi, url);
    } catch (cause) {
      if (cause instanceof ApiError) return securityHeaders(error(cause.message, cause.status, cause.code), isApi, url);
      console.error(cause);
      return securityHeaders(error('Ocurrió un error inesperado.', 500, 'server_error'), isApi, url);
    }
  },
  async scheduled(_controller, env, context) {
    if (maintenanceEnabled(env)) return;
    context.waitUntil(cleanup(env));
  }
};

export const testables = { businessDay, normalizePhone, hashSecret, verifySecret };
