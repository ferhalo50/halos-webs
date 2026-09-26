import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const sizeGb = Number(process.argv[2]);
const limit = Math.round(sizeGb * 1024 ** 3);
if (!Number.isSafeInteger(limit) || limit <= 0) {
  throw new Error('Uso: node scripts/setup-local-admin.mjs <límite-en-GB>. Ejemplo: 5');
}

const password = randomBytes(18).toString('base64url');
const salt = randomBytes(16);
const digest = pbkdf2Sync(password, salt, 310000, 32, 'sha256');
const lines = [
  'TV_ADMIN_ENABLED=true',
  'TV_ADMIN_LOCAL_HTTP=true',
  'R2_MEDIA_ENABLED=false',
  'TV_ADMIN_USERNAME=renace-tv-admin',
  `TV_ADMIN_PASSWORD_HASH=pbkdf2-sha256:310000:${salt.toString('hex')}:${digest.toString('hex')}`,
  `TV_SESSION_SECRET=${randomBytes(32).toString('base64url')}`,
  `TV_STORAGE_LIMIT_BYTES=${limit}`,
].join('\n') + '\n';
await writeFile(new URL('../.dev.vars', import.meta.url), lines, { flag: 'wx', mode: 0o600 });
console.log('Acceso local creado. .dev.vars no debe subirse a Git.');
console.log('Usuario: renace-tv-admin');
console.log(`Contraseña local generada: ${password}`);
console.log('Guarda la contraseña en un lugar privado; este comando la muestra solo una vez.');
