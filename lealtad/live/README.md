# Renace Lealtad · aplicación con backend

Versión con datos compartidos sobre Cloudflare Workers + D1. La aplicación pública y `/api/*` se sirven desde el mismo origen HTTPS. No contiene contraseñas ni secretos de la cuenta Cloudflare.

## Estado de la prueba remota

- Aplicación: `https://app.haloswebs.com/renace/`
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
4. Ejecuta `pnpm run dev` y abre `http://127.0.0.1:8787/renace/`.
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

Las credenciales dentro de los archivos de prueba son exclusivamente locales. No deben reutilizarse en producción.
