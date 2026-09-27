# Renace Café TV — pre-deploy checkpoint

Fecha: 2026-09-26. Rama: `feature/renace-tv-admin-r2`.

## Estado seguro

- R2 ya había sido activado manualmente por el usuario.
- Bucket exclusivo creado: `renace-cafe-tv-media`; binding `MEDIA_BUCKET`.
- D1 exclusiva creada: `renace-cafe-tv`; ID `f6b22318-7594-498f-87da-aa72772936e9`; binding `TV_DB`.
- Migración `0001_tv_admin.sql` aplicada únicamente a esa D1.
- Los flags del archivo de producción permanecen en `TV_ADMIN_ENABLED=false`, `R2_MEDIA_ENABLED=false` y `TV_BOOTSTRAP_ENABLED=false`.
- No hubo deploy final, merge a main, eliminación de medios locales ni reescritura del historial Git.

## Arquitectura preparada

- `/` conserva el reproductor y consulta `/playlist.json`. Con R2 apagado, el Worker devuelve el `media.json` actual.
- Con R2 encendido, `/playlist.json` lee solo elementos activos de D1, en orden. Si D1 falla, devuelve `media.json` como fallback.
- `/media/item/<id>` sirve R2 sin hacer público el bucket ni el `storage_key`. Soporta GET, HEAD, caché, 404 y un solo Range HTTP con 206/416, `Content-Range`, `Accept-Ranges` y `Content-Length`.
- `/admin` usa D1 para usuarios, sesiones revocables, límite de login, biblioteca, cuota y auditoría; R2 para los archivos.
- El service worker consulta primero la playlist actual y conserva el último paquete preparado manualmente para el modo sin conexión. No descarga automáticamente toda la biblioteca.

## Seguridad

- Contraseñas: PBKDF2-SHA256, 310,000 iteraciones y salt aleatorio de 16 bytes.
- Sesiones: token aleatorio de 256 bits; solo se guarda SHA-256 en D1. Cookie HttpOnly, SameSite=Strict, Secure bajo HTTPS, duración de 8 horas.
- Cambio de contraseña: verifica la actual, genera salt nuevo, revoca todas las sesiones y crea una sesión nueva.
- Login: 5 fallos dentro de 15 minutos bloquean esa combinación IP/usuario durante 15 minutos. La regla vive en el servidor.
- Bootstrap: requiere `TV_BOOTSTRAP_ENABLED=true`, secreto de al menos 32 caracteres y que no exista ningún administrador. Se rechaza después del primer usuario.
- Upload: sesión, mismo origen, extensión, MIME, firma real, máximo de 95 MiB, cuota y clave aleatoria se validan en backend.
- La cuota inicial vive en una sola fila D1: 5 GiB (`storage_limit_bytes=5368709120`). La reserva se hace en una transacción D1 para reducir sobrepasos concurrentes.
- Auditoría: bootstrap, login exitoso, cambio de contraseña, upload, delete, activate, deactivate y reorder. No registra contraseñas, secretos ni tokens.

## Crear el primer administrador durante el despliegue aprobado

1. Generar un secreto aleatorio local de al menos 32 bytes y guardarlo directamente como secret con `npx wrangler secret put TV_BOOTSTRAP_SECRET`. No ponerlo en archivos ni comandos compartidos.
2. Cambiar temporalmente `TV_ADMIN_ENABLED` y `TV_BOOTSTRAP_ENABLED` a `true`, manteniendo `R2_MEDIA_ENABLED=false`, y desplegar la versión aprobada.
3. Enviar una sola petición HTTPS `POST /admin/api/bootstrap` con `Authorization: Bearer <secreto>` y JSON con `username`, `displayName` y una contraseña de 12–128 caracteres. La contraseña solo viaja por HTTPS y se guarda derivada.
4. Confirmar que responde 201 y que el login funciona.
5. Cambiar inmediatamente `TV_BOOTSTRAP_ENABLED=false`, volver a desplegar y eliminar el secret con `npx wrangler secret delete TV_BOOTSTRAP_SECRET`.
6. Activar `R2_MEDIA_ENABLED=true` únicamente después de la prueba física final de TV. El admin puede permanecer activado de manera independiente.

