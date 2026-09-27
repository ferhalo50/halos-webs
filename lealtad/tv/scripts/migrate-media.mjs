import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BUCKET = 'renace-cafe-tv-media';
const DATABASE = 'renace-cafe-tv';
const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(new URL('../public/media.json', import.meta.url)));
const formats = new Map([['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.png','image/png'],['.webp','image/webp'],['.mp4','video/mp4']]);
const entries = [];

function run(args) {
  const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
  const result = spawnSync(process.execPath, [wrangler, ...args], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Wrangler terminó con código ${result.status}`);
  return result.stdout;
}

function sql(value) { return `'${String(value).replaceAll("'", "''")}'`; }

for (const [index, item] of config.items.entries()) {
  if (!['image','video'].includes(item.type)) continue;
  if (!item.source.startsWith('/media/')) throw new Error(`Ruta no local: ${item.source}`);
  const path = fileURLToPath(new URL(`../public${item.source}`, import.meta.url));
  const info = await stat(path);
  const extension = extname(path).toLowerCase();
  const mime = formats.get(extension);
  if (!mime || !info.isFile() || info.size <= 0) throw new Error(`Archivo no válido: ${item.source}`);
  const digest = createHash('sha256').update(await readFile(path)).digest('hex');
  const key = `migrated/${item.id}-${digest.slice(0,12)}${extension === '.jpeg' ? '.jpg' : extension}`;
  entries.push({ id:item.id, name:item.name, type:item.type, path, filename:basename(path), size:info.size, mime, digest, key, order:index+1 });
}

const temporary = await mkdtemp(join(tmpdir(), 'renace-tv-migration-'));
let verified = 0;
try {
  for (const entry of entries) {
    run(['r2','object','put',`${BUCKET}/${entry.key}`,'--file',entry.path,'--content-type',entry.mime,'--remote']);
    const copy = join(temporary, `${entry.id}${extname(entry.path)}`);
    run(['r2','object','get',`${BUCKET}/${entry.key}`,'--file',copy,'--remote']);
    const copyInfo = await stat(copy);
    const copyHash = createHash('sha256').update(await readFile(copy)).digest('hex');
    if (copyInfo.size !== entry.size || copyHash !== entry.digest) throw new Error(`Verificación falló: ${entry.filename}`);
    verified++;
  }

  const statements = entries.map(entry => `INSERT INTO media(id,original_filename,display_name,storage_key,media_type,mime_type,size_bytes,checksum_sha256,active,sort_order) VALUES(${sql(entry.id)},${sql(entry.filename)},${sql(entry.name)},${sql(entry.key)},${sql(entry.type)},${sql(entry.mime)},${entry.size},${sql(entry.digest)},1,${entry.order}) ON CONFLICT(id) DO UPDATE SET original_filename=excluded.original_filename,display_name=excluded.display_name,storage_key=excluded.storage_key,media_type=excluded.media_type,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,checksum_sha256=excluded.checksum_sha256,sort_order=excluded.sort_order,updated_at=CURRENT_TIMESTAMP;`);
  statements.push("UPDATE settings SET used_bytes=(SELECT COALESCE(SUM(size_bytes),0) FROM media),updated_at=CURRENT_TIMESTAMP WHERE id='main';");
  const sqlFile = join(temporary, 'metadata.sql');
  await writeFile(sqlFile, statements.join('\n'));
  run(['d1','execute',DATABASE,'--remote','--file',sqlFile]);

  const images = entries.filter(entry => entry.type === 'image');
  const videos = entries.filter(entry => entry.type === 'video');
  const bytes = entries.reduce((total, entry) => total + entry.size, 0);
  console.log(JSON.stringify({
    images: { expected: images.length, uploaded: images.length, verified: images.length },
    videos: { expected: videos.length, uploaded: videos.length, verified: videos.length },
    localBytes: bytes, r2Bytes: bytes, metadataRows: entries.length, verifiedObjects: verified, errors: 0,
  }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
