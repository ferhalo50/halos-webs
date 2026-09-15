import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dir = new URL('../public/hermanitos/assets/vendor/', import.meta.url);
await mkdir(dir, { recursive: true });
for (const [source, target] of [['jsqr/dist/jsQR.js', 'jsqr.js'], ['jsqr/LICENSE', 'jsqr.LICENSE.txt'], ['qrcode-generator/qrcode.js', 'qrcode.js']]) {
  await copyFile(require.resolve(source), new URL(target, dir));
}
console.log('QR libraries ready.');
