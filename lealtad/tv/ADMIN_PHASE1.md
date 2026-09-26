# Renace Café TV - administrador, fase 1 local

Esta fase solo prepara `/admin`. No se ha desplegado. El reproductor `/` y `public/media.json` siguen siendo la única fuente de reproducción. `R2_MEDIA_ENABLED=false` está reservado para la futura mezcla de contenido; **el código actual no lee R2 aunque alguien cambie el valor**. `TV_ADMIN_ENABLED=false` deja el panel cerrado por defecto.

## Qué funciona localmente

- Inicio de sesión propio de Renace Café TV mediante usuario y contraseña derivada con PBKDF2-SHA256. No reutiliza Renace Card. La cookie de sesión va firmada con HMAC, es HttpOnly, SameSite=Strict, dura ocho horas y usa Secure bajo HTTPS. El panel exige HTTPS salvo en la configuración local explícita de `.dev.vars`.
- Cierre de sesión del navegador y protección de todas las rutas `/admin/api/*`, salvo el endpoint de inicio de sesión. Las peticiones que cambian estado exigen `Origin` del mismo sitio. Nada del panel se guarda en el caché del service worker.
- Lista de solo lectura del contenido de `media.json`, con tipo, vista previa, tamaño cuando el asset lo informa, estado y origen `Contenido base`.
- Resumen de almacenamiento para futuras subidas. El límite viene de `TV_STORAGE_LIMIT_BYTES`; no se fija en el código. Los estados visuales son normal, 80%, 90% y 100%.
- Comprobación **en el servidor** de nombre, extensión, MIME, tamaño y espacio disponible para JPG/JPEG, PNG, WebP y MP4. La comprobación envía solo metadatos; no envía ni guarda el archivo.
- Las acciones de subida, edición de estado/orden y borrado permanecen desactivadas. El servidor rechaza la eliminación física de cualquier elemento base.

## Probar sin datos de producción

Desde `lealtad/tv/`:

1. Ejecuta `node scripts/setup-local-admin.mjs 5`. El número es el límite de prueba en GB; cámbialo por el que se acuerde con Renace. El script genera una contraseña aleatoria y crea `.dev.vars` local, ignorado por Git. Guárdala: se muestra una sola vez.
2. Ejecuta `npm run dev` y abre `http://127.0.0.1:8790/admin` con el usuario y la contraseña mostrados. `R2_MEDIA_ENABLED` sigue en `false`.
3. `npm run check` y `node --test test/admin.test.mjs` comprueban código y permisos. La suite anterior del reproductor puede ejecutarse aparte con `npm test` mientras el servidor local esté activo.

El archivo `.dev.vars.example` solo ilustra los nombres de configuración; sus marcadores **no son contraseñas**. No subas `.dev.vars`, tokens ni credenciales.

## Lo que falta antes de producción

1. Acordar el límite real de almacenamiento y la política de archivos. Crear un bucket **R2 nuevo para TV** y una base **D1 nueva para TV**, separados de la D1 de Renace Card. No se han creado recursos remotos.
2. Revisar y aplicar `migrations/0001_tv_admin.sql` únicamente a la D1 nueva. Registrar el `business_id` y `storage_limit_bytes`. La tabla `tv_media` permitirá orden/estado de contenido base y subido; `tv_audit` queda preparada para bitácora. Ninguna migración se ha ejecutado.
3. Implementar la subida real al bucket con validación de bytes y firma/formato en el servidor, cuotas atómicas, claves no adivinables, registro D1 y limpieza de fallos. El chequeo de metadatos de esta fase no basta para aceptar archivos reales. Los MP4 que no funcionen en Fire TV necesitarán conversión externa y prueba física.
4. Implementar altas, orden, activación, papelera/restauración y borrado final de archivos R2. El contenido base nunca se borra físicamente desde el panel. Unir ambas fuentes al reproductor solo después de probar el interruptor `R2_MEDIA_ENABLED=false/true` en una TV real y conservar el modo sin conexión.
5. Endurecer autenticación antes de activar el panel: limitación de intentos en el borde o Cloudflare Access, recuperación/rotación de credenciales, revocación de sesiones y auditoría. La cookie firmada actual no se puede invalidar individualmente antes de su expiración; cambiar `TV_SESSION_SECRET` invalida todas.

No habilitar `TV_ADMIN_ENABLED` en producción ni desplegar esta rama durante el uso actual de Renace. Un despliegue futuro debe pasar las pruebas locales, una revisión de seguridad y una prueba física de la TV sin interrumpir el servicio.

Para probar con `wrangler dev`, `TV_ADMIN_LOCAL_HTTP=true` se crea únicamente en `.dev.vars`. Wrangler representa internamente la petición local con el dominio de la TV; esta excepción permite HTTP solo en la configuración de desarrollo. **Nunca configures esa variable en producción.**
