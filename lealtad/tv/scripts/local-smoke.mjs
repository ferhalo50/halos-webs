import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const origin='http://127.0.0.1:8790';
const vars=Object.fromEntries((await readFile(new URL('../.dev.vars',import.meta.url),'utf8')).split(/\r?\n/).filter(Boolean).map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));
const password=`Local-${randomBytes(12).toString('base64url')}!`;
const nextPassword=`Nuevo-${randomBytes(12).toString('base64url')}!`;
const username=`prueba-${randomBytes(4).toString('hex')}`;
const headers={'content-type':'application/json',origin};

async function response(path,options={}){const result=await fetch(origin+path,options);let data;try{data=await result.clone().json();}catch{data=null;}if(!result.ok)throw new Error(`${path}: ${result.status} ${data?.error||''}`);return {result,data};}
const bootstrap=await response('/admin/api/bootstrap',{method:'POST',headers:{...headers,authorization:`Bearer ${vars.TV_BOOTSTRAP_SECRET}`},body:JSON.stringify({username,displayName:'Administrador temporal',password})});
if(bootstrap.result.status!==201)throw new Error('Bootstrap no creó usuario.');
const login=await response('/admin/api/login',{method:'POST',headers,body:JSON.stringify({username,password})});
let cookie=login.result.headers.get('set-cookie').split(';')[0];

async function upload(path,name){const bytes=await readFile(new URL(path,import.meta.url));const type=name.endsWith('.mp4')?'video/mp4':'image/jpeg';const form=new FormData();form.set('file',new File([bytes],name,{type}));form.set('name',`Prueba ${name}`);return (await response('/admin/api/uploads',{method:'POST',headers:{origin,cookie},body:form})).data.id;}
const imageId=await upload('../public/media/images/renace1.jpg','prueba.jpg');
const videoId=await upload('../public/media/videos/VideoCafe-tv720-v1.mp4','prueba.mp4');
let content=(await response('/admin/api/content',{headers:{cookie}})).data;
if(content.items.length!==2||content.storage.usedBytes<=0)throw new Error('Biblioteca o cuota incorrecta.');
const preview=await fetch(`${origin}/admin/api/media/${imageId}`,{headers:{cookie}});if(preview.status!==200||!preview.headers.get('content-type')?.startsWith('image/'))throw new Error('Vista previa incorrecta.');
await response(`/admin/api/content/${imageId}`,{method:'PATCH',headers:{...headers,cookie},body:JSON.stringify({active:false})});
let playlist=(await response('/playlist.json')).data;if(playlist.items.some(item=>item.id===imageId)||!playlist.items.some(item=>item.id===videoId))throw new Error('Filtro active incorrecto.');
await response(`/admin/api/content/${imageId}`,{method:'PATCH',headers:{...headers,cookie},body:JSON.stringify({active:true})});
await response('/admin/api/reorder',{method:'POST',headers:{...headers,cookie},body:JSON.stringify({ids:[videoId,imageId]})});
playlist=(await response('/playlist.json')).data;if(playlist.items.map(item=>item.id).join(',')!==`${videoId},${imageId}`)throw new Error('Orden incorrecto.');
const range=await fetch(`${origin}/media/item/${videoId}`,{headers:{range:'bytes=0-31'}});if(range.status!==206||(await range.arrayBuffer()).byteLength!==32||!range.headers.get('content-range')?.startsWith('bytes 0-31/'))throw new Error('Range incorrecto.');
await response('/admin/api/password',{method:'POST',headers:{...headers,cookie},body:JSON.stringify({currentPassword:password,newPassword:nextPassword})});
const relogin=await response('/admin/api/login',{method:'POST',headers,body:JSON.stringify({username,password:nextPassword})});cookie=relogin.result.headers.get('set-cookie').split(';')[0];
await response(`/admin/api/content/${imageId}`,{method:'DELETE',headers:{origin,cookie}});
await response(`/admin/api/content/${videoId}`,{method:'DELETE',headers:{origin,cookie}});
content=(await response('/admin/api/content',{headers:{cookie}})).data;if(content.items.length!==0||content.storage.usedBytes!==0)throw new Error('Limpieza o cuota incorrecta.');
await response('/admin/api/logout',{method:'POST',headers:{origin,cookie}});
if((await fetch(`${origin}/admin/api/session`,{headers:{cookie}})).status!==401)throw new Error('Logout no revocó la sesión.');
console.log(JSON.stringify({bootstrap:true,login:true,uploads:2,preview:true,active:true,reorder:true,range206:true,passwordChange:true,delete:2,storageClean:true,logout:true},null,2));
