import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {prepareLocalRewards} from './local-pending-rewards.mjs';

// Copy only the already-installed local schema. No migrations, remote D1 or copied customers.
const root=fileURLToPath(new URL('../',import.meta.url));
const sourceDir=resolve(root,'.dev-final-santofe/v3/d1/miniflare-D1DatabaseObject');
const targetDir=resolve(root,'.dev-final-vainilla/v3/d1/miniflare-D1DatabaseObject');
mkdirSync(targetDir,{recursive:true});
const name=readdirSync(sourceDir).find(n=>n.endsWith('.sqlite')&&n!=='metadata.sqlite');
if(!name)throw new Error('No se encontró el schema local existente. No se ejecutarán migraciones.');
const target=resolve(targetDir,name);
if(!existsSync(target)){
 const source=new DatabaseSync(resolve(sourceDir,name),{readOnly:true});
 const schema=source.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 WHEN 'view' THEN 2 ELSE 3 END").all();
 const db=new DatabaseSync(target);
 try{db.exec('BEGIN');for(const {sql} of schema)db.exec(sql);db.exec('COMMIT');}finally{db.close();source.close();}
}
const db=new DatabaseSync(target);
try{
 db.prepare("INSERT INTO businesses(id,slug,name,reward_goal,reward_name,timezone,active,stamp_policy) VALUES('business_vainillacoffee','vainillacoffee','Vainilla Coffee',9,'Bebida gratis','America/Tijuana',1,'daily') ON CONFLICT(slug) DO NOTHING").run();
 const business=db.prepare("SELECT * FROM businesses WHERE slug='vainillacoffee'").get();
 if(business.id!=='business_vainillacoffee'||business.reward_goal!==9||business.stamp_policy!=='daily')throw new Error('La configuración local existente no coincide con daily/meta 9; prepara una base de prueba local compatible. No se modificará automáticamente.');
 console.log('Vainilla: business_vainillacoffee, daily, meta 9. D1 exclusivamente local.');
}finally{db.close();}
prepareLocalRewards('.dev-final-vainilla');
if(!process.argv.includes('--init-only')){
 const protocol=process.argv.includes('--http')?'http':'https';
 const child=spawn(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),'dev','--local','--host','127.0.0.1','--ip','0.0.0.0','--port','8790','--local-protocol',protocol,'--persist-to','.dev-final-vainilla','--var','DEV_TENANT:vainillacoffee','--var','ALLOW_DEMO:false','--var','BOOTSTRAP_SECRET:local-test-bootstrap'],{cwd:root,stdio:'inherit'});
 child.on('exit',code=>{process.exitCode=code||0;});
 process.on('SIGINT',()=>child.kill('SIGINT'));
}
