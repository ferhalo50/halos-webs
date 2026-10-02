(() => {
  'use strict';
  const tenant=window.LoyaltyTenant;
  const copy=value=>tenant.replacements.reduce((text,[from,to])=>text.split(from).join(to),value);
  let installPrompt = null;
  let installed = false;
  const standalone = matchMedia('(display-mode: standalone)');
  const isInstalled = () => installed || standalone.matches || navigator.standalone === true;
  const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const guides = {
    customer: ['Tu tarjeta, paso a paso', [
      ['Tu momento Renace', 'Renace Card es tu tarjeta de lealtad digital. Acumula 9 sellos por tus visitas y el 10.º café es gratis. Los círculos y el contador 0/9 muestran tu progreso; puedes recibir un sello por día calendario de Tijuana.'],
      ['Diseño de tus sellos', 'Elige Clásico, Vaquero o Moño debajo de tu tarjeta. Cambia al instante y se guarda en tu cuenta para otros dispositivos. Solo cambia la apariencia: tus visitas y recompensas siguen iguales.'],
      ['Muestra tu QR en caja', 'El QR identifica tu tarjeta. El empleado lo escanea, confirma tu compra y registra el sello. Con internet, tu tarjeta se actualiza automáticamente en unos segundos. También puedes usar “Actualizar tarjeta”.'],
      ['Lleva tu QR sin internet', '“Descargar QR” guarda una imagen con tu nombre, celular y código en las descargas del dispositivo. “Compartir QR” abre las opciones disponibles para compartir o guardar; en iPhone puedes elegir “Guardar imagen”. Si compartir no está disponible, se descarga el archivo. La imagen incluye tu diseño y una foto del saldo al guardarla; puede quedar desactualizada. Consulta el saldo actual con internet o en mostrador.'],
      ['Disfruta tu café gratis', 'Al llegar a 9/9 aparece “¡Café gratis disponible!”. Muéstralo en caja para que el empleado confirme el canje. Después los sellos vuelven a 0/9 y comienza un nuevo recorrido. Escanear el QR no canjea automáticamente la recompensa.'],
      ['Instala tu tarjeta', 'Pulsa “Instalar app” junto a esta guía. En navegadores compatibles se abrirá la opción de instalación; en los demás verás los pasos. En iPhone o iPad, abre la página en Safari, pulsa Compartir → Agregar a pantalla de inicio → Agregar.'],
      ['Tu cuenta y Renace', 'En “Mi cuenta” puedes cambiar tu nombre y tu PIN. Si lo olvidaste, pide ayuda al equipo en el mostrador: te dará un PIN temporal que tendrás que cambiar al entrar. Los enlaces de Instagram, TikTok, menú y ubicación están debajo de tu tarjeta QR.']
    ]],
    employee: ['Una atención sencilla en mostrador', [
      ['1. Encuentra la tarjeta', 'Pulsa “Abrir cámara” y permite usarla cuando el navegador lo solicite. Acerca el QR completo dentro del marco y espera a que aparezcan el nombre y la tarjeta del cliente. La cámara se cierra al detectarlo. Escanear todavía no añade un sello.'],
      ['Si la cámara no funciona', 'Busca al cliente con su celular de 10 dígitos o su código de tarjeta REN-… y pulsa “Buscar tarjeta”. Si negaste la cámara, revisa el permiso de cámara del sitio en tu navegador o en los ajustes del dispositivo y vuelve a abrir la página. También puedes cerrar y abrir la cámara, mejorar la luz y pedir que suban el brillo del QR.'],
      ['2. Confirma la compra y añade el sello', 'Revisa que sea la persona correcta, pulsa “Registrar sello +” y confirma la operación. Hay un sello por día calendario de Tijuana, no por cada 24 horas. Si ya recibió el de hoy, el botón queda desactivado.'],
      ['3. Entrega la recompensa', 'Al llegar a 9/9, la tarjeta indica que hay una recompensa disponible. Cuando entregues el café gratis, pulsa “Canjear café gratis” y confirma. El contador vuelve a cero. Mientras tenga una recompensa lista, primero debe canjearla para iniciar otro recorrido.'],
      ['Mensajes y correcciones', '“Ya recibió su sello de hoy” significa que no se puede duplicar la visita. Si no se encuentra la tarjeta, verifica el celular o vuelve a escanear. Si hay un error de conexión, vuelve a buscar la tarjeta para comprobar su saldo antes de repetir la operación. Si registraste un sello por error, pide al administrador que lo corrija con un motivo.'],
      ['PIN temporal', 'Con el cliente presente, busca o escanea su tarjeta y pulsa PIN temporal. Confirma su identidad en mostrador. Sus sesiones se cerrarán y deberá entrar con el PIN temporal y elegir uno nuevo. Entrégalo en ese momento: se muestra una sola vez. La acción queda registrada con tu nombre.'],
      ['Cuida tu acceso', 'En “Mi cuenta” puedes cambiar tu propio nombre y tu contraseña. Cierra sesión con “Salir” cuando termines de usar un dispositivo compartido. El cliente puede conservar su QR descargado, pero el mostrador necesita internet para consultar y registrar operaciones.']
    ]],
    admin: ['Tu guía de administración', [
      ['Las métricas', '“Clientes” muestra las cuentas activas. “Sellos hoy” muestra las visitas registradas hoy. “Recompensas pendientes” cuenta las recompensas que los clientes tienen listas para canjear, no el inventario de bebidas. “Cafés canjeados” muestra las recompensas ya entregadas.'],
      ['Clientes y búsquedas', 'Busca por nombre, celular o código de tarjeta. La lista tiene 6 clientes por página. “Editar” permite corregir nombre y celular; estos cambios cierran las sesiones del cliente para que vuelva a entrar con sus datos actualizados.'],
      ['Ajustar sellos', 'En “Ajustar sellos” puedes añadir o quitar un sello por operación, entre 0 y 9. Escribe el motivo: permite saber quién corrigió el saldo y por qué. Añadir un sello manual no consume la visita diaria. Al quitar un sello, si aparece la opción, puedes anular también la visita de hoy para permitir registrarla de nuevo. Revisa el saldo antes de confirmar.'],
      ['Recompensas y canjes', 'Con 9 sellos hay un café gratis por canjear. Desde “Mostrador”, busca o escanea la tarjeta y confirma el canje cuando se entregue la bebida. Después vuelve a 0/9. La lectura del QR por sí sola no añade sellos ni canjea cafés.'],
      ['Recuperar un PIN en persona', 'Usa “PIN temporal” con el cliente presente y confirma que sea su cuenta. El sistema muestra una sola vez un PIN temporal, cierra sus sesiones y le pide crear uno nuevo al entrar. El cliente elige su PIN privado. Desde “Mi cuenta”, cada persona puede cambiar su propio acceso. No hay recuperación por SMS.'],
      ['Equipo', 'Puedes crear cuentas de Mostrador o Administrador para este negocio. Solo el administrador inicial puede crear, editar o eliminar administradores; su eliminación o desactivación está protegida. Crear un administrador requiere confirmación. Puedes editar empleados y activar o desactivar su acceso. Cada persona puede cambiar su propio nombre desde Mi cuenta. Desactivar sirve para suspenderlo conservando la cuenta; eliminar da de baja la cuenta. La edición del acceso cierra sus sesiones. No compartas la cuenta de administrador para la atención cotidiana.'],
      ['Actividad y exportación', 'El historial muestra fecha, cliente, movimiento, motivo y quién lo registró, en páginas de 6. Filtra por fechas, cliente, movimiento o empleado. “Exportar esta página” genera Excel con los clientes visibles. “Exportar todos los clientes” incluye todos los activos del negocio. “Exportar todas las actividades” incluye el historial completo en hojas mensuales, incluso meses vacíos.'],
      ['Eliminar cuentas', 'La eliminación invalida el acceso y el QR del cliente, retira sus datos personales y conserva la actividad sin su identidad. Revisa bien a quién seleccionaste y la confirmación antes de continuar.'],
      ['Demostración', '“Restablecer clientes de prueba” prepara las dos cuentas demo con 0/9 y 8/9 sellos, reinicia su actividad y sus accesos de prueba. Úsalo para ensayar; no es un botón para limpiar a todos los clientes.']
    ]]
  };

  if(!tenant.demo)guides.admin[1]=guides.admin[1].filter(([label])=>label!=='Demostración');

  const englishGuides = {
    customer: ['Your card, step by step', [
      ['Your digital loyalty card', tenant.stampPolicy==='per_item' ? `Each paid coffee adds progress. Every ${tenant.rewardGoal} paid coffees earns one pending free drink, redeemed separately.` : `Show your card on each eligible visit. Your progress and available reward are always shown on the front.`],
      ['Show your QR at the counter', 'Tap the card to reveal its QR. The team scans it, confirms the purchase and records the operation. Scanning alone never adds stamps or redeems a reward.'],
      ['Keep it available offline', 'Use Download QR to save an image or Share QR to use the options on your device. The saved image identifies your card, while the live app shows your current balance.'],
      ['Install the app', 'Use Install app beside this guide. On iPhone or iPad, open this page in Safari, tap Share, choose Add to Home Screen and confirm.'],
      ['Your account', 'Use My account to change your name without signing out, or change your PIN. If you forget your PIN, ask the team for a temporary PIN in person; you will create a new PIN when you sign in.']
    ]],
    employee: ['A simple counter workflow', [
      ['Find the card', 'Open the camera and place the full QR inside the frame. You can also search by the 10-digit mobile number or card code. Finding a card does not change its balance.'],
      ['Confirm the purchase', tenant.stampPolicy==='per_item' ? 'Select only paid coffees. The summary shows progress, rewards earned and available free drinks.' : 'Confirm the customer and purchase before adding today\'s stamp. The daily limit follows the business rule shown on screen.'],
      ['Apply the reward', tenant.stampPolicy==='per_item' ? `Every ${tenant.rewardGoal} paid coffees earns one pending free drink. Redeem explicitly; redemption does not change progress.` : 'When the reward is ready, deliver it and use Redeem free coffee. The next loyalty cycle then starts at zero.'],
      ['Temporary PIN and access', 'Create a temporary PIN only with the customer present. Use My account to change your own name and password and log out when you finish on a shared device.'],
      ['Install on this device', 'Use Install app to keep the counter shortcut on the tablet or computer. On iPhone or iPad, use Safari → Share → Add to Home Screen.']
    ]],
    admin: ['Administration guide', [
      ['Dashboard', 'Review active customers, today\'s stamps, pending rewards and redeemed rewards. Pending rewards are free coffees waiting to be delivered.'],
      ['Customers', 'Search by name, mobile number or card. You can edit an account, correct stamps with a required reason, issue a temporary PIN or remove an account.'],
      ['Team', 'Create Staff or Administrator accounts for this business. Only the initial administrator can create, edit or delete administrators; their account cannot be deleted or deactivated. Creating an administrator requires confirmation. You can edit staff, disable their access temporarily or remove their account. Each person can change their own name in My account. Individual access keeps the activity log clear.'],
      ['Activity and exports', 'Filter activity by date, customer, movement or team member. Export customers or the complete activity history to Excel when needed.'],
      ['Install and security', 'Use Install app for quick access on the administration device. Change your password in My account and log out on shared devices.']
    ]]
  };

  if(tenant.stampPolicy==='per_item'){
    const floral=tenant.slug==='vainillacoffee',goal=tenant.rewardGoal,unit=floral?'flores':'sellos',enUnit=floral?'flowers':'stamps';
    const rule='Cada café pagado suma '+(floral?'una flor':'un sello')+'. Cada '+goal+' cafés pagados genera una bebida gratis por decidir. El progreso real pasa al siguiente recorrido; la tarjeta se muestra completa hasta decidir. Antes de registrar otra compra, el equipo debe confirmar Canjear ahora o Guardar para después, una recompensa a la vez. No hay límite diario.';
    const redeem='Canjear ahora resuelve una recompensa por decidir y entrega la bebida. Guardar para después la pasa a Bebidas gratis disponibles. Canjear bebida gratis entrega una recompensa ya guardada. Cada acción reduce el saldo en uno y no cambia el progreso, no añade '+unit+' ni reinicia la tarjeta. Nunca se canjea automáticamente.';
    guides.customer=['Tu tarjeta, paso a paso',[
      ['Tu tarjeta '+tenant.shortName,rule],['Bebidas gratis disponibles','La tarjeta se muestra completa mientras haya recompensas por decidir. El equipo ve el progreso real X/'+goal+' '+unit+' y el contador separado de bebidas gratis disponibles. Puedes guardar varias recompensas.'],['Disfruta tu bebida gratis',redeem],['QR y descarga','Muestra tu QR en caja. Escanear no modifica el saldo. La imagen descargada incluye una foto del progreso y recompensas; consulta el saldo actualizado en la app.'],['Tu cuenta e instalación','Cambia tu nombre y tu PIN en Mi cuenta. Si lo olvidaste, pide un PIN temporal al equipo con tu identidad confirmada. Usa Instalar app para guardar el acceso.']]];
    guides.employee=['Una atención sencilla en mostrador',[
      ['Encuentra la tarjeta','Escanea el QR o busca por celular o código. Confirma nombre, progreso y bebidas gratis disponibles.'],['Confirma los cafés pagados',rule+' Selecciona de 1 a 99 cafés pagados por operación. La confirmación muestra el progreso y las recompensas generadas.'],['Entrega la recompensa',redeem],['Errores y acceso','Si la tarjeta cambió o hay un error de conexión, vuelve a buscarla antes de confirmar. No repitas una operación ya registrada. Crea PIN temporales solo con el cliente presente. Cambia tu propio nombre y contraseña en Mi cuenta y cierra sesión al terminar.']]];
    guides.admin=['Tu guía de administración',[
      ['Clientes y recompensas','La lista y el detalle muestran progreso real, Por decidir y Gratis por separado. Las métricas suman recompensas pendientes, no clientes con una tarjeta completa.'],['Compras y canjes',rule+' '+redeem],['Actividad y exportación','La compra registra cafés pagados, progreso resultante, recompensas generadas y saldo pendiente en un evento. El canje se registra por separado. El Excel conserva columnas existentes y agrega bebidas gratis disponibles y recompensas por decidir.'],['Equipo y ajustes','Mantén accesos individuales. Los administradores pueden gestionar Mostrador; solo el administrador inicial puede crear, editar o eliminar administradores, con confirmación para su creación. Cada persona puede cambiar su propio nombre en Mi cuenta. Solo el administrador puede gestionar cuentas, equipo, exportaciones y ajustes con motivo. Una corrección que complete la meta crea una recompensa por decidir. No se permite añadir progreso mientras haya decisiones pendientes.']]];
    const enRule='Each paid coffee adds one '+(floral?'flower':'stamp')+'. Every '+goal+' paid coffees earns one free drink awaiting a decision. Actual progress starts the next cycle; the card stays visually full until all decisions are resolved. Before another purchase, the team must confirm Redeem now or Save for later, one reward at a time. There is no daily limit.';
    const enRedeem='Redeem now resolves one decision and delivers the drink. Save for later moves it to Free drinks available. Redeem free drink consumes one previously saved reward. It does not change progress, add '+enUnit+' or reset the card. Redemption is never automatic.';
    englishGuides.customer=['Your card, step by step',[['Your '+tenant.shortName+' card',enRule],['Free drinks available','The card stays full while rewards await a decision. The team sees actual progress X/'+goal+' '+enUnit+' and the separate available free drinks counter. You can keep several rewards.'],['Enjoy your free drink',enRedeem],['QR and download','Show your QR at the counter. Scanning does not change balances. A downloaded image is a snapshot; check current progress and rewards in the app.'],['Your account and installation','Change your name and PIN in My account. Request a temporary PIN in person if needed. Use Install app to keep the shortcut.']]];
    englishGuides.employee=['A simple counter workflow',[['Find the card','Scan the QR or search by mobile number or card code. Confirm the name, progress and available free drinks.'],['Confirm paid coffees',enRule+' Select 1 to 99 paid coffees per operation. The confirmation shows progress and rewards earned.'],['Deliver the reward',enRedeem],['Errors and access','If the card changed or connection failed, look it up again before confirming. Do not repeat a recorded operation. Issue temporary PINs only in person. Change your own name and password in My account and log out when finished.']]];
    englishGuides.admin=['Administration guide',[['Customers and rewards','The list and details show actual progress, Awaiting decision and saved Free drinks separately. Metrics sum pending rewards.'],['Purchases and redemption',enRule+' '+enRedeem],['Activity and exports','Purchases record paid coffees, resulting progress, rewards earned and pending balance in one event. Redemption is audited separately. Excel preserves existing columns and adds available free drinks and rewards awaiting decision.'],['Team and corrections','Use individual accounts. Administrators can manage Staff; only the initial administrator can create, edit or delete administrators, with confirmation for creation. Each person can change their own name in My account. Only administrators manage accounts, staff, exports and corrections with a reason. A correction completing the goal earns a reward awaiting decision. Progress cannot be added while decisions are pending.']]];
  }

  const teamGuide = 'Todo administrador puede crear, editar, activar, desactivar y eliminar cuentas de Mostrador de este negocio. Solo el administrador inicial puede crear, editar, activar, desactivar o eliminar otros administradores. Los administradores adicionales conservan las demás funciones, pero no ven esas opciones ni pueden utilizarlas. La cuenta inicial lleva la etiqueta Administrador inicial y no puede eliminarse ni desactivarse. Para crear otro administrador, el inicial elige Administrador en Equipo → Crear usuario y confirma sus datos. Usa una cuenta individual por persona; editar el acceso cierra las sesiones de esa cuenta.';
  const englishTeamGuide = 'Every administrator can create, edit, activate, deactivate and delete Staff accounts for this business. Only the initial administrator can create, edit, activate, deactivate or delete other administrators. Additional administrators keep the other functions, but cannot see or use those options. The original account is labelled Initial administrator and cannot be deleted or deactivated. To create another administrator, the initial administrator chooses Administrator in Team → Create user and confirms the details. Use an individual account for each person; editing access closes that account’s sessions.';
  for(const role of ['customer','employee','admin']){
    guides[role][1].push(['Cambiar tu nombre', 'Abre Mi cuenta → Cambiar nombre, escribe tu propio nombre y pulsa Guardar nombre. El cambio no cierra tu sesión ni modifica tu '+(role==='customer'?'celular, PIN, QR, '+(tenant.slug==='vainillacoffee'?'flores':'sellos')+' o recompensas.':'usuario, contraseña, rol o permisos. En Equipo y Actividad se muestra tu nombre actual sin reescribir el historial.')+' El cambio de PIN o contraseña se realiza por separado.']);
    englishGuides[role][1].push(['Change your name', 'Open My account → Change name, enter your own name and tap Save name. This does not sign you out or change your '+(role==='customer'?'mobile number, PIN, QR, '+(tenant.slug==='vainillacoffee'?'flowers':'stamps')+' or rewards.':'username, password, role or permissions. Team and Activity display your current name without rewriting history.')+' Change your PIN or password separately.']);
  }
  guides.admin[1]=guides.admin[1].map(([label,text])=>label==='Equipo'||label==='Equipo y ajustes'?[label,teamGuide+(tenant.stampPolicy==='per_item'?' Los ajustes de progreso requieren un motivo. Una corrección que complete la meta genera una recompensa por decidir. No se permite añadir progreso mientras haya decisiones pendientes.':'')]:[label,text]);
  englishGuides.admin[1]=englishGuides.admin[1].map(([label,text])=>label==='Team'||label==='Team and corrections'?[label,englishTeamGuide+(tenant.stampPolicy==='per_item'?' Progress corrections require a reason. A correction completing the goal earns a reward awaiting decision. Progress cannot be added while decisions are pending.':'')]:[label,text]);

  function openGuide(title, sections, trigger) {
    document.querySelector('#renace-guide')?.close();
    const dialog = document.createElement('dialog');
    dialog.id = 'renace-guide';
    dialog.className = 'renace-guide';
    dialog.setAttribute('aria-labelledby', 'guide-title');
    const header = document.createElement('header');
    const heading = document.createElement('h2');
    heading.id = 'guide-title';
    heading.textContent = copy(title);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'secondary guide-close';
    close.textContent = 'Cerrar ✕';
    close.autofocus = true;
    close.onclick = () => dialog.close();
    header.append(heading, close);
    const content = document.createElement('div');
    content.className = 'guide-content';
    content.tabIndex = 0;
    content.setAttribute('aria-label', 'Contenido de la guía');
    sections.forEach(([label, copy], index) => {
      const section = document.createElement('section');
      const h = document.createElement('h3');
      h.textContent = tenant.replacements.reduce((text,[from,to])=>text.split(from).join(to),label);
      const p = document.createElement('p');
      p.textContent = tenant.replacements.reduce((text,[from,to])=>text.split(from).join(to),copy);
      section.dataset.step = String(index + 1).padStart(2, '0');
      section.append(h, p);
      content.append(section);
    });
    dialog.append(header, content);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.addEventListener('close', () => {
      dialog.remove();
      document.body.style.overflow = oldOverflow;
      const fallback = trigger?.id ? document.getElementById(trigger.id) : document.querySelector('[data-renace-guide]');
      (trigger?.isConnected ? trigger : fallback)?.focus();
    }, { once: true });
    document.body.append(dialog);
    window.LoyaltyI18n?.apply(dialog);
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Tab') {
        event.preventDefault();
        (document.activeElement === close ? content : close).focus();
      }
    });
    dialog.showModal();
    close.focus();
  }

  function refreshInstall() {
    document.querySelectorAll('[data-renace-install]').forEach(button => {
      button.disabled = isInstalled();
      button.textContent = isInstalled() ? 'App instalada' : 'Instalar app';
    });
  }

  async function install(trigger) {
    if (isInstalled()) return refreshInstall();
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      trigger.disabled = true;
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === 'accepted') installed = true;
      } catch {
        showInstallHelp(trigger);
      } finally { refreshInstall(); }
      return;
    }
    showInstallHelp(trigger);
  }

  function showInstallHelp(trigger) {
    const english=window.LoyaltyI18n?.locale==='en';
    openGuide(english ? `${tenant.shortName} on your Home Screen` : `${tenant.shortName} en tu pantalla de inicio`, english ? (ios() ? [
      [`1 · Open ${tenant.shortName} in Safari`, 'If you are inside Instagram, WhatsApp, Chrome, Google or another browser, open this same address in Safari.'],
      ['2 · Share ↑', 'Tap Share, the square icon with an upward arrow.'],
      ['3 · Add to Home Screen ＋', 'Choose Add to Home Screen and confirm Add.'],
      ['4 · Open the app', `Find the ${tenant.shortName} icon on your Home Screen.`]
    ] : [
      ['1 · Open the browser menu ⋮', `Choose Install app, Install ${tenant.shortName}, or Add to Home Screen.`],
      ['2 · Confirm installation', 'Follow the browser instructions. On a computer, the install icon may appear beside the address.'],
      ['Keep your card close', 'No app store or APK is required. Internet is needed to update stamps and sign in.']
    ]) : (ios() ? [
      [`1 · Abre ${tenant.shortName} en Safari`, 'Si estás dentro de Instagram, WhatsApp, Chrome, Google u otro navegador, abre esta misma dirección en Safari.'],
      ['2 · Compartir ↑', 'Pulsa Compartir: el icono de un cuadrado con una flecha hacia arriba. Según tu versión de Safari puede estar en la barra o dentro del menú.'],
      ['3 · Agregar a pantalla de inicio ＋', 'Busca “Agregar a pantalla de inicio” entre las acciones. Si aparece “Abrir como app web”, déjalo activado. Confirma con “Agregar”.'],
       ['4 · Abre la app', `Busca el icono de ${tenant.shortName} en la pantalla de inicio. Esta página no puede abrir automáticamente el menú de instalación de Safari.`]
    ] : [
       ['1 · Abre el menú del navegador ⋮', `Busca “Instalar aplicación”, “Instalar ${tenant.shortName}” o “Agregar a pantalla de inicio”. En una computadora también puede aparecer un icono de instalación junto a la dirección.`],
       ['2 · Confirma la instalación', `Sigue los pasos que muestre tu navegador. Si la opción no aparece, puedes guardar ${tenant.shortName} como favorito o probar desde Chrome, Edge o Safari.`],
      ['Tu tarjeta siempre a mano', 'No necesitas descargar un APK ni visitar una tienda. Para actualizar sellos e iniciar sesión necesitas internet; guarda también la imagen de tu QR para mostrarla sin conexión.']
     ]), trigger);
  }

  window.RenaceHelp = {
    controls(role) {
       return `<div class="help-actions"><button type="button" id="role-guide" class="secondary" data-renace-guide="${role}">${role === 'customer' ? 'Guía' : 'Guía de uso'}</button><button type="button" id="install-app" class="secondary" data-renace-install ${isInstalled() ? 'disabled' : ''}>${isInstalled() ? 'App instalada' : 'Instalar app'}</button></div>`;
    }
  };
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; refreshInstall(); });
  window.addEventListener('appinstalled', () => { installed = true; installPrompt = null; refreshInstall(); });
  standalone.addEventListener('change', refreshInstall);
  window.addEventListener('hashchange', () => document.querySelector('#renace-guide')?.close());
  document.addEventListener('click', event => {
    const guide = event.target.closest('[data-renace-guide]');
     if (guide && guides[guide.dataset.renaceGuide]) {
       const source=window.LoyaltyI18n?.locale==='en' ? englishGuides : guides;
       openGuide(...source[guide.dataset.renaceGuide], guide);
     }
    const button = event.target.closest('[data-renace-install]');
    if (button) install(button);
  });
})();
