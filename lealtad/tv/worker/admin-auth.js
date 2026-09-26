const encoder = new TextEncoder();
const COOKIE = 'renace_tv_admin';
const SESSION_MS = 8 * 60 * 60 * 1000;

function bytesFromHex(value) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) return null;
  return Uint8Array.from(value.match(/../g), pair => Number.parseInt(pair, 16));
}

function toBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export function adminConfigured(env) {
  return env.TV_ADMIN_ENABLED === 'true'
    && typeof env.TV_ADMIN_USERNAME === 'string'
    && env.TV_ADMIN_USERNAME.length > 0
    && typeof env.TV_ADMIN_PASSWORD_HASH === 'string'
    && /^pbkdf2-sha256:310000:[0-9a-f]{32}:[0-9a-f]{64}$/i.test(env.TV_ADMIN_PASSWORD_HASH)
    && typeof env.TV_SESSION_SECRET === 'string'
    && env.TV_SESSION_SECRET.length >= 43;
}

export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) return false;
  const [method, roundsText, saltHex, expectedHex] = encoded.split(':');
  if (method !== 'pbkdf2-sha256' || roundsText !== '310000') return false;
  const salt = bytesFromHex(saltHex);
  const expected = bytesFromHex(expectedHex);
  if (!salt || salt.length !== 16 || !expected || expected.length !== 32) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, key, 256));
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= actual[i] ^ expected[i];
  return difference === 0;
}

async function sessionKey(env) {
  return crypto.subtle.importKey('raw', encoder.encode(env.TV_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createSessionCookie(request, env) {
  const payload = toBase64Url(encoder.encode(JSON.stringify({ u: env.TV_ADMIN_USERNAME, exp: Date.now() + SESSION_MS })));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await sessionKey(env), encoder.encode(payload)));
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${payload}.${toBase64Url(signature)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure}`;
}

export async function authenticated(request, env) {
  const cookie = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`));
  if (!cookie) return false;
  const [payload, signature, extra] = cookie.slice(COOKIE.length + 1).split('.');
  if (!payload || !signature || extra || payload.length > 512) return false;
  const signatureBytes = fromBase64Url(signature);
  const payloadBytes = fromBase64Url(payload);
  if (!signatureBytes || signatureBytes.length !== 32 || !payloadBytes) return false;
  const valid = await crypto.subtle.verify('HMAC', await sessionKey(env), signatureBytes, encoder.encode(payload));
  if (!valid) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(payloadBytes));
    return data.u === env.TV_ADMIN_USERNAME && Number.isFinite(data.exp) && data.exp > Date.now() && data.exp <= Date.now() + SESSION_MS;
  } catch {
    return false;
  }
}

export function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function sameOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (origin === null) return false;
  if (origin === new URL(request.url).origin) return true;
  if (env.TV_ADMIN_LOCAL_HTTP !== 'true') return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function safeAdminTransport(request, env) {
  const url = new URL(request.url);
  return url.protocol === 'https:' || (url.protocol === 'http:' && env.TV_ADMIN_LOCAL_HTTP === 'true');
}
