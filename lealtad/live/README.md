# Renace Lealtad · aplicación con backend

Versión con datos compartidos sobre Cloudflare Workers + D1. La aplicación pública y `/api/*` se sirven desde el mismo origen HTTPS. No contiene contraseñas ni secretos de la cuenta Cloudflare.

## Estado de la prueba remota

- Aplicación: `https://renacecafe.haloswebs.com/`
- Base D1: `renace-lealtad`, región WNAM.
- Migraciones remotas aplicadas: `0001_initial.sql`, `0002_scale_indexes.sql`, `0003_password_iterations.sql`, `0004_admin_audit.sql`, `0005_user_management.sql` y `0006_stamp_adjustments.sql`.
- Cuentas iniciales creadas y llave temporal de configuración retirada.
- Plan utilizado: Workers Free.
- Prueba física completada con Android como empleado e iPhone como cliente: registro, cámara, lectura del QR, sello y actualización de la tarjeta.

## Funciones implementadas

- Registro e inicio de sesión de clientes con celular y PIN.
- Pantalla de entrada con el logo de Renace y transición suave mientras se recupera la sesión.
- Cambio de PIN o contraseña desde una sesión autenticada, cerrando las demás sesiones de la cuenta.
- Inicio de sesión separado para empleados y administradores.
- Sesión en cookie `HttpOnly`, `Secure` y `SameSite=Strict`; el navegador no expone el token a JavaScript.
- PIN y contraseñas derivados con PBKDF2-SHA-256, 100,000 iteraciones compatibles con Workers y sal aleatoria; nunca se almacenan en texto normal.
- Bloqueo temporal tras cinco intentos de acceso fallidos.
- Tarjeta y QR únicos generados con valores aleatorios.
- Descarga o envío de una imagen de la tarjeta con el QR para usarla aun cuando el cliente no tenga internet.
- La política de imágenes permite de forma limitada `blob:` porque el navegador lo usa para componer la tarjeta PNG. Scripts, conexiones y contenido externo continúan bloqueados. La prueba visual descarga el PNG y vuelve a leer el QR resultante antes de aprobar el cambio.
- Manifiesto y caché de aplicación para añadir Renace a la pantalla de inicio del teléfono.
- Búsqueda en mostrador por QR, identificador de tarjeta o celular.
- Escáner con detección nativa y alternativa JavaScript para funcionar también en navegadores móviles sin `BarcodeDetector`.
- Un sello por día calendario de la zona `America/Tijuana`, protegido además por un índice único en la base de datos.
- Canje disponible al completar 9 sellos.
- Panel administrador con métricas, clientes, empleados y bitácora.
- Actualización automática de la tarjeta cada 5 segundos mientras está visible y conectada; pausa al ocultarla y reintenta tras recuperar conexión. Muestra sellos, correcciones y canjes sin recargar.
- Ajustes administrativos de un sello por operación, entre cero y la meta, con motivo obligatorio e historial. Opcionalmente, retirar un sello anula la visita de hoy y permite volver a registrarla; el evento original se conserva marcado como anulado.
- Los ajustes manuales son excepciones administrativas: añadir un sello no consume la visita diaria. Cada cambio comprueba el saldo esperado y se registra atómicamente para evitar sobrescribir otra operación.
- Lector de QR con marco de cámara, estado de lectura y cierre de cámara al salir u ocultar la página. Escanear abre la tarjeta; registrar el sello sigue requiriendo confirmación.
- Control de demostración para restaurar en un clic los clientes de prueba de 0/9 y 8/9 sellos.
- Restablecimiento presencial de PIN por un administrador: el servidor genera un PIN temporal de un solo uso visible, cierra las sesiones y obliga al cliente a elegir uno nuevo antes de abrir su tarjeta.
- Listado de clientes paginado y con búsqueda para evitar cargar toda la base a la vez.
- Edición de nombre y acceso de clientes y empleados, cerrando sus sesiones después de cambios de identidad.
- Desactivación de empleados y baja de cuentas por el administrador.
- Baja con anonimización: se invalidan acceso y QR, se retiran los datos personales y se conserva el historial de actividad y canjes para reportes.
- Separación por `business_id` para crecer a varios negocios.
- Índices para consultas frecuentes y limpieza diaria de sesiones e intentos de acceso vencidos.
- Verificación de origen para operaciones que modifican datos y cabeceras de seguridad para toda la aplicación.

## Ejecución local

1. Instala dependencias con `pnpm install` o `npm install`.
2. Copia `.dev.vars.example` como `.dev.vars` y reemplaza el valor por un secreto largo solo para tu equipo.
3. Ejecuta `pnpm run db:migrate:local`.
4. Ejecuta `pnpm run dev` y abre `http://127.0.0.1:8787/`.
5. Configura las primeras cuentas una sola vez enviando `POST /api/setup` con la cabecera `X-Bootstrap-Secret`. Las contraseñas de empleados deben tener al menos 8 caracteres; la de administrador, 10.

