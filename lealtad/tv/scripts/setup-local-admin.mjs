import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const lines = [
  'TV_ADMIN_ENABLED=true',
  'R2_MEDIA_ENABLED=true',
  'TV_BOOTSTRAP_ENABLED=true',
  'TV_ADMIN_LOCAL_HTTP=true',
  `TV_BOOTSTRAP_SECRET=${randomBytes(32).toString('base64url')}`,
  'TV_MAX_UPLOAD_BYTES=99614720',
].join('\n') + '\n';

await writeFile(new URL('../.dev.vars', import.meta.url), lines, { flag: 'wx', mode: 0o600 });
console.log('Configuración local creada en .dev.vars (ignorada por Git).');
console.log('Aplica las migraciones locales y levanta el servidor. El primer usuario se crea mediante /admin/api/bootstrap.');
