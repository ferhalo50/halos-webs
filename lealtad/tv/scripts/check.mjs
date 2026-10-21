import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
let count=0;
for(const dir of ['worker','public/assets','public/admin','scripts','test']) {
  for(const name of await readdir(path.join(root,dir))) {
    if(!/\.(?:mjs|js)$/.test(name))continue;
    const result=spawnSync(process.execPath,['--check',path.join(root,dir,name)],{stdio:'inherit',windowsHide:true});
    if(result.status!==0)process.exit(result.status||1);count++;
  }
}
const result=spawnSync(process.execPath,['--check',path.join(root,'public/service-worker.js')],{stdio:'inherit',windowsHide:true});
if(result.status!==0)process.exit(result.status||1);
console.log(`${count+1} JavaScript modules checked.`);
