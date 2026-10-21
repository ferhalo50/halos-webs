// Deterministic brand build: one player/backend, no copied business data.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const site = process.argv[2];
if (!['renace', 'santofe'].includes(site)) throw new Error('Use build-tv.mjs renace|santofe');
const output = path.join(root, '.build', site);
const assets = path.join(output, 'public');
await mkdir(assets, { recursive: true });
for (const name of ['index.html', 'manifest.webmanifest', 'service-worker.js', 'assets', 'admin']) {
  await cp(path.join(root, 'public', name), path.join(assets, name), { recursive: true });
}
await mkdir(path.join(assets, 'media/images'), { recursive: true });
if (site === 'renace') {
  await cp(path.join(root, 'public/media/images/logo-renace.png'), path.join(assets, 'media/images/logo-renace.png'));
} else {
  const logoRoot = path.join(root, '../live/public/assets/santofe');
  await cp(path.join(logoRoot, 'logo-santofe.png'), path.join(assets, 'media/images/logo-santofe.png'));
  await cp(path.join(logoRoot, 'app-icon-v2.svg'), path.join(assets, 'assets/tv-icon.svg'));
  // Exact, limited brand substitutions. Playback and admin logic remain shared.
  for (const name of ['index.html', 'manifest.webmanifest', 'service-worker.js', 'assets/tv-guide.js', 'admin/panel.html']) {
    let text = await readFile(path.join(assets, name), 'utf8');
    text = text.replaceAll('Renace Café Shop', 'Santofé').replaceAll('Renace Café TV', 'Santofé TV').replaceAll('Renace TV', 'Santofé TV')
      .replaceAll('renace-tv-', 'santofe-tv-').replaceAll('logo-renace.png', 'logo-santofe.png').replaceAll('data-tv-site="renace"', 'data-tv-site="santofe"');
    if (name.endsWith('.html')) text = text.replace('</head>', '<link rel="stylesheet" href="/assets/santofe-tv.css">\n</head>');
    if (name === 'index.html') text = text.replace('width="1073" height="464"', 'width="720" height="720"');
    if (name === 'service-worker.js') text = text.replace("const SHELL = [", "const SHELL = ['/assets/santofe-tv.css',");
    await writeFile(path.join(assets, name), text);
  }
  await cp(path.join(root, 'brands/santofe.css'), path.join(assets, 'assets/santofe-tv.css'));
  const manifest = JSON.parse(await readFile(path.join(assets, 'manifest.webmanifest')));
  manifest.background_color = '#e7ebdc'; manifest.theme_color = '#6f5e62';
  await writeFile(path.join(assets, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
}
// New systems start empty. Never inherit Renace's promotional media/music.
await writeFile(path.join(assets, 'media.json'), JSON.stringify({ version: `${site}-empty`, slideDurationSeconds: 10, music: null, items: [] }, null, 2));
// Local-only configuration. These placeholder resources MUST NOT be deployed.
await writeFile(path.join(output, 'wrangler.local.jsonc'), JSON.stringify({
  name: `${site}-tv-local-only`, main: '../../worker/index.js', compatibility_date: '2026-09-13', workers_dev: false,
  assets: { directory: './public', binding: 'ASSETS', run_worker_first: true },
  vars: { TV_SITE: site, TV_ADMIN_ENABLED: 'true', TV_ADMIN_LOCAL_HTTP: 'true', R2_MEDIA_ENABLED: 'true', TV_BOOTSTRAP_ENABLED: 'false', TV_MAX_UPLOAD_BYTES: '95000000' },
  d1_databases: [{ binding: 'TV_DB', database_name: `${site}-tv-local-only`, database_id: site === 'renace' ? '00000000-0000-4000-8000-000000000001' : '00000000-0000-4000-8000-000000000002', migrations_dir: '../../migrations', remote: false }],
  r2_buckets: [{ binding: 'MEDIA_BUCKET', bucket_name: `${site}-tv-local-only`, remote: false }],
}, null, 2));
console.log(`Local build: ${output}`);
