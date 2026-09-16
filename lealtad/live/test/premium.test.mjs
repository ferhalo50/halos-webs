import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base='http://127.0.0.1:8787';
const browserRequest=(page,path,body)=>page.evaluate(async({path,body})=>{
  const res=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  return {status:res.status,data:await res.json()};
},{path,body});
test('customer updates without reload; scanner and admin corrections work',async t=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  t.after(()=>browser.close());
  const customerContext=await browser.newContext({viewport:{width:390,height:844}});
  const staffContext=await browser.newContext({viewport:{width:1180,height:960}});
  const adminContext=await browser.newContext({viewport:{width:1180,height:960}});
  const customer=await customerContext.newPage(),staff=await staffContext.newPage(),admin=await adminContext.newPage();
  const errors=[];for(const page of [customer,staff,admin])page.on('pageerror',e=>errors.push(e.message));
  const phone='661'+String(Date.now()).slice(-7);
  const registration=await customerContext.request.post(base+'/api/register',{data:{name:'Cliente sincronizado',phone,pin:'4826'}});
  assert.equal(registration.status(),201);
  const user=(await registration.json()).user;
  await customer.goto(base+'/renace/#tarjeta');
  await customer.waitForSelector('#qr svg');
  await customer.evaluate(()=>window.testDocumentMarker='same-document');
  assert.match(await customer.locator('[rel="icon"]').getAttribute('href'),/app-icon.svg/);
  await staffContext.request.post(base+'/api/login/staff',{data:{username:'mostrador_local',password:'Staff-test-928!'}});
  await staff.addInitScript(()=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#535d43';ctx.fillRect(0,0,640,480);
      window.testCameraCanvas=canvas;
      window.testCameraStream=canvas.captureStream(5);
      return window.testCameraStream;
    };
  });
  await staff.goto(base+'/renace/#empleado');
  await staff.waitForSelector('#scan');await staff.click('#scan');
  await staff.waitForSelector('.scanner-shell.is-scanning');
  assert.equal(await staff.locator('#video').isVisible(),true);
  if(process.env.RENACE_SCREENSHOTS)await staff.screenshot({path:process.env.RENACE_SCREENSHOTS+'/renace-scanner.png',fullPage:true});
  // Feed the actual customer QR into a camera stream and let the real decoder read it.
  const qr=await customer.locator('#qr svg').evaluate(node=>new XMLSerializer().serializeToString(node));
  await staff.evaluate(async svg=>{
    const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(svg);await image.decode();
    const ctx=window.testCameraCanvas.getContext('2d');
    const draw=()=>{ctx.fillStyle='#fff';ctx.fillRect(0,0,640,480);ctx.drawImage(image,120,40,400,400);window.testCameraStream.getVideoTracks()[0].requestFrame?.();};
    draw();window.testFrames=setInterval(draw,100);
  },qr);
  try{await staff.waitForSelector('#stamp:not([disabled])',{timeout:12000});}catch(error){
    console.log(await staff.evaluate(()=>({hidden:document.hidden,hash:location.hash,scanning:document.querySelector('#scanner-shell')?.className,status:document.querySelector('#scan-status')?.textContent,toast:document.querySelector('#toast')?.textContent,video:document.querySelector('#video')?.readyState,track:window.testCameraStream?.getTracks().map(t=>t.readyState),decoded:(()=>{const c=window.testCameraCanvas,f=c.getContext('2d').getImageData(0,0,640,480);return window.jsQR(f.data,640,480)?.data;})()})));
    throw error;
  }
  assert.equal(await staff.evaluate(()=>window.testCameraStream.getTracks().every(track=>track.readyState==='ended')),true);
  await staff.evaluate(()=>clearInterval(window.testFrames));
  staff.on('dialog',dialog=>dialog.accept());
  await staff.click('#stamp');
  await staff.waitForSelector('#stamp[disabled]');
  await customer.bringToFront();
  await customer.waitForFunction(()=>document.querySelector('.pill')?.textContent.includes('1 / 9'),{},{timeout:12000});
  assert.equal(await customer.evaluate(()=>window.testDocumentMarker),'same-document');
  await adminContext.request.post(base+'/api/login/staff',{data:{username:'admin_local',password:'Admin-test-928!'}});
  await admin.goto(base+'/renace/#admin');await admin.waitForSelector('#customer-search');
  await admin.fill('#customer-search input',phone);
  await Promise.all([admin.waitForResponse(res=>res.url().includes('/api/admin/dashboard?')&&res.url().includes(phone)),admin.click('#customer-search button')]);
  await admin.locator('.adjust-stamps[data-id="'+user.id+'"]').click();
  await admin.selectOption('dialog select','-1');
  await admin.fill('dialog textarea','Compra cancelada en mostrador');
  await admin.check('dialog [name="cancelToday"]');
  if(process.env.RENACE_SCREENSHOTS)await admin.screenshot({path:process.env.RENACE_SCREENSHOTS+'/renace-adjustment.png'});
  await admin.click('dialog [type="submit"]');await admin.waitForSelector('dialog',{state:'detached'});
  await customer.bringToFront();
  await customer.waitForFunction(()=>document.querySelector('.pill')?.textContent.includes('0 / 9'),{},{timeout:12000});
  assert.equal(await customer.evaluate(()=>window.testDocumentMarker),'same-document');
  assert.match(await customer.locator('.reward').last().innerText(),/Hoy puedes/);
  // Reach the reward, then redeem from a separate session; both updates arrive automatically.
  for(let before=0;before<9;before++){
    const result=await browserRequest(admin,'/api/admin/customers/'+user.id+'/stamps',{delta:1,expectedStamps:before,reason:'Preparar recompensa de prueba'});
    assert.equal(result.status,200);
  }
  await customer.waitForFunction(()=>document.querySelector('.pill')?.textContent.includes('9 / 9'),{},{timeout:12000});
  assert.ok(await customer.getByText('¡Café gratis disponible!').count());
  if(process.env.RENACE_SCREENSHOTS)await customer.screenshot({path:process.env.RENACE_SCREENSHOTS+'/renace-customer.png',fullPage:true});
  const card=(await browserRequest(customer,'/api/card')).data.card;
  assert.equal((await browserRequest(staff,'/api/staff/redeem',{cardId:card.id})).status,200);
  await customer.waitForFunction(()=>document.querySelector('.pill')?.textContent.includes('0 / 9'),{},{timeout:12000});
  assert.equal(await customer.evaluate(()=>window.testDocumentMarker),'same-document');
  // Offline retries leave the existing card visible; reconnection catches up.
  await customerContext.setOffline(true);
  await customer.waitForFunction(()=>document.querySelector('#sync-status')?.textContent.includes('Esperando conexión'),{},{timeout:16000});
  assert.equal(await customer.locator('#qr svg').count(),1);
  await customerContext.setOffline(false);
  await customer.waitForFunction(()=>document.querySelector('#sync-status')?.textContent.includes('Tarjeta al día'),{},{timeout:16000});
  await staff.setViewportSize({width:390,height:844});await staff.reload();await staff.waitForSelector('#scan');
  await staff.waitForSelector('#app-loader',{state:'detached'});
  assert.equal(await staff.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.RENACE_SCREENSHOTS)await staff.screenshot({path:process.env.RENACE_SCREENSHOTS+'/renace-staff-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
});
