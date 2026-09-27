const encoder = new TextEncoder();
const COOKIE = 'renace_tv_session';
const SESSION_SECONDS = 8 * 60 * 60;
const PBKDF2_ROUNDS = 310000;
const RATE_WINDOW_SECONDS = 15 * 60;
const RATE_BLOCK_SECONDS = 15 * 60;
const RATE_MAX_FAILURES = 5;

function hex(bytes) {
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

function bytesFromHex(value) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value || '')) return null;
  return Uint8Array.from(value.match(/../g), pair => Number.parseInt(pair, 16));
}

function randomToken(bytes = 32) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(value) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

export function normalizeUsername(value) {
  const normalized = typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : '';
  return /^[a-z0-9._-]{3,64}$/.test(normalized) ? normalized : null;
}

export async function hashPassword(password, salt = randomToken(16)) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');
  const saltBytes = bytesFromHex(salt);
  if (!saltBytes || saltBytes.length !== 16) throw new Error('Salt no válido.');
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const digest = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ROUNDS, hash: 'SHA-256' }, key, 256));
  return `pbkdf2-sha256:${PBKDF2_ROUNDS}:${salt}:${hex(digest)}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || typeof encoded !== 'string') return false;
  const [method, rounds, salt, expectedHex] = encoded.split(':');
  if (method !== 'pbkdf2-sha256' || Number(rounds) !== PBKDF2_ROUNDS) return false;
  const expected = bytesFromHex(expectedHex);
  if (!expected || expected.length !== 32) return false;
  let actual;
  try { actual = bytesFromHex((await hashPassword(password, salt)).split(':')[3]); } catch { return false; }
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ actual[index];
  return difference === 0;
}

export function authConfigured(env) {
  return env.TV_DB && env.TV_ADMIN_ENABLED === 'true';
}

export function safeAdminTransport(request, env) {
  const url = new URL(request.url);
  return url.protocol === 'https:' || (url.protocol === 'http:' && env.TV_ADMIN_LOCAL_HTTP === 'true');
}

export function sameOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  if (origin === new URL(request.url).origin) return true;
  if (env.TV_ADMIN_LOCAL_HTTP !== 'true') return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

function cookieValue(request) {
  const part = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`));
  return part ? part.slice(COOKIE.length + 1) : null;
}

function cookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(request) {
  return cookie(request, '', 0);
}

export async function createSession(request, env, userId) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  const userAgent = (request.headers.get('user-agent') || '').slice(0, 180);
  await env.TV_DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,user_agent) VALUES(?,?,?,?)').bind(tokenHash, userId, expiresAt, userAgent).run();
  return { tokenHash, setCookie: cookie(request, token, SESSION_SECONDS) };
}

export async function authenticate(request, env) {
  const token = cookieValue(request);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const row = await env.TV_DB.prepare(`SELECT s.token_hash,s.user_id,u.username,u.display_name
    FROM sessions s JOIN admin_users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND datetime(s.expires_at)>CURRENT_TIMESTAMP AND u.active=1`).bind(tokenHash).first();
  return row ? { ...row, tokenHash } : null;
}

export async function revokeSession(env, tokenHash) {
  if (tokenHash) await env.TV_DB.prepare('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=? AND revoked_at IS NULL').bind(tokenHash).run();
}

export async function revokeUserSessions(env, userId) {
  await env.TV_DB.prepare('UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL').bind(userId).run();
}

async function rateKey(request, username) {
  const address = request.headers.get('cf-connecting-ip') || 'local';
  return sha256(`${address}|${username || 'invalid'}`);
}

export async function checkRateLimit(request, env, username) {
  const key = await rateKey(request, username);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.TV_DB.prepare('SELECT failures,window_started_at,blocked_until FROM login_limits WHERE rate_key=?').bind(key).first();
  if (row?.blocked_until && row.blocked_until > now) return { allowed: false, key, retryAfter: row.blocked_until - now };
  if (!row || now - row.window_started_at >= RATE_WINDOW_SECONDS) {
    await env.TV_DB.prepare('INSERT INTO login_limits(rate_key,failures,window_started_at,blocked_until) VALUES(?,0,?,NULL) ON CONFLICT(rate_key) DO UPDATE SET failures=0,window_started_at=excluded.window_started_at,blocked_until=NULL').bind(key, now).run();
  }
  return { allowed: true, key, retryAfter: 0 };
}

export async function recordLoginFailure(env, key) {
  const now = Math.floor(Date.now() / 1000);
  await env.TV_DB.prepare(`UPDATE login_limits SET failures=failures+1,
    blocked_until=CASE WHEN failures+1>=? THEN ? ELSE blocked_until END WHERE rate_key=?`).bind(RATE_MAX_FAILURES, now + RATE_BLOCK_SECONDS, key).run();
}

export async function clearLoginFailures(env, key) {
  await env.TV_DB.prepare('DELETE FROM login_limits WHERE rate_key=?').bind(key).run();
}

export const ratePolicy = Object.freeze({ maxFailures: RATE_MAX_FAILURES, windowSeconds: RATE_WINDOW_SECONDS, blockSeconds: RATE_BLOCK_SECONDS });
