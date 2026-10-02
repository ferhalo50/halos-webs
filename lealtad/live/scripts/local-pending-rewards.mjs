import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export function prepareLocalRewards(directory){
 if(!['.dev-final-renace','.dev-final-moon','.dev-final-santofe','.dev-final-vainilla'].includes(directory))throw new Error('Solo se permiten las bases ficticias locales conocidas.');
 const dir=resolve(root,directory,'v3/d1/miniflare-D1DatabaseObject');
 const name=readdirSync(dir).find(n=>n.endsWith('.sqlite')&&n!=='metadata.sqlite');
 const db=new DatabaseSync(resolve(dir,name));
 try{
  const columns=db.prepare('PRAGMA table_info(loyalty_cards)').all().map(c=>c.name);
  if(columns.includes('reward_choices_pending'))return;
  const invalid=db.prepare("SELECT COUNT(*) AS n FROM loyalty_cards c JOIN businesses b ON b.id=c.business_id WHERE b.stamp_policy='per_item' AND c.stamps>b.reward_goal").get();
  if(invalid.n)throw new Error('Saldos locales mayores a la meta: requieren revisión explícita antes de convertir.');
  db.exec('BEGIN IMMEDIATE');
  try{
   if(!columns.includes('rewards_pending'))db.exec(readFileSync(resolve(root,'migrations/0013_pending_rewards.sql'),'utf8'));
   db.exec(readFileSync(resolve(root,'migrations/0014_reward_choices.sql'),'utf8'));
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  console.log(directory+': migración aditiva de recompensas aplicada solo al archivo local.');
 }finally{db.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))for(const directory of ['.dev-final-renace','.dev-final-moon','.dev-final-santofe','.dev-final-vainilla'])prepareLocalRewards(directory);
