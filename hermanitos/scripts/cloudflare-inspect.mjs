// Read-only inspection using the existing Wrangler session; never prints credentials.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const config=await readFile('C:/Users/ferha/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8');
const token=config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if(!token)throw Error('No active Wrangler session.');
const account='80aae482f9dccd6087cc9daa93daf275';
async function cf(path){const r=await fetch(`https://api.cloudflare.com/client/v4${path}`,{headers:{Authorization:`Bearer ${token}`}});const d=await r.json();if(!d.success)throw Error(JSON.stringify(d.errors));return d.result;}
const zones=await cf('/zones?name=haloswebs.com');
if(zones.length!==1)throw Error('Zone not unique.');
const zone=zones[0].id;
const [routes,domains,subscriptions]=await Promise.all([cf(`/zones/${zone}/workers/routes`),cf(`/accounts/${account}/workers/domains`),cf(`/accounts/${account}/subscriptions`).catch(()=>null)]);
const renace=await fetch('https://app.haloswebs.com/renace/');
const html=await renace.text();
const record={zone,routes,domains,subscriptions:subscriptions?.map(s=>({id:s.id,product:s.rate_plan?.id,name:s.rate_plan?.public_name}))||'Unavailable with current account permissions',renace:{status:renace.status,sha256:createHash('sha256').update(html).digest('hex')}};
await mkdir(new URL('../.private/',import.meta.url),{recursive:true});
const filename=process.argv[2]==='after'?'infra-after.json':'infra-before.json';
await writeFile(new URL(`../.private/${filename}`,import.meta.url),JSON.stringify(record,null,2));
console.log(JSON.stringify(record,null,2));