Los archivos `.dev.vars`, `.wrangler/` y `node_modules/` están ignorados. Nunca se deben subir secretos al repositorio.

## Antes de operación con clientes reales

1. Confirmar en la tablet de Renace el acceso del equipo, permiso de cámara y lectura del QR.
2. Cambiar las contraseñas temporales desde `Mi cuenta`.
3. Cuando Renace apruebe el flujo, conectar el subdominio elegido.
4. Preparar y publicar el aviso de privacidad antes de registrar información real de clientes.
5. Mantener la recuperación presencial en mostrador mientras no se contrate verificación por SMS o WhatsApp. No se aceptan solicitudes anónimas de cambio de PIN.
6. Definir alertas de uso y el momento de migrar a Workers Paid si el negocio adopta la plataforma formalmente.
7. Para botones nativos de Wallet, registrar a Renace como emisor en Google Wallet y solicitar acceso de publicación. Apple Wallet requiere una membresía Apple Developer activa, un Pass Type ID y su certificado de firma.
8. Después de la aprobación comercial, preparar la guía final para empleados con capturas de la versión entregada.

## Capacidad del plan gratuito

Cloudflare Workers Free permite 100,000 solicitudes dinámicas al día; los archivos estáticos no consumen ese límite. D1 incluye 5 millones de filas leídas y 100,000 filas escritas al día, con un máximo de 500 MB para esta base de datos.

La plataforma no tiene un límite fijo de clientes. Para cotización y operación se toma como referencia conservadora hasta 10,000 clientes registrados y alrededor de 1,000 visitas de lealtad al día en el plan gratuito. El límite técnico diario puede ser mayor, pero depende de cuántas veces se abra o actualice la tarjeta, los inicios de sesión y el crecimiento del historial.

Revisar el uso mensualmente y considerar Workers Paid antes de alcanzar cualquiera de estos puntos: 50,000 solicitudes dinámicas al día, 50,000 filas escritas al día o 250 MB de base de datos. Son umbrales preventivos del 50%, no límites de Cloudflare.

## Pruebas

Con el servidor local activo y las cuentas locales de prueba configuradas, `node --test --test-concurrency=1 test/*.test.mjs` valida API e interfaz: registro, sesiones, roles, QR, sello diario, rechazo de duplicado, panel, edición y baja de usuarios, recuperación forzada de PIN y protección de origen.

Después de publicar, `node test/production-smoke.mjs` inicia sesión únicamente con la cuenta demo 0/9, descarga la tarjeta, lee el QR dentro del PNG y cierra la sesión. No registra sellos ni modifica clientes.

Las credenciales dentro de los archivos de prueba son exclusivamente locales. No deben reutilizarse en producción.

## Renace Café TV

La pantalla del establecimiento vive en el proyecto separado `../tv/` y se publica en `https://renacecafetv.haloswebs.com/`. No comparte rutas, D1, sesiones, datos ni service worker con Renace Card. Sus cachés usan el prefijo exclusivo `renace-tv-*` y el contenido pesado solo se guarda cuando una persona pulsa **Preparar sin conexión**.

La biblioteca se edita en `../tv/public/media.json`; las imágenes, videos y audio se organizan bajo `../tv/public/media/`. La interfaz reproduce las imágenes durante 10 segundos de forma predeterminada, deja terminar cada MP4, mantiene la música ambiental entre cambios y acepta Atrás, Escape y flechas del mando. El `README.md` del proyecto TV explica el formato y el cambio de versión del caché.

Para una biblioteca pequeña se pueden publicar archivos ligeros con el Worker. Si crece el volumen de videos, `source` y `thumbnail` están preparados para apuntar a Cloudflare R2. Esa migración futura requerirá crear el bucket, configurar CORS y ampliar los dominios permitidos en las cabeceras de TV; R2 no está configurado ni contratado en esta versión.


## Guías integradas e instalación de la tarjeta

El administrador y el mostrador tienen **Guía de uso**; el cliente tiene **Guía**. Un componente compartido (`public/assets/help.js` y `help.css`) abre un diálogo dentro de la app con contenido específico del rol. Tiene encabezado fijo, desplazamiento interno, cierre con botón/Escape, foco dentro del diálogo y devolución al botón de origen. No abre PDFs ni páginas externas.

La guía explica únicamente funciones existentes: métricas, clientes, equipo, filtros y exportación visible, ajustes con motivo, PIN temporal presencial, bajas, escaneo, confirmación de compra, sello diario y canje. “Cafés disponibles” representa recompensas pendientes de canje, no inventario. Se conserva la regla de 9 sellos y el 10.º café gratis.

