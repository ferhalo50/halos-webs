// Usage: node scripts/seed.mjs .private/accounts.json
// Input must remain ignored. Output contains only salted password hashes.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { hashPassword, username } from '../worker/index.js';
import { randomBytes, randomUUID } from 'node:crypto';
const accounts=JSON.parse(await readFile(process.argv[2],'utf8'));
if(accounts.filter(a=>a.role==='admin').length!==1)throw Error('Exactly one admin required.');
const quote=value=>value==null?'NULL':`'${String(value).replaceAll("'","''")}'`;
const rows=[];
for(const account of accounts){
  const secret=await hashPassword(account.password);
  rows.push(`INSERT INTO users(id,name,username,phone,role,password_hash,password_salt,qr_token,created_at) VALUES(${[randomUUID(),account.name,username(account.name),account.phone||null,account.role||'member',secret.hash,secret.salt,randomBytes(32).toString('base64url'),new Date().toISOString()].map(quote).join(',')});`);
}
await mkdir(new URL('../.private/',import.meta.url),{recursive:true});
await writeFile(new URL('../.private/seed.sql',import.meta.url),rows.join('\n')+'\n');
console.log(`Prepared ${rows.length} accounts with salted hashes. No plaintext passwords in SQL.`);
