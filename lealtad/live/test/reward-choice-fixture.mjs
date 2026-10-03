import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createServer} from 'node:http';
import worker,{testables} from '../worker/index.js';
export const slugs=['renace','mooncoffee','santofe','vainillacoffee'];
export function schema(until='9999'){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync(new URL('../migrations/',import.meta.url)).sort().filter(n=>n<until))db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.exec("INSERT INTO businesses(id,slug,name,reward_goal,reward_name,timezone,stamp_policy) VALUES('business_vainillacoffee','vainillacoffee','Vainilla Coffee',9,'Bebida gratis','America/Tijuana','daily')");
 return db;
}
export function binding(db){return{prepare(sql){let args=[];const s={bind(...v){args=v;return s;},async first(column){const row=db.prepare(sql).get(...args);return column?row?.[column]??null:row??null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(r.changes)}};}};return s;},async batch(statements){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}};}
export const assets={async fetch(request){const path=new URL(request.url).pathname;try{return new Response(readFileSync(new URL('../public'+(path==='/'?'/index.html':path),import.meta.url)),{headers:{'content-type':path==='/'?'text/html':path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.jpg')?'image/jpeg':'image/png'}});}catch{return new Response('',{status:404});}}};
export function env(db,slug){return{DB:binding(db),DEV_TENANT:slug,ASSETS:assets,MAINTENANCE_MODE:'OFF',SESSION_DAYS:'30'};}
export async function invoke(db,slug,path,{body,cookie,method=body?'POST':'GET'}={}){
 const response=await worker.fetch(new Request('http://127.0.0.1'+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined}),env(db,slug));
 return{status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
let serial=0;
export async function fixture(db,slug){
 const password='Fictitious-local-only-4826!',secret=await testables.hashSecret(password),suffix=crypto.randomUUID();
 const roles={};for(const role of ['employee','admin']){const username=role+'_'+suffix;
 db.prepare('INSERT INTO users(id,business_id,role,name,username,secret_hash,secret_salt) VALUES(?,?,?,?,?,?,?)').run(role+'_'+suffix,'business_'+slug,role,'Equipo ficticio '+role,username,secret.hash,secret.salt);
 roles[role]=await invoke(db,slug,'/api/login/staff',{body:{username,password}});}
 const phone=String(7000000000+serial++),customer=await invoke(db,slug,'/api/register',{body:{name:'Cliente ficticio',phone,pin:'4826'}});
 const card=(await invoke(db,slug,'/api/card',{cookie:customer.cookie})).data.card;
 return{slug,phone,customer,staff:roles.employee,admin:roles.admin,card};
}
export async function action(db,f,type,extra={},card=f.card,cookie=f.staff.cookie){
 const result=await invoke(db,f.slug,'/api/staff/'+type,{cookie,body:{cardId:card.id,expectedVersion:card.rewardVersion,operationId:crypto.randomUUID(),...extra}});
 if(result.status===200)f.card=result.data.card;return result;
}
export async function server(db,slug){
 const app=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const result=await worker.fetch(new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})}),env(db,slug));res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch{res.writeHead(500);res.end();}});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));return{app,base:'http://127.0.0.1:'+app.address().port};
}
