// All commands are pinned to --local, placeholder resources, loopback and
// separate persistence directories. Never reads production credentials/data.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { hashPassword } from '../worker/admin-auth.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const site = process.argv[2], action = process.argv[3] || 'start';
if (!['renace', 'santofe'].includes(site) || !['setup','start'].includes(action)) throw new Error('demo-local.mjs renace|santofe setup|start');
const folder = path.join(root, '.local-tv', site);
await mkdir(folder, { recursive: true });
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(folder,'logs'), WRANGLER_REGISTRY_PATH: path.join(folder,'registry') };
const config = path.join(root,'.build',site,'wrangler.local.jsonc');
const persist = path.join(folder,'state');
async function run(args) {
  await new Promise((resolve,reject) => {
    const child = spawn(process.execPath,args,{cwd:root,env,stdio:'inherit',windowsHide:true});
    child.on('error',reject); child.on('exit',code=>code===0?resolve():reject(new Error(`Local process exit ${code}`)));
  });
}
const wrangler = path.join(root,'node_modules/wrangler/bin/wrangler.js');
if (action === 'setup') {
  await run(['scripts/build-tv.mjs',site]);
  await run([wrangler,'d1','migrations','apply',`${site}-tv-local-only`,'--local','--config',config,'--persist-to',persist]);
  const hash = await hashPassword(`Demo-${site}-TV-2026!`);
  const seed = path.join(folder,'fixture-admin.sql');
  await writeFile(seed,`INSERT OR IGNORE INTO admin_users(id,username,display_name,password_hash) VALUES('demo-${site}','demo_${site}','Administrador ficticio','${hash}');`);
  await run([wrangler,'d1','execute',`${site}-tv-local-only`,'--local','--config',config,'--persist-to',persist,'--file',seed]);
} else {
  await run([wrangler,'dev','--local','--ip','127.0.0.1','--port',site==='renace'?'8791':'8792','--inspector-port',site==='renace'?'9791':'9792','--config',config,'--persist-to',persist]);
}
