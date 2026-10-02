import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distribution = resolve(root, 'node_modules/pdfjs-dist');
const { version } = JSON.parse(await readFile(resolve(distribution, 'package.json'), 'utf8'));
if (version !== '6.3.289') throw new Error('Update viewer imports alongside the PDF.js version.');
const vendor = resolve(root, 'public/assets/vendor/pdfjs-' + version);
await mkdir(resolve(vendor, 'standard_fonts'), { recursive: true });
for (const filename of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  await copyFile(resolve(distribution, 'legacy/build', filename), resolve(vendor, filename));
}
await copyFile(resolve(distribution, 'LICENSE'), resolve(vendor, 'LICENSE'));
for (const filename of ['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf', 'LiberationSans-Italic.ttf', 'LiberationSans-BoldItalic.ttf', 'LICENSE_LIBERATION']) {
  await copyFile(resolve(distribution, 'standard_fonts', filename), resolve(vendor, 'standard_fonts', filename));
}
const path = '/assets/docs/Sistema_TV_Promocional_Negocios.pdf';
const bytes = await readFile(resolve(root, 'public' + path));
if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Not a PDF.');
const hash = createHash('sha256').update(bytes).digest('hex');
await writeFile(resolve(root, 'public/assets/document.json'), JSON.stringify({ url: path + '?v=' + hash.slice(0, 12), pages: 4, sha256: hash }, null, 2) + '\n');
console.log('PDF.js ' + version + ' self-hosted; document version ' + hash.slice(0, 12));
