# Hermanitos Card

Aplicación independiente de Renace, dentro del repositorio Halos Webs.

## Producción

- URL publicada: https://app.haloswebs.com/hermanitos/
- Worker: `hermanitos-card`.
- Base D1: `hermanitos-card`, ID `9a4a4263-f7c7-4122-862c-809c9f028868`.
- Todas las rutas de aplicación, API y archivos están bajo `/hermanitos/`.
- Cookie exclusiva `hermanitos_session`, ruta `/hermanitos`, HttpOnly, Secure y SameSite Strict.
- Las rutas específicas del Worker toman precedencia únicamente en `/hermanitos/`. El dominio existente y Worker de Renace permanecen intactos.
- No se requiere suscripción de pago, SMS, correo ni servicios de terceros. Las cuotas gratuitas de Cloudflare se comparten por cuenta con otros proyectos.

## Reglas acordadas

1. Un favor pequeño genera un sellito para quien escanea. Quien muestra su QR recibe una notificación y registro, sin sello.
2. Nadie puede escanear su QR. Un minuto entre escaneos de la misma cuenta, incluso si cambia el QR o dispositivo. El servidor y un trigger D1 validan el límite.
3. Cada diez sellitos genera un crédito de favor mayor. El hermano elige a quién pedirlo; cada solicitud consume un crédito. Se acumulan créditos y deudas.
4. Solo quien recibe el favor puede confirmar el cumplimiento. Ni el deudor ni el administrador se autoconfirman como acreedor.
5. Medidor rojo: todos los favores mayores que el hermano debe. Verde: los que cumplió este mes, después de cualquier limpieza manual. La aguja refleja la proporción entre ambos.
6. La zona es `America/Tijuana`. El contador mensual se calcula por intervalo calendario, sin borrar datos y sin depender de una tarea que se ejecute exactamente a medianoche.
7. El historial conserva cumplidos del mes y deudas al cierre de ese mes. Los eventos de favor preservan las asignaciones anteriores si el administrador las cambia.
8. Limpiar cumplidos reinicia solo el medidor; el historial mensual conserva los cumplimientos. Limpiar pendientes cierra deudas sin marcarlas como cumplidas ni devolver créditos. Ambas acciones tienen confirmación, aviso y bitácora.
9. Anular un favor devuelve su crédito. Anular sellitos reduce los derechos ganados, pero no cancela favores ya solicitados; nuevos sellitos cubren cualquier diferencia.
10. Eliminar cuenta impide acceso e invalida su QR, preservando movimientos y deudas. Pausar una cuenta también impide acceso. No se borran movimientos físicos de las tablas.

Las cuentas iniciales se cargan por separado con hashes PBKDF2-SHA-256 de 100,000 iteraciones y sal aleatoria. No se publican contraseñas, teléfonos iniciales ni tokens QR en código o migraciones. El registro admite nuevos hermanos (nunca nuevos administradores). Los nombres de acceso no distinguen mayúsculas ni acentos. Las nuevas contraseñas de miembros requieren 6 caracteres; los PIN iniciales respetan lo solicitado.

## Desarrollo y pruebas

Usar Node.js y pnpm:

1. `pnpm install`
2. `node scripts/vendor.mjs`
3. `pnpm run db:local`
4. Crear un archivo ignorado `.private/accounts.json` con cuentas exclusivamente de prueba.
5. `node scripts/seed.mjs .private/accounts.json`
6. `pnpm exec wrangler d1 execute DB --local --file .private/seed.sql`
7. `pnpm run dev`, abrir `http://localhost:8791/hermanitos/`.

`pnpm test` ejecuta pruebas aisladas con una base efímera de Miniflare. Cubre sesiones, origen, roles, QR propio/ajeno, cooldown concurrente, canje concurrente, permisos de cumplimiento, cierre mensual, limpieza administrativa, registro y bajas. Nunca usa datos de producción.

`pnpm run check` comprueba sintaxis. `pnpm run build` prepara bibliotecas QR y valida el empaquetado del Worker.

Los paquetes QR se sirven localmente y conservan sus avisos de licencia. No se envían códigos QR ni datos de usuarios a servicios externos.

## Publicación

Aplicar las migraciones exclusivamente con el `wrangler.jsonc` de esta carpeta. Ejecutar `pnpm exec wrangler d1 migrations apply DB --remote` y después `pnpm run deploy`. Nunca utilizar la configuración de `lealtad/live` para esta aplicación.

Crear las cuentas iniciales solo una vez mediante el archivo SQL privado y retirar el archivo de contraseñas de entrada después. No existe un endpoint público de configuración.

## Música

Pendiente del MP3 que entregará el usuario. Guardarlo en `public/hermanitos/assets/hermanitos.mp3`, cambiar `MUSIC_ENABLED` a `true` en la configuración y publicar. Se reproduce en bucle y ofrece silenciar. Los navegadores pueden bloquear el audio hasta la primera interacción; la app intenta de nuevo al tocar la página o iniciar sesión. La preferencia de silencio se conserva en el dispositivo.

## Interacción y límites

- Avisos dentro de la app; actualización cada 30 segundos mientras la página del hermano esté visible. No son notificaciones push del sistema cuando la app está cerrada.
- Todos los favores pendientes se muestran; la vista principal agrega los 30 cierres más recientes. El historial muestra hasta 200 movimientos de cada tipo por mes, con contadores que incluyen todos. El administrador navega movimientos en páginas de 50.
- La cámara necesita HTTPS (o localhost) y permiso del navegador. La prueba física con dos teléfonos debe verificar lectura y permiso reales.
- Una herramienta WebMCP opcional de solo lectura permite consultar la tarjeta autenticada en navegadores compatibles. No es necesaria para utilizar la aplicación.
- El plan no se cambia desde la aplicación. No se adquieren dominios ni se activan servicios facturados.

## Verificación de entrega · 14 de septiembre de 2026 (Tijuana)

- Publicación correcta del Worker, rutas exclusivas y base independiente.
- 11 pruebas automáticas aprobadas, incluida codificación/decodificación real del QR con las bibliotecas del cliente.
- Acceso, permisos, lectura de panel/historial y cierre de sesión comprobados para las cuatro cuentas, tanto localmente como en producción.
- Aplicación inicial sin sellitos ni favores de prueba en producción. Se retiraron los archivos temporales de contraseñas y carga inicial.
- Renace respondió HTTP 200 antes y después; su HTML conservó exactamente el mismo SHA-256. Su asociación del dominio a `lealtad` permaneció idéntica.
- Pendientes: recibir el MP3 y confirmar cámara/permisos en teléfonos físicos. No se realizó inspección visual automatizada de navegador. La herramienta WebMCP opcional no se validó en un navegador compatible.
