'use strict';
const $ = s => document.querySelector(s);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const esc = escapeHtml;
const icons = {
  card:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
  scan:'<path d="M8 3H4a1 1 0 0 0-1 1v4m13-5h4a1 1 0 0 1 1 1v4M3 16v4a1 1 0 0 0 1 1h4m8 0h4a1 1 0 0 0 1-1v-4M4 12h16"/>',
  qr:'<path d="M3 3h6v6H3zm12 0h6v6h-6zM3 15h6v6H3zm12 0h2v2h-2zm4 4h2v2h-2zM15 19v2m6-6h-2"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  history:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  gift:'<path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3Zm0 0h4a3 3 0 1 0-3-3Z"/>',
  shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.heart}</svg>`;
const state = { data:null, tab:'card', auth:'login', history:null, admin:null, adminTab:'users', busy:false, stream:null, scanId:0, serverOffset:0, config:{}, musicPlaying:false };
const fmtDate = value => value ? new Intl.DateTimeFormat('es-MX', {timeZone:'America/Tijuana',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : '—';
const fmtMonth = key => new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${key}-15T12:00:00Z`));
const initials = name => esc(String(name || 'H').slice(0,1).toUpperCase());
const avatar = name => `<span class="avatar" aria-hidden="true">${initials(name)}</span>`;
const empty = text => `<div class="empty">${esc(text)}</div>`;
async function api(path, data, method) {
  const options = { credentials:'same-origin', method:method || (data !== undefined ? 'POST' : 'GET'), headers:{} };
  if (data !== undefined) { options.headers['content-type']='application/json'; options.body=JSON.stringify(data); }
  let response;
  try { response=await fetch(`/api${path}`,options); }
  catch { throw Error('No hay conexión. Tus cambios guardados siguen a salvo; vuelve a intentar.'); }
  let payload;
  try { payload=await response.json(); } catch { throw Error('La aplicación no está disponible en este momento. Vuelve a intentar.'); }
  if (!response.ok) { const error = new Error(payload.error || 'No pudimos completar la acción.'); error.status=response.status; error.code=payload.code; throw error; }
  return payload;
}
let toastTimer;
function toast(message, bad=false) {
  const el=$('#toast'); clearTimeout(toastTimer); el.textContent=message; el.classList.toggle('bad',bad); el.hidden=false;
  toastTimer=setTimeout(()=>{el.hidden=true;},5500);
}
function formError(message) { const el=$('#form-error'); if(el){el.textContent=message;el.hidden=false;}else toast(message,true); }
function closeModal(){stopCamera();$('#modal').close();}
function modal(title, content) { stopCamera(); $('#modal-title').textContent=title; $('#modal-body').innerHTML=content; if(!$('#modal').open)$('#modal').showModal(); }
function errorBox(){return '<div id="form-error" class="error" role="alert" hidden></div>';}
async function action(task, success, button) {
  if(button)button.disabled=true;
  try{await task();closeModal();if(success)toast(success);await refresh();}
  catch(e){formError(e.message);}
  finally{if(button?.isConnected)button.disabled=false;}
}
function confirmAction(title, description, task, success, danger=false) {
  modal(title,`<p class="help">${esc(description)}</p>${errorBox()}<div class="modal-actions"><button class="button secondary" id="cancel-confirm">Cancelar</button><button class="button ${danger?'danger':''}" id="do-confirm">${danger?'Confirmar limpieza':'Confirmar'}</button></div>`);
  $('#cancel-confirm').onclick=closeModal;
  $('#do-confirm').onclick=e=>action(task,success,e.currentTarget);
}
function renderAuth() {
  $('#account-button').hidden=true;$('#logout-button').hidden=true;
  const signup=state.auth==='signup';
  $('#main').innerHTML=`<div class="login-layout"><section class="intro"><p class="eyebrow">EL VALOR DE ESTAR PARA EL OTRO</p><h1>Ser hermanos.<br><em>Hacer equipo.</em></h1><p class="lead">Los pequeños favores cuentan. Ayuda, suma sellitos y celebra a los hermanos que siempre están.</p><div class="mini-card" aria-hidden="true"><p>HERMANITOS CARD</p><span class="serif">Hoy por ti, mañana por mí.</span><div class="mini-stamps">${'<span></span>'.repeat(10)}</div></div></section><section class="auth-panel"><div class="auth-switch" aria-label="Acceso"><button data-auth="login" class="${signup?'':'active'}">Iniciar sesión</button><button data-auth="signup" class="${signup?'active':''}">Unirme a los hermanos</button></div><h2>${signup?'Un lugar para ti.':'Qué bueno verte.'}</h2><p class="help">${signup?'Crea tu cuenta y empieza a hermanear.':'Tu tarjeta, tus hermanos y todo lo que han compartido.'}</p><form id="auth-form"><div class="field"><label for="auth-name">Tu nombre</label><input id="auth-name" name="name" autocomplete="username" placeholder="Cómo te llaman tus hermanos" minlength="2" maxlength="40" required></div>${signup?'<div class="field"><label for="auth-phone">Número de teléfono</label><input id="auth-phone" name="phone" type="tel" autocomplete="tel" placeholder="10 dígitos" required></div>':''}<div class="field"><label for="auth-password">Contraseña</label><input id="auth-password" name="password" type="password" autocomplete="${signup?'new-password':'current-password'}" minlength="${signup?6:3}" maxlength="128" placeholder="${signup?'Al menos 6 caracteres':'Tu contraseña'}" required></div>${errorBox()}<button class="button wide" type="submit">${signup?'Crear mi Hermanitos Card':'Entrar a hermanear'} ${icon('arrow')}</button></form><p class="auth-foot">Apoyarnos es de hermanos.<br>Aprovecharnos del otro, no.</p></section></div>`;
  document.querySelectorAll('[data-auth]').forEach(b=>b.onclick=()=>{state.auth=b.dataset.auth;renderAuth();});
  $('#auth-form').onsubmit=async e=>{
    e.preventDefault();const button=e.submitter;button.disabled=true;
    try{await api(signup?'/signup':'/login',Object.fromEntries(new FormData(e.target)));state.tab='card';tryMusic();await refresh();}
    catch(error){formError(error.message);button.disabled=false;}
  };
}
function navButton(key,label,ico,extra='') { return `<button data-tab="${key}" class="${state.tab===key?'active':''}" aria-current="${state.tab===key?'page':'false'}">${icon(ico)}${label}${extra}</button>`; }
function renderShell(content) {
  const u=state.data.user;
  $('#account-button').hidden=false;$('#logout-button').hidden=false;$('#account-button').innerHTML=icon('user');
  const isAdmin=u.role==='admin';
  $('#main').innerHTML=`<div class="app-shell"><div class="page-heading"><div><p class="eyebrow">${isAdmin?'ADMINISTRACIÓN':'TU ESPACIO ENTRE HERMANOS'}</p><h1>${isAdmin?'Todo en su lugar.':`Hola, ${esc(u.name)}<span class="serif">.</span>`}</h1><p class="date-label">${isAdmin?'El cuidado también está en los detalles.':fmtMonth(state.data.stats.month)}</p></div><span class="monogram" aria-hidden="true">H</span></div>${isAdmin?'':`<nav class="nav" aria-label="Principal">${navButton('card','Mi tarjeta','card')}${navButton('favors','Favores','heart')}${navButton('history','Historial','history')}${navButton('notifications','Avisos','bell',state.data.unread?`<span class="badge">${state.data.unread}</span>`:'')}</nav>`}<div id="view">${content}</div></div>`;
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>changeTab(b.dataset.tab));
}
function gauge(stats) {
  const ratio=stats.completed+stats.owed ? stats.completed/(stats.completed+stats.owed) : .5;
  const angle=Math.PI*(1-ratio),x=150+85*Math.cos(angle),y=140-85*Math.sin(angle);
  return `<svg class="gauge" viewBox="0 0 300 170" role="img" aria-label="Tu medidor: ${stats.owed} favores pendientes y ${stats.completed} cumplidos este mes"><path class="track red-track" d="M40 140 A110 110 0 0 1 150 30"/><path class="track green-track" d="M150 30 A110 110 0 0 1 260 140"/><path class="ticks" d="M38 111l18 5M53 82l15 10M81 51l9 17M112 35l5 18M150 30v19M188 35l-5 18M219 51l-9 17M247 82l-15 10M262 111l-18 5"/><line class="needle" x1="150" y1="140" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}"/><circle class="hub" cx="150" cy="140" r="9"/></svg>`;
}
function cardView() {
  const d=state.data,s=d.stats;
  const notice=s.owed?`<div class="notice">${icon('bell')}<div><strong>Debes ${s.owed} favor${s.owed===1?'':'es'} mayor${s.owed===1?'':'es'}.</strong><p>Toca cumplir, hermanito. Estos favores ya se ganaron y no se pueden negar.</p></div></div>`:`<div class="notice good">${icon('check')}<div><strong>No debes favores.</strong><p>${s.completed?'Gracias por ser un hermano que cumple.':'Buen momento para echarle la mano a alguien.'}</p></div></div>`;
  return `${notice}<div class="dashboard-grid"><div><section class="panel loyalty-card"><div class="card-top"><div><h2>Hermanitos Card</h2><p class="help">${esc(d.user.name)}</p></div><span class="membership">DE HERMANO<br>A HERMANO</span></div><div class="stamps" role="img" aria-label="${s.progress} de 10 sellitos en tu tarjeta">${Array.from({length:10},(_,i)=>`<span class="stamp ${i<s.progress?'filled':''} ${i===9?'reward':''}">${i<s.progress?'H':i===9?icon('gift'):i+1}</span>`).join('')}</div><div class="card-bottom"><div class="progress-number">${s.progress}<span> / 10 sellitos</span></div><p class="help">10 pequeños favores.<br>Un favor mayor.</p></div></section><div class="card-actions"><button class="button" id="scan-button">${icon('scan')} Escanear QR</button><button class="button secondary" id="qr-button">${icon('qr')} Mi QR</button></div><p class="scan-note" id="cooldown-note">Un sellito por favor. Un minuto entre escaneos.</p></div><section class="panel meter-panel"><div class="panel-heading"><h2>Mi brújula de hermano</h2><span class="pill">Este mes</span></div>${gauge(s)}<div class="meter-numbers"><div class="red-state"><strong>${s.owed}</strong><span>Favores que debo</span></div><div class="green-state"><strong>${s.completed}</strong><span>Favores que cumplí</span></div></div><p class="meter-caption">${s.owed>s.completed?'Tu aguja pide apoyo. Cumple un favor y acércala al verde.':s.completed?'Vas dejando huella. Sigue siendo ese hermano que apoya.':'Cada favor cumplido mueve tu aguja hacia el verde.'}</p><p class="help section-gap">Lo cumplido empieza de cero cada mes.<br>Lo pendiente sigue contigo hasta cumplirlo.</p></section></div><div class="credit-box"><div class="credit-count">${s.credits}</div><div><h3>Favor${s.credits===1?'':'es'} mayor${s.credits===1?'':'es'} disponible${s.credits===1?'':'s'}</h3><p class="help">${s.credits?'Te lo ganaste. Elige a un hermano y pide su apoyo.':`Faltan ${10-s.progress} sellitos para ganar ${s.spent?'otro':'tu primer'} favor mayor.`}</p></div><button class="button secondary" id="request-button" ${!s.credits?'disabled':''}>Pedir un favor ${icon('arrow')}</button></div>`;
}
function favorRow(f, mode='member') {
  const mine=f.creditor_id===state.data.user.id, pending=f.status==='pending', complete=f.status==='completed';
  const statuses={pending:'Pendiente',completed:'Cumplido',cleared:'Limpiado por el administrador',cancelled:'Anulado por el administrador'};
  const title=mode==='admin'?`${esc(f.debtor_name)} → ${esc(f.creditor_name)}`:mine?`${esc(f.debtor_name)} ${pending?'te debe un favor':'te cumplió un favor'}`:`${pending?'Debes un favor a':'Cumpliste un favor a'} ${esc(f.creditor_name)}`;
  const cleanTitle=(!pending&&!complete&&mode!=='admin')?`${esc(f.debtor_name)} → ${esc(f.creditor_name)}`:title;
  return `<article class="row ${pending?'red-state':complete?'green-state':''}">${avatar(mine?f.debtor_name:f.creditor_name)}<div class="row-content"><h3>${cleanTitle}</h3><p>${esc(statuses[f.status])} · Solicitado ${fmtDate(f.created_at)}</p>${f.closed_at?`<p>${complete?'Cumplido':'Cerrado'} ${fmtDate(f.closed_at)}</p>`:''}</div>${pending&&mine&&mode==='member'?`<button class="button green small" data-complete="${esc(f.id)}">${icon('check')} Sí me cumplió</button>`:''}${mode==='admin'&&f.status!=='cancelled'?`<div class="row-actions">${pending?`<button class="button secondary small" data-edit-favor="${esc(f.id)}">Editar</button>`:''}<button class="button danger small" data-delete-favor="${esc(f.id)}">Anular</button></div>`:''}</article>`;
}
function favorsView() {
  const d=state.data,owed=d.favors.filter(f=>f.debtor_id===d.user.id&&f.status==='pending'),receivable=d.favors.filter(f=>f.creditor_id===d.user.id&&f.status==='pending');
  return `<div class="section-title"><div><h2>Los favores se cumplen.</h2><p class="help">Quien recibe el favor confirma que quedó cumplido.</p></div><button class="button small" id="request-button" ${!d.stats.credits?'disabled':''}>Pedir favor (${d.stats.credits})</button></div><div class="two-cols"><section><div class="section-title"><h3>Yo debo · ${d.stats.owed}</h3></div><div class="list">${owed.map(f=>favorRow(f)).join('')||empty('No debes favores. Vas muy bien, hermanito.')}</div></section><section><div class="section-title"><h3>Me deben · ${d.stats.owing_to_me}</h3></div><div class="list">${receivable.map(f=>favorRow(f)).join('')||empty('Ningún favor pendiente por recibir.')}</div></section></div><section class="section-gap"><div class="section-title"><h2>Últimos favores cerrados</h2><span class="help">Más detalles en Historial</span></div><div class="list">${d.favors.filter(f=>f.status!=='pending').slice(0,15).map(f=>favorRow(f)).join('')||empty('Aquí aparecerán los favores que vayan quedando resueltos.')}</div></section>`;
}
const notificationText=n=>{
  const actor=n.actor_name||'Un hermano';
  return ({stamp:`${actor} escaneó tu QR y recibió un sellito.`,favor_requested:`${actor} te pidió un favor mayor. Te toca cumplir.`,favor_completed:`${actor} confirmó que cumpliste su favor. ¡Buen hermano!`,'clear-completed':'El administrador reinició tu contador de cumplidos. El historial se conserva.','clear-pending':'El administrador limpió tus favores pendientes.','admin-cleared':'El administrador limpió un favor que te debían.','delete-stamp':'El administrador anuló uno de tus sellitos.','delete-favor':'El administrador anuló un favor mayor.','favor-assigned':'El administrador te asignó un favor pendiente.','favor-reassigned':'El administrador reasignó un favor que tenías pendiente.'})[n.kind]||'Tu cuenta recibió una actualización.';
};
function notificationsView(){return `<div class="section-title"><div><h2>Entre hermanos</h2><p class="help">Los últimos 30 avisos de tu cuenta.</p></div><button class="button secondary small" id="read-notifications" ${!state.data.unread?'disabled':''}>Marcar leídos</button></div><div class="list">${state.data.notifications.map(n=>`<article class="row">${avatar(n.actor_name)}<div class="row-content"><h3>${esc(notificationText(n))}</h3><p>${fmtDate(n.created_at)}</p></div>${!n.read_at?'<span class="pill">Nuevo</span>':''}</article>`).join('')||empty('Aquí sabrás cuando escaneen tu QR o haya novedades en tus favores.')}</div>`;}
function stampRow(s,adminMode=false){return `<article class="row">${avatar(s.scanner_name)}<div class="row-content"><h3>${esc(s.scanner_name)} recibió un sellito de ${esc(s.target_name)}</h3><p>${fmtDate(s.created_at)}${s.voided_at?' · Anulado':''}</p></div>${adminMode&&!s.voided_at?`<div class="row-actions"><button class="button secondary small" data-edit-stamp="${esc(s.id)}">Editar</button><button class="button danger small" data-delete-stamp="${esc(s.id)}">Anular</button></div>`:''}</article>`;}
function historyView(){
  const h=state.history;
  if(!h)return empty('Cargando tu historial…');
  return `<div class="filter-row"><div><h2>Tu historia de hermano</h2><p class="help">Cada mes cuenta, aunque la brújula comience de nuevo.</p></div><div><label for="history-month">Consultar mes</label><input type="month" id="history-month" value="${esc(h.month)}" min="${esc(state.data.user.created_at.slice(0,7))}" max="${state.data.stats.month}"></div></div><div class="summary-grid"><div class="stat-box green-state"><strong>${h.summary.completed}</strong><span>Favores que cumpliste</span></div><div class="stat-box red-state"><strong>${h.summary.pending_at_end}</strong><span>${h.current?'Favores que aún debes':'Debías al cerrar el mes'}</span></div><div class="stat-box"><strong>${h.summary.stamps}</strong><span>Sellitos que ganaste</span></div></div><section class="history-section"><h2>Favores mayores</h2><div class="list">${h.favors.map(f=>favorRow(f)).join('')||empty('No hubo movimientos de favores mayores este mes.')}</div></section><section class="history-section"><h2>Sellitos de hermano</h2><div class="list">${h.stamps.map(s=>stampRow(s)).join('')||empty('No hubo sellitos este mes.')}</div></section>${h.stamps.length>=200||h.favors.length>=200?'<p class="help">Se muestran los últimos 200 movimientos de cada tipo del mes. Los contadores incluyen todos.</p>':''}`;
}
function renderMember(){
  const views={card:cardView,favors:favorsView,notifications:notificationsView,history:historyView};
  renderShell((views[state.tab]||cardView)());
  $('#scan-button')?.addEventListener('click',openScanner);$('#qr-button')?.addEventListener('click',showQR);$('#request-button')?.addEventListener('click',requestFavor);
  document.querySelectorAll('[data-complete]').forEach(b=>b.onclick=()=>{const id=b.dataset.complete;confirmAction('¿Ya te cumplió?', 'Confirma solo si recibiste el favor. Se descontará de lo que te deben y contará como cumplido para tu hermano.',()=>api(`/favors/${id}/complete`,{}),'Favor cumplido. ¡Así se hermanea!');});
  $('#read-notifications')?.addEventListener('click',e=>action(()=>api('/notifications/read',{through_id:state.data.notifications[0]?.id||0}),'Avisos marcados como leídos.',e.currentTarget));
  $('#history-month')?.addEventListener('change',async e=>{try{state.history=await api(`/history?month=${encodeURIComponent(e.target.value)}`);renderMember();}catch(error){toast(error.message,true);}});
  updateCooldown();
}
async function changeTab(tab){
  state.tab=tab;renderMember();
  if(tab==='history'){try{state.history=await api(`/history?month=${state.history?.month||state.data.stats.month}`);if(state.tab==='history')renderMember();}catch(e){toast(e.message,true);}}
}
function updateCooldown(){
  if(!state.data?.stats)return;
  const seconds=Math.max(0,Math.ceil((state.data.stats.cooldown_until-(Date.now()+state.serverOffset))/1000));
  const button=$('#scan-button'),note=$('#cooldown-note');
  if(button)button.disabled=seconds>0;
  if(note)note.textContent=seconds?`Tu siguiente sellito en ${seconds}s. Gracias por ese favor.`:'Un sellito por favor. Un minuto entre escaneos.';
}
function showQR(){
  modal('Mi QR de hermano',`<p class="qr-name">${esc(state.data.user.name)}</p><div id="qr-image" class="qr-wrap"></div><p class="help qr-caption">Muéstralo al hermano que te hizo el favor.<br>Él escanea, él gana un sellito.</p><p class="help qr-caption">Tu QR es personal. Compártelo cuando corresponda un favor.</p>`);
  const qr=qrcode(0,'M');qr.addData(state.data.qr);qr.make();$('#qr-image').innerHTML=qr.createImgTag(7,4,'QR personal de Hermanitos Card');
}
function stopCamera(){state.scanId++;if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;}}
async function openScanner(){
  modal('Un favor, un sellito.',`<div class="camera"><video id="camera" playsinline muted autoplay></video></div><p class="scan-status" id="scan-status">Abriendo la cámara…</p>${errorBox()}<p class="help qr-caption">Escanea el QR del hermano al que acabas de ayudar.</p>`);
  const current=state.scanId;
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Este navegador no permite abrir la cámara. Usa Safari o Chrome con una conexión segura.');
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:960},height:{ideal:960}},audio:false});
    if(current!==state.scanId){stream.getTracks().forEach(t=>t.stop());return;}
    state.stream=stream;const video=$('#camera');video.srcObject=stream;await video.play();$('#scan-status').textContent='Coloca el QR dentro del recuadro.';
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
    let lastRead=0;
    const tick=async time=>{
      if(current!==state.scanId||!$('#modal').open)return;
      if(video.readyState>=2&&time-lastRead>180){
        lastRead=time;const factor=Math.min(1,640/video.videoWidth);canvas.width=video.videoWidth*factor;canvas.height=video.videoHeight*factor;
        context.drawImage(video,0,0,canvas.width,canvas.height);
        const data=context.getImageData(0,0,canvas.width,canvas.height),result=jsQR(data.data,data.width,data.height,{inversionAttempts:'attemptBoth'});
        if(result?.data){
          stopCamera();$('#scan-status').textContent='Registrando tu sellito…';
          const payload={qr:result.data,request_id:crypto.randomUUID()};
          const submitScan=async()=>{
            try{const saved=await api('/scan',payload);closeModal();toast(saved.duplicate?'Este sellito ya estaba guardado.':`¡Sellito ganado! Ayudaste a ${saved.target}.`);await refresh();}
            catch(e){if(e.code==='scan_cooldown')await refresh();formError(e.message);const area=$('#scan-status');if(area){area.innerHTML='<button class="button secondary" id="retry-scan">Volver a intentar</button>';$('#retry-scan').onclick=()=>{if(e.status)openScanner();else submitScan();};}}
          };
          await submitScan();return;
        }
      }
      requestAnimationFrame(tick);
    };requestAnimationFrame(tick);
  }catch(e){if(current===state.scanId){stopCamera();formError(e.name==='NotAllowedError'?'Permite el acceso a la cámara en tu navegador y vuelve a abrir el escáner.':e.name==='NotFoundError'?'No encontramos una cámara en este dispositivo.':e.message);$('#scan-status').textContent='No se registró ningún sellito.';}}
}
function requestFavor(){
  const d=state.data;if(!d.stats.credits)return;
  modal('Te ganaste un favor mayor.',`<p class="help form-info">Usarás 1 de tus ${d.stats.credits} favores disponibles. Tu hermano recibirá el aviso y tú confirmarás cuando te cumpla.</p><form id="favor-form"><div class="field"><label for="debtor">¿A qué hermano le pides apoyo?</label><select id="debtor" name="debtor_id" required><option value="">Elige a un hermano</option>${d.siblings.map(u=>`<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}</select></div>${errorBox()}<button class="button wide" type="submit" ${!d.siblings.length?'disabled':''}>Pedir mi favor ${icon('heart')}</button></form>`);
  const requestId=crypto.randomUUID();$('#favor-form').onsubmit=e=>{e.preventDefault();action(()=>api('/favors',{debtor_id:$('#debtor').value,request_id:requestId}),'Tu hermano ya tiene un favor pendiente contigo.',e.submitter);};
}
function account(){
  modal('Mi cuenta',`<p class="help form-info">${esc(state.data.user.name)}${state.data.user.phone?` · ${esc(state.data.user.phone)}`:''}</p><form id="password-form"><div class="field"><label for="current-password">Contraseña actual</label><input type="password" id="current-password" name="current" autocomplete="current-password" required></div><div class="field"><label for="new-password">Nueva contraseña</label><input type="password" id="new-password" name="password" autocomplete="new-password" minlength="${state.data.user.role==='admin'?8:6}" maxlength="128" required></div>${errorBox()}<button class="button wide" type="submit">Guardar contraseña</button><p class="help qr-caption">Se cerrarán tus sesiones en otros dispositivos.</p></form>`);
  $('#password-form').onsubmit=e=>{e.preventDefault();action(()=>api('/password',Object.fromEntries(new FormData(e.target))),'Contraseña actualizada.',e.submitter);};
}
const auditLabels={'signup':'Cuenta creada','stamp':'Sellito registrado','favor_requested':'Favor mayor solicitado','favor-completed':'Favor mayor cumplido','password-changed':'Contraseña actualizada','clear-completed':'Contador de cumplidos limpiado','clear-pending':'Favores pendientes limpiados','delete-user':'Cuenta eliminada','edit-user':'Cuenta editada','delete-stamp':'Sellito anulado','edit-stamp':'Sellito editado','delete-favor':'Favor anulado','edit-favor':'Favor editado'};
function renderAdmin(){
  const a=state.admin;if(!a){renderShell(empty('Cargando el control de Hermanitos…'));return;}
  const tabs=[['users','Hermanos'],['stamps','Sellitos'],['favors','Favores mayores'],['audit','Registro de control']];
  let content='';
  if(state.adminTab==='users')content=`<div class="admin-list">${a.users.filter(u=>u.role==='member').map(u=>`<article class="panel admin-member"><div><h2>${esc(u.name)}</h2><p class="admin-user-meta">${esc(u.phone||'Sin teléfono')} · ${u.deleted_at?'Eliminado':u.active?'Activo':'Pausado'}</p><div class="member-stats"><span>${u.stats.stamps} sellitos</span><span>${u.stats.credits} disponibles</span><span>${u.stats.owed} pendientes</span><span>${u.stats.completed} cumplidos</span></div></div>${avatar(u.name)}<div class="row-actions">${!u.deleted_at?`<button class="button secondary small" data-edit-user="${esc(u.id)}">Editar</button><button class="button danger small" data-delete-user="${esc(u.id)}">Eliminar cuenta</button>`:''}<button class="button secondary small" data-clear="clear-completed" data-user="${esc(u.id)}">Limpiar cumplidos</button><button class="button danger small" data-clear="clear-pending" data-user="${esc(u.id)}">Limpiar pendientes</button></div></article>`).join('')}</div>`;
  if(state.adminTab==='stamps')content=`<p class="help form-info">Anular sellitos reduce el saldo ganado. Los favores ya solicitados se conservan; cualquier saldo insuficiente se compensa con futuros sellitos.</p><div class="list">${a.stamps.map(s=>stampRow(s,true)).join('')||empty('Todavía no hay sellitos.')}</div>`;
  if(state.adminTab==='favors')content=`<p class="help form-info">Anular un favor devuelve su crédito al hermano que lo pidió. Limpiar pendientes desde una cuenta cierra sus deudas sin devolver créditos.</p><div class="list">${a.favors.map(f=>favorRow(f,'admin')).join('')||empty('Todavía no hay favores mayores.')}</div>`;
  if(state.adminTab==='audit')content=`<div class="list">${a.audit.map(log=>`<article class="row"><div class="row-content"><h3>${esc(auditLabels[log.action]||log.action)}</h3><p>${esc(log.actor_name||'Sistema')} · ${fmtDate(log.created_at)}</p><details class="audit-detail"><summary>Ver detalle del ajuste</summary><pre class="audit-detail">${esc(JSON.stringify(JSON.parse(log.details),null,2))}</pre></details></div></article>`).join('')||empty('Sin movimientos registrados.')}</div>`;
  renderShell(`<div class="subnav">${tabs.map(([key,label])=>`<button data-admin-tab="${key}" class="${state.adminTab===key?'active':''}">${label}</button>`).join('')}<button id="admin-refresh">Actualizar</button></div>${content}${state.adminTab!=='users'?`<div class="modal-actions"><button class="button secondary" id="admin-prev" ${a.offset===0?'disabled':''}>Anteriores</button><span class="help">Página ${Math.floor(a.offset/50)+1}</span><button class="button secondary" id="admin-next" ${!a.has_more?'disabled':''}>Siguientes</button></div>`:''}`);
  $('#admin-refresh').onclick=()=>refresh();
  document.querySelectorAll('[data-admin-tab]').forEach(b=>b.onclick=()=>{state.adminTab=b.dataset.adminTab;renderAdmin();});
  $('#admin-prev')?.addEventListener('click',()=>adminPage(Math.max(0,a.offset-50)));$('#admin-next')?.addEventListener('click',()=>adminPage(a.offset+50));
  document.querySelectorAll('[data-edit-user]').forEach(b=>b.onclick=()=>editUser(a.users.find(u=>u.id===b.dataset.editUser)));
  document.querySelectorAll('[data-delete-user]').forEach(b=>b.onclick=()=>{const u=a.users.find(u=>u.id===b.dataset.deleteUser);confirmAction('Eliminar cuenta',`${u.name} ya no podrá iniciar sesión ni usar su QR. Sus movimientos y deudas permanecerán en el historial.`,()=>api(`/admin/users/${u.id}`,undefined,'DELETE'),'Cuenta eliminada.',true);});
  document.querySelectorAll('[data-clear]').forEach(b=>b.onclick=()=>{const u=a.users.find(u=>u.id===b.dataset.user),pending=b.dataset.clear==='clear-pending';confirmAction(pending?'Limpiar favores pendientes':'Limpiar favores cumplidos',pending?`Cerrarás todas las deudas pendientes de ${u.name}. No contarán como favores cumplidos. El ajuste quedará registrado.`:`El contador verde de ${u.name} volverá a 0. Los favores cumplidos seguirán visibles en su historial mensual.`,()=>api(`/admin/users/${u.id}/${b.dataset.clear}`,{confirm:true}),'Limpieza registrada.',true);});
  document.querySelectorAll('[data-edit-stamp]').forEach(b=>b.onclick=()=>editStamp(a.stamps.find(s=>s.id===b.dataset.editStamp)));
  document.querySelectorAll('[data-delete-stamp]').forEach(b=>b.onclick=()=>confirmAction('Anular sellito','Se descontará del saldo de su hermano y el ajuste quedará en el registro.',()=>api(`/admin/stamps/${b.dataset.deleteStamp}`,undefined,'DELETE'),'Sellito anulado.',true));
  document.querySelectorAll('[data-edit-favor]').forEach(b=>b.onclick=()=>editFavor(a.favors.find(f=>f.id===b.dataset.editFavor)));
  document.querySelectorAll('[data-delete-favor]').forEach(b=>b.onclick=()=>confirmAction('Anular favor mayor','Se cerrará el favor y se devolverá el crédito a quien lo pidió. El historial conservará el ajuste.',()=>api(`/admin/favors/${b.dataset.deleteFavor}`,undefined,'DELETE'),'Favor anulado.',true));
}
async function adminPage(offset){try{state.admin=await api(`/admin?offset=${offset}`);renderAdmin();}catch(e){toast(e.message,true);}}
function editUser(u){
  modal(`Editar a ${u.name}`,`<form id="edit-user-form"><div class="field"><label for="member-name">Nombre de acceso</label><input id="member-name" name="name" value="${esc(u.name)}" maxlength="40" required></div><div class="field"><label for="member-phone">Teléfono</label><input id="member-phone" name="phone" type="tel" value="${esc(u.phone||'')}"></div><div class="field"><label for="member-password">Nueva contraseña (opcional)</label><input id="member-password" name="password" type="password" autocomplete="new-password" minlength="3" maxlength="128" placeholder="Déjala vacía para conservar la actual"></div><label class="check-label"><input type="checkbox" name="active" ${u.active?'checked':''}> Cuenta activa</label>${errorBox()}<div class="modal-actions"><button class="button" type="submit">Guardar cambios</button></div></form>`);
  $('#edit-user-form').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.active=e.target.elements.active.checked;action(()=>api(`/admin/users/${u.id}`,data,'PATCH'),'Cuenta actualizada.',e.submitter);};
}
function memberOptions(selected,exclude){return state.admin.users.filter(u=>u.role==='member'&&u.active&&!u.deleted_at&&u.id!==exclude).map(u=>`<option value="${esc(u.id)}" ${u.id===selected?'selected':''}>${esc(u.name)}</option>`).join('');}
function editStamp(s){
  modal('Editar sellito',`<form id="edit-stamp-form"><p class="help form-info">Sellito de ${esc(s.scanner_name)}. La corrección quedará en el registro.</p><div class="field"><label for="stamp-target">Hermano cuyo QR fue escaneado</label><select id="stamp-target" name="target_id">${memberOptions(s.target_id,s.scanner_id)}</select></div><div class="field"><label for="stamp-date">Fecha y hora (UTC)</label><input id="stamp-date" type="datetime-local" step="1" name="created_at" value="${esc(s.created_at.slice(0,19))}" required></div>${errorBox()}<button class="button wide" type="submit">Guardar corrección</button></form>`);
  $('#edit-stamp-form').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));data.created_at=new Date(data.created_at+'Z').toISOString();action(()=>api(`/admin/stamps/${s.id}`,data,'PATCH'),'Sellito corregido.',e.submitter);};
}
function editFavor(f){
  modal('Editar favor pendiente',`<form id="edit-favor-form"><p class="help form-info">${esc(f.creditor_name)} recibirá este favor.</p><div class="field"><label for="favor-debtor">Hermano que debe cumplirlo</label><select id="favor-debtor" name="debtor_id">${memberOptions(f.debtor_id,f.creditor_id)}</select></div>${errorBox()}<button class="button wide" type="submit">Guardar corrección</button></form>`);
  $('#edit-favor-form').onsubmit=e=>{e.preventDefault();action(()=>api(`/admin/favors/${f.id}`,Object.fromEntries(new FormData(e.target)),'PATCH'),'Favor corregido.',e.submitter);};
}
async function refresh(silent=false){
  if(state.busy)return;state.busy=true;
  try{
    const data=await api('/me');state.data=data;
    if(data.server_time)state.serverOffset=data.server_time-Date.now();
    if(data.user.role==='admin'){
      if(!silent){state.admin=await api(`/admin?offset=${state.admin?.offset||0}`);renderAdmin();}
    }else{
      if(state.tab==='history'&&!silent)state.history=await api(`/history?month=${state.history?.month||data.stats.month}`);
      if(!silent||(!$('#modal').open&&state.tab!=='history'))renderMember();
    }
  }catch(e){
    if(e.status===401){state.data=null;state.history=null;state.admin=null;closeModal();renderAuth();}
    else if(!silent){if(!state.data){$('#main').innerHTML=`<div class="loading-state"><p>${esc(e.message)}</p><button class="button section-gap" id="reload-app">Volver a intentar</button></div>`;$('#reload-app').onclick=()=>refresh();}else toast(e.message,true);}
  }finally{state.busy=false;}
}
function musicLabel(){const b=$('#music-toggle');b.textContent=state.musicPlaying?'♫ Silenciar':'♫ Música';b.classList.toggle('music-on',state.musicPlaying);b.setAttribute('aria-label',state.musicPlaying?'Silenciar música':'Reproducir música');b.setAttribute('aria-pressed',String(state.musicPlaying));}
async function tryMusic(){
  if(!state.config.music)return;
  try{if(localStorage.getItem('hermanitos-muted')==='1')return;}catch{}
  try{await $('#music').play();state.musicPlaying=true;}catch{state.musicPlaying=false;}
  musicLabel();
}
async function start(){
  $('#close-modal').onclick=closeModal;$('#modal').addEventListener('close',stopCamera);$('#modal').addEventListener('cancel',stopCamera);
  $('#account-button').onclick=account;
  $('#logout-button').onclick=async()=>{try{await api('/logout',{});state.data=null;closeModal();renderAuth();}catch(e){toast(e.message,true);}};
  $('#music-toggle').onclick=async()=>{if(state.musicPlaying){$('#music').pause();state.musicPlaying=false;try{localStorage.setItem('hermanitos-muted','1');}catch{}}else{try{localStorage.setItem('hermanitos-muted','0');}catch{}await tryMusic();}musicLabel();};
  try{state.config=await api('/config');if(state.config.music){$('#music-toggle').hidden=false;$('#music').src='/hermanitos/assets/hermanitos.mp3';await tryMusic();document.addEventListener('pointerdown',()=>tryMusic(),{once:true});}}catch{}
  await refresh();
  setInterval(updateCooldown,1000);
  // Only foreground member pages poll, keeping shared free-tier requests modest.
  setInterval(()=>{if(state.data?.user.role==='member'&&!document.hidden&&!$('#modal').open)refresh(true);},30000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();else if(state.data)refresh(true);});
  window.addEventListener('pagehide',stopCamera);
  const context=document.modelContext;
  if(context?.registerTool){
    const lifecycle=new AbortController();
    try{await context.registerTool({name:'hermanitos_get_my_card',title:'Consultar mi tarjeta',description:'Consulta los sellitos y favores de la cuenta autenticada de Hermanitos Card.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async input=>{if(Object.keys(input||{}).length)throw Error('No se aceptan parámetros.');if(!state.data||state.data.user.role!=='member')throw Error('Inicia sesión como hermano.');await refresh();return {name:state.data.user.name,...state.data.stats};}},{signal:lifecycle.signal});}catch{}
    window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  }
}
start();