**Instalar app** aparece en la tarjeta del cliente. Cuando Chromium proporciona `beforeinstallprompt`, el botón abre ese diálogo nativo y procesa aceptación/cancelación. Si aún no está disponible, muestra instrucciones para el menú del navegador. `appinstalled`, `display-mode: standalone` y `navigator.standalone` evitan ofrecer una instalación innecesaria.

En iPhone/iPad la guía indica abrir en Safari → Compartir → Agregar a pantalla de inicio → Agregar; según la versión, Compartir puede estar dentro del menú. El sitio no puede abrir automáticamente esa opción ni descarga un APK. Se conservan el manifiesto, sus rutas, el modo standalone y los iconos actuales, que ya se habían comprobado instalables.

El caché de interfaz incluye las guías. La consulta de saldos, acceso y operaciones de mostrador requieren internet; para mostrar un QR sin conexión se usa la imagen descargada. El caché de la PWA no replica la base de datos.

`test/guides.test.mjs` comprueba los tres roles, diálogo, foco, Escape, pantalla móvil, instalación aceptada/cancelada, instrucciones de iOS, detección standalone y compartir PNG/cancelar. Los eventos nativos de instalación y compartir se simulan; las pruebas existentes descargan y decodifican el PNG y alimentan el QR real al escáner. La confirmación final del menú del sistema se hace físicamente en Android/iPhone. Todas estas pruebas utilizan la base local, no clientes de producción.


## Diseños personales de sellos (septiembre 2026)

El cliente elige **Clásico**, **Vaquero** o **Moño** debajo de su tarjeta. La vista cambia inmediatamente y `PATCH /api/card/style` guarda únicamente `loyalty_cards.stamp_style` en D1 para la cuenta autenticada y su negocio. No modifica progreso, visitas, canjes ni historial. La migración aditiva `0007_stamp_style.sql` usa `classic` como valor inicial y limita los valores a `classic`, `cowboy` y `bow`; la API rechaza otros valores y la lectura/renderizado usan Clásico para valores antiguos desconocidos. El cliente no puede proporcionar una ruta de imagen ni editar la preferencia de otro cliente. Un guardado fallido muestra un aviso y recupera la preferencia anterior; la sincronización posterior confirma el estado del servidor.

Assets: `public/assets/stamps/stamp-cowboy.webp` y `stamp-bow.webp`, de aproximadamente 17 y 16 KB. Se prepararon a partir de `RenaceStickers.jpeg`, separando los personajes con la herramienta de imágenes y optimizando las salidas con FFmpeg ya disponible. Para sustituirlos, usar WebP con transparencia conservando esos nombres y proporciones; incrementar la versión de caché en `public/service-worker.js`. No se necesita otra migración si los identificadores de estilo se mantienen.

El PNG descargado/compartido conserva QR, nombre y celular y ahora muestra el diseño y los sellos **al momento de guardarlo**, con fecha y aviso de consultar el saldo actual. No representa una recompensa verificable por sí mismo: mostrador siempre consulta el servidor. La corrección CSP para `blob:` se conserva. La guía del cliente explica el selector y la naturaleza estática del PNG.

### QR público para impresión

- `public/print/renace-acceso.png`: 1748 × 2480 px, apto para A5 (148 × 210 mm) a aproximadamente 300 ppp.
- `public/print/renace-acceso.svg`: versión vectorial con el logo incorporado.
- Destino único: `https://renacecafe.haloswebs.com/`, sin token, cuenta ni datos personales.
- Quiet zone de 4 módulos, negro sobre blanco y corrección M; no hay decoración dentro del QR.
- Reproducir con `node scripts/generate-public-qr.mjs` (usa el mismo Playwright disponible para las pruebas). El generador decodifica el QR antes de guardar el PNG final. La suite también decodifica la imagen resultante.

### Validación y publicación

`pnpm run check` y `pnpm test` incluyen estilos, conservación de 5/9, aislamiento entre cuentas, rechazo de valores no permitidos, persistencia tras cerrar sesión y otro contexto de navegador, recuperación del guardado fallido y PNG de los tres estilos con QR legible. Las pruebas usan D1 local, no cuentas de producción.

Antes de desplegar este código, verificar la cuenta Cloudflare correcta y aplicar **solo** la migración pendiente: `pnpm exec wrangler d1 migrations list DB --remote`, después `pnpm exec wrangler d1 migrations apply DB --remote`. Si la cuenta no tiene acceso a Renace, detenerse; no publicar Card sin su columna nueva. La migración local ya se probó.

Las guías y PWA existentes se mantienen: Android usa `beforeinstallprompt` si está disponible; iPhone/iPad explica Safari → Compartir → Agregar a pantalla de inicio → mantener “Abrir como app web” si aparece → Agregar. Chrome/Google/iOS reciben indicaciones para abrir la misma dirección en Safari. No se promete abrir ese menú automáticamente ni se ofrecen APK. El estado standalone o `appinstalled` desactiva la oferta.
