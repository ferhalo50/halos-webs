const base='http://127.0.0.1:8790';
async function api(path,body,cookie,headers={}){
 const res=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...headers,...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});
 return{status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
const admin={username:'admin_vainilla_local',password:'Vainilla-admin-local928!'},staff={username:'vainilla_staff_local',password:'Vainilla-staff-local928!'};
const setup=await api('/api/setup',{adminUsername:admin.username,adminPassword:admin.password,adminName:'Administración Vainilla local',employeeUsername:staff.username,employeePassword:staff.password,employeeName:'Mostrador Vainilla local'},null,{'x-bootstrap-secret':'local-test-bootstrap'});
if(![201,409].includes(setup.status))throw new Error(JSON.stringify(setup.data));
const login=await api('/api/login/staff',admin);if(login.status!==200)throw new Error('No se pudo iniciar el administrador local.');
for(const flowers of [0,3,8,9]){
 const phone='000009000'+flowers;
 const account=await api('/api/register',{name:`Ramo local ${flowers}`,phone,pin:'4826'});
 if(account.status===409){console.log(`${phone}: cuenta existente conservada`);continue;}
 if(account.status!==201)throw new Error(JSON.stringify(account.data));
 const card=(await api('/api/card',null,account.cookie)).data.card;
 for(let n=0;n<flowers;n++){const operation=await api('/api/admin/customers/'+account.data.user.id+'/stamps',{delta:1,expectedStamps:n,reason:'Preparación ficticia exclusivamente local'},login.cookie);if(operation.status!==200)throw new Error(JSON.stringify(operation.data));}
 console.log(`${phone}: ${flowers}/9 flores${flowers===9?', bebida gratis lista':''} — PIN 4826`);
}