## Migración verificada

- Imágenes: esperadas 15, subidas 15, verificadas 15.
- Videos: esperados 2, subidos 2, verificados 2.
- Bytes locales: 30,617,672.
- Bytes R2 verificados: 30,617,672.
- Metadata D1: 17 filas, orden 1–17.
- Errores: 0.
- La herramienta `scripts/migrate-media.mjs` se ejecutó dos veces con el mismo resultado; usa claves deterministas, UPSERT y comprobación SHA-256, por lo que no duplicó registros.

## Medios que podrán retirarse de HEAD después de aprobar producción

Imágenes migradas:

- `public/media/images/Foto.jpg`
- `public/media/images/MenuTexto1.jpg`
- `public/media/images/MenuTexto2.jpg`
- `public/media/images/menu1.jpg`
- `public/media/images/menu2.jpg`
- `public/media/images/renace-qr-tv.png`
- `public/media/images/renace1.jpg`
- `public/media/images/renace2.jpg`
- `public/media/images/renace3.jpg`
- `public/media/images/renace4.png`
- `public/media/images/renace5.jpg`
- `public/media/images/renace6.jpg`
- `public/media/images/renace7.jpg`
- `public/media/images/renace8.jpg`
- `public/media/images/renace9.jpg`

Videos migrados:

- `public/media/videos/VideoCafe-tv720-v1.mp4`
- `public/media/videos/VideoMenu-tv576-v1.mp4`

Se conservan `public/media/images/logo-renace.png` como asset pequeño de interfaz y `public/media/audio/musicacoffee.mp3` como música estable. Los originales locales ignorados `VideoCafe.mp4` y `VideoMenu.mp4` no forman parte de HEAD ni de la playlist.

Después de la prueba en producción podrá eliminarse `public/media/videos/` por completo. `public/media/images/` seguirá existiendo para `logo-renace.png`, salvo que el logo se mueva a `public/assets/`.

## Cambios propuestos para la limpieza posterior

En un commit separado `Remove TV media migrated to R2`:

1. Eliminar únicamente los 17 archivos enumerados arriba.
2. Mantener temporalmente `media.json` como fallback hasta retirar formalmente la transición.
3. Añadir a `.gitignore` reglas para `public/media/images/*` y `public/media/videos/*`, con una excepción explícita para `public/media/images/logo-renace.png`.
4. Crear `public/.assetsignore` cuando se retire el fallback, ignorando `/media/videos/` y las imágenes promocionales. Si se mueve el logo a `/assets/`, podrá ignorarse `/media/images/` completo.
5. No usar filter-repo, BFG, force-push ni reescritura de historial.

## Pasos propuestos para el despliegue final

1. Revisar esta rama, sus commits, secrets y `git diff`.
2. Crear el primer admin con el procedimiento anterior y cerrar bootstrap inmediatamente.
3. Desplegar inicialmente con admin habilitado y R2 del reproductor apagado.
4. Probar login, upload, preview, activar/desactivar, ordenar, eliminar, cuota y logout desde celular/tablet.
5. En una ventana controlada, activar R2 para el reproductor y desplegar.
6. En la Fire TV física, comprobar 15 imágenes, 2 videos completos, música, fullscreen, control remoto, transiciones y preparación offline.
7. Simular una falla de D1 en una vista previa para reconfirmar el fallback antes de retirar `media.json`.
8. Mantener los archivos del repo durante un periodo de observación.
9. Solo con aprobación posterior, hacer el commit separado de limpieza de medios.

## Riesgos pendientes

- Cloudflare Workers limita el tamaño de las solicitudes; el sistema fija 95 MiB por archivo. Para videos mayores se necesitaría subida multipart/directa controlada.
- MP4 describe un contenedor, no garantiza un codec compatible con Fire TV. No existe conversión FFmpeg dentro del Worker.
- La eliminación de R2 y D1 no es una transacción distribuida. Se marca `deleting` antes de borrar y se excluye de playlist para evitar contenido inconsistente; un fallo extraordinario después del borrado R2 puede requerir reconciliación manual.
- El modo offline depende de la cuota disponible en cada dispositivo y requiere preparación manual.
