import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const origin='https://renacecafetv.haloswebs.com';
const wrangler=fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url));
const cwd=fileURLToPath(new URL('../',import.meta.url));

function wranglerCommand(args,input){
  const result=spawnSync(process.execPath,[wrangler,...args],{cwd,encoding:'utf8',input,windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error(result.stderr||result.stdout||`Wrangler terminó con código ${result.status}`);
}

function hidden(prompt){
  if(!process.stdin.isTTY)throw new Error('Ejecuta este comando en una terminal interactiva.');
  process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
  return new Promise((resolve,reject)=>{let value='';let done=false;const finish=(error)=>{if(done)return;done=true;process.stdin.setRawMode(false);process.stdin.pause();process.stdin.off('data',onData);process.stdout.write('\n');error?reject(error):resolve(value);};const onData=chunk=>{for(const key of chunk){if(key==='\u0003')return finish(new Error('Operación cancelada.'));if(key==='\r'||key==='\n')return finish();if(key==='\u007f'||key==='\b'){if(value){value=value.slice(0,-1);process.stdout.write('\b \b');}continue;}if(key>=' '){value+=key;process.stdout.write('*');}}};process.stdin.on('data',onData);});
}

async function api(path,options={}){
  const response=await fetch(origin+path,options);let data={};try{data=await response.clone().json();}catch{}
  return {response,data};
}

const password=await hidden('Contraseña definitiva para RenaceTV (12–128 caracteres): ');
const confirmation=await hidden('Confirma la contraseña: ');
if(password!==confirmation)throw new Error('Las contraseñas no coinciden.');
if(password.length<12||password.length>128)throw new Error('La contraseña debe tener entre 12 y 128 caracteres.');

const secret=randomBytes(32).toString('base64url');
console.log('Configurando bootstrap temporal…');
wranglerCommand(['secret','put','TV_BOOTSTRAP_SECRET','--name','renace-cafe-tv'],`${secret}\n`);

const bootstrap=await api('/admin/api/bootstrap',{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:JSON.stringify({username:'RenaceTV',displayName:'Renace Café TV',password})});
if(bootstrap.response.status!==201)throw new Error(`Bootstrap falló (${bootstrap.response.status}): ${bootstrap.data.error||'sin detalle'}`);

const wrong=await api('/admin/api/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username:'RenaceTV',password:'Comprobacion-Incorrecta-2026'})});
if(wrong.response.status!==401)throw new Error('La prueba de contraseña incorrecta no respondió 401.');
const login=await api('/admin/api/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({username:'RenaceTV',password})});
if(login.response.status!==200)throw new Error(`Login falló: ${login.data.error||login.response.status}`);
const cookie=login.response.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('No se recibió cookie de sesión.');
const authHeaders={origin,cookie};
const session=await api('/admin/api/session',{headers:{cookie}});if(session.response.status!==200)throw new Error('Refresh de sesión falló.');
const before=await api('/admin/api/content',{headers:{cookie}});if(before.response.status!==200||before.data.items.length!==17)throw new Error('La biblioteca inicial no contiene 17 elementos.');
const baseline=before.data.storage.usedBytes;
const originalIds=before.data.items.map(item=>item.id);
const preview=await fetch(origin+before.data.items[0].preview,{headers:{cookie}});if(preview.status!==200)throw new Error('La vista previa protegida falló.');

const bytes=await readFile(new URL('../public/media/images/renace1.jpg',import.meta.url));
const form=new FormData();form.set('file',new File([bytes],'SMOKE-TEMPORAL-RENACE.jpg',{type:'image/jpeg'}));form.set('name','SMOKE TEMPORAL — eliminar');
const upload=await api('/admin/api/uploads',{method:'POST',headers:authHeaders,body:form});if(upload.response.status!==201)throw new Error(`Upload temporal falló: ${upload.data.error||upload.response.status}`);
const id=upload.data.id;
try{
  let content=await api('/admin/api/content',{headers:{cookie}});if(content.data.items.length!==18||content.data.storage.usedBytes!==baseline+bytes.length)throw new Error('Cuota después de upload incorrecta.');
  const off=await api(`/admin/api/content/${id}`,{method:'PATCH',headers:{...authHeaders,'content-type':'application/json'},body:JSON.stringify({active:false})});if(off.response.status!==200)throw new Error('Desactivar falló.');
  const on=await api(`/admin/api/content/${id}`,{method:'PATCH',headers:{...authHeaders,'content-type':'application/json'},body:JSON.stringify({active:true})});if(on.response.status!==200)throw new Error('Activar falló.');
  content=await api('/admin/api/content',{headers:{cookie}});const ids=content.data.items.map(item=>item.id);const moved=[id,...ids.filter(value=>value!==id)];
  const reorder=await api('/admin/api/reorder',{method:'POST',headers:{...authHeaders,'content-type':'application/json'},body:JSON.stringify({ids:moved})});if(reorder.response.status!==200)throw new Error('Reordenar falló.');
  const restoreOrder=await api('/admin/api/reorder',{method:'POST',headers:{...authHeaders,'content-type':'application/json'},body:JSON.stringify({ids:[...originalIds,id]})});if(restoreOrder.response.status!==200)throw new Error('Restaurar el orden original falló.');
}finally{
  const removed=await api(`/admin/api/content/${id}`,{method:'DELETE',headers:authHeaders});if(removed.response.status!==200)throw new Error(`No se pudo limpiar el archivo temporal: ${removed.data.error||removed.response.status}`);
}
const after=await api('/admin/api/content',{headers:{cookie}});if(after.data.items.length!==17||after.data.storage.usedBytes!==baseline)throw new Error('La limpieza no restauró biblioteca y cuota.');
const logout=await api('/admin/api/logout',{method:'POST',headers:authHeaders});if(logout.response.status!==200)throw new Error('Logout falló.');
if((await api('/admin/api/session',{headers:{cookie}})).response.status!==401)throw new Error('La sesión no quedó revocada.');

password.replaceAll(/./g,'');confirmation.replaceAll(/./g,'');
console.log(JSON.stringify({adminCreated:true,wrongPassword401:true,login:true,sessionRefresh:true,libraryBefore:17,preview:true,temporaryUpload:true,activeToggle:true,reorder:true,temporaryDelete:true,libraryAfter:17,storageRestored:baseline,logout:true},null,2));
