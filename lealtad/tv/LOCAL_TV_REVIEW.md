# Renace TV + Santofé TV — revisión local

## Arquitectura y alcance

Renace utiliza un Worker ES modules, D1 `TV_DB` para cuentas/sesiones/biblioteca/auditoría y R2 `MEDIA_BUCKET` para archivos. La configuración versionada conserva `renace-cafe-tv`, D1 `f6b22318-7594-498f-87da-aa72772936e9`, bucket `renace-cafe-tv-media` y su dominio. No se consultaron ni modificaron esos recursos remotos.

`public/assets/tv.js` conserva el reproductor: fotos, videos MP4 completos, selecciones, bucle, fades, watchdog, pantalla completa, teclado, música, Spotify y preparación sin conexión. No existía autoarranque al abrir la página: se inicia con Reproducir todo/selección. No se añadió una introducción obligatoria.

Un mismo código frontend/backend sirve a ambas marcas, con compilación determinista de Santofé (`scripts/build-tv.mjs`). No hay una segunda copia mantenida manualmente. Santofé reutiliza su logo original desde Lealtad **solo en lectura** y su propia hoja de tema. Los builds no copian fotografías, música, usuarios ni datos de Renace.

La separación de datos se realiza por despliegue y bindings independientes, no por un `business_id` enviado por el navegador. Santofé usa `TV_SITE=santofe`, cookie `santofe_tv_session`, almacenamiento local y cachés propios. Renace mantiene `renace_tv_session`. Cookies host-only, HttpOnly, SameSite Strict, HTTPS Secure. Las escrituras requieren sesión activa y Origin exacto, incluso entre puertos locales. No se cambiaron credenciales existentes.

## Duraciones

- Predeterminado existente: **10 segundos**, conservado. `NULL` sigue usando el valor de `media.json`.
- Cada foto puede guardar **1–300 segundos enteros**. El rango cubre diapositivas rápidas y avisos de cinco minutos; rechaza cero, negativos, decimales y strings.
- Controles en Inicio. Lectura pública de duraciones; edición mediante el login administrativo existente, en el mismo lugar. Las fotos inactivas también se pueden editar tras autenticarse.
- Endpoint protegido: `PATCH /admin/api/content/:id/duration` con `durationSeconds` y `revision`.
- `D1.batch`: actualización condicional por revisión + auditoría dependiente de `changes()`. Conflicto: 409. Fallo de auditoría: rollback de toda la operación. No cambia otros archivos.
- Migración **0002_photo_duration.sql**, aplicada únicamente a las dos bases locales ficticias: columnas nullable `duration_seconds` y `duration_revision`. La lectura pública sigue funcionando con el esquema anterior. Guardar duraciones requiere la migración; si falta, devuelve error humano, sin escrituras parciales.
- Los videos no tienen selector ni timer de imagen. Avanzan por `ended`; se conservan los mecanismos existentes de recuperación por error/atasco.
- Antes solo existía “Actualizar contenido”. Se mantiene y se añade consulta cada 30 segundos, una solicitud en curso, y al recuperar conexión/visibilidad. Dos solicitudes de playlist por minuto por pantalla visible; ahora cada respuesta usa una lectura D1 de biblioteca y una consulta agregada de capacidad. La barra viaja en esa misma respuesta, sin polling público adicional ni consultas por foto. Si solo cambia el consumo, la biblioteca no se reconstruye ni pierde el foco.
- El contenido actual sano no reinicia por un cambio de duración: esa foto termina con su tiempo anterior y el nuevo se aplica en su próxima aparición. Si se elimina/desactiva el contenido actual, se libera y avanza. Los errores de red conservan la última lista utilizable. Las selecciones parciales no agregan medios nuevos automáticamente; “Reproducir todo” sí.
- Sin conexión se usa la biblioteca preparada previamente. Para actualizar esa copia persistente hay que volver a pulsar “Preparar sin conexión”. No prometer sincronización entre dispositivos desconectados.

## Orientación y giro

`Automática` ocupa el viewport efectivo, `Horizontal` encuadra 16:9 y `Vertical` 9:16. Las barras negras en otras proporciones son intencionadas: no se estira ni recorta el archivo. El ajuste `contain` de la biblioteca administrada se conserva.

Giro 0°, +90° y −90° centrado con dimensiones intercambiadas antes de rotar. Se rota solo la superficie multimedia, nunca administración ni formularios. No se cambia la señal HDMI ni se fuerza la orientación del sistema operativo.

Persistencia por navegador: `renace-tv-display` y `santofe-tv-display`. Si el almacenamiento falta, está bloqueado o contiene valores inválidos: automática y sin giro. Dos navegadores/TVs independientes conservan elecciones diferentes. Las pestañas del mismo navegador pertenecen al mismo dispositivo.

Fullscreen conserva la elección y recalcula dimensiones. Escape/Atrás según el navegador y doble toque/clic devuelven a Inicio; flechas cambian medio. Se conserva la presentación limpia, sin botones encima del contenido. Si fullscreen es rechazado, el contenedor ocupa la ventana. La compatibilidad real de Atrás/teclado virtual depende de Fire TV y debe validarse físicamente.

## Demos reproducibles

Desde `lealtad/tv`, con Node y pnpm en PATH:

```powershell
node scripts/demo-local.mjs renace setup
node scripts/demo-local.mjs santofe setup
# Una terminal por demo:
pnpm run demo:renace
pnpm run demo:santofe
```

- Renace: http://127.0.0.1:8791/
- Santofé: http://127.0.0.1:8792/
- Administración en `/admin`; duración editable directamente desde Inicio.
- Cuentas **exclusivamente ficticias/locales**: `demo_renace` / `Demo-renace-TV-2026!` y `demo_santofe` / `Demo-santofe-TV-2026!`. No publicar ni reutilizar como credenciales reales.
- `.local-tv/{marca}/state` contiene cada D1/R2 local independiente. `.build/{marca}` contiene assets/configuración generada. Ambos directorios están ignorados por Git.
- Los configs generados están nombrados `*-local-only`, con UUID de muestra, `remote:false`, sin rutas y sin workers.dev. **No sirven para publicar.**
- `setup` no reinicia una base existente: aplica solo migraciones locales pendientes y crea el administrador ficticio si no existe. No ejecutarlo contra recursos productivos.
- Para generar contenido ficticio, definir `TV_FFMPEG` con un ejecutable local de ffmpeg y ejecutar `node scripts/seed-demo-media.mjs` con ambas demos iniciadas. Utiliza Playwright local y sube únicamente a puertos 8791/8792.

## Verificación

La suite histórica requiere el servidor de regresión en 8790, usando `public` original y `R2_MEDIA_ENABLED=false`. Es almacenamiento local, no D1 remota:

```powershell
pnpm exec wrangler dev --local --ip 127.0.0.1 --port 8790 --persist-to .local-tv/legacy-tests --var R2_MEDIA_ENABLED:false --var TV_BOOTSTRAP_ENABLED:false
pnpm test
pnpm run check
git diff --check
```

Las pruebas nuevas usan además ambas demos ya inicializadas. Resoluciones: 1920×1080, 1280×720, 1080×1920, 720×1280, 1180×820 y 390×844, con Chromium/Edge y WebKit. Son pruebas de navegador, **no** certificados de compatibilidad física Fire TV ni una prueba de reproducción durante varias horas. Se cubren timers, secuencias, final natural de video, eliminación, recuperación por fallo, offline, persistencia, conflictos, permisos y separación.

## Publicación futura — NO ejecutada

1. Aprobación visual y prueba de TV/Fire TV/mando físicos, incluyendo montaje de lado, audio, suspensión y varias horas en bucle.
2. Respaldar y verificar D1 de Renace TV, exportar inventario/R2/configuración y conservar versión Worker + assets. Nunca usar D1 de Lealtad.
3. En una ventana autorizada, aplicar 0002 a Renace TV. Publicar su Worker y assets juntos. Probar lectura, tiempos, login y reproducción con contenido autorizado. El nuevo código puede leer el esquema antiguo, pero no editar duraciones sin 0002.
4. Crear recursos independientes propuestos: Worker `santofe-tv`, D1 `santofe-tv`, R2 `santofe-tv-media`. Verificar sus nuevos UUID y crear un config productivo independiente, sin importar `.local-tv`, fixtures ni cuentas demo. Aplicar 0001 y 0002 a esa nueva D1 exclusivamente.
5. Crear su administrador real mediante el procedimiento seguro ya existente, con credenciales nuevas y bootstrap desactivado después. Nunca copiar cuentas/sesiones de Renace o Lealtad.
6. Crear dominio `santofetv.haloswebs.com` solo después de autorización. Publicar el build Santofé con `TV_SITE=santofe` y sus propios bindings. Probar aislamiento entre dominios y escrituras no autorizadas.
7. El push al repositorio puede activar GitHub Pages; revisar su alcance antes. Pages por sí solo no publica estos endpoints ni los assets de un Worker. No usar el config local para deploy.
8. Rollback: restaurar versión previa del Worker y assets de la marca afectada. La migración aditiva puede quedarse: la versión anterior ignora las columnas. No revertir/restaurar toda D1 como primera opción ni borrar medios. Para Santofé, detener/revertir solo su despliegue. Conservar evidencias y restaurar selectivamente únicamente si hubiera daño verificado.

No se realizó commit, push, deploy, DNS, backup remoto ni cambio productivo. Lealtad y Hermanitos quedan fuera de este trabajo.

## Ampliación local: cuota independiente de 1 GB

El esquema original definía **5.000.000.000 bytes (GB decimales)** en `settings`; no eran 5 GiB ni un texto puramente visual. `validateUploadMetadata` validaba la cuota y un batch D1 impedía registrar medios por encima del límite. Sin embargo, R2 se escribía antes del batch y el tamaño binario se confiaba parcialmente a las cabeceras.

La migración local **0003_independent_1gb.sql** conserva 0001/0002 y todos los medios. Fija `storage_limit_bytes=1.000.000.000`, recalcula el contador cacheado a partir de metadatos existentes e incorpora `upload_intents`. No borra ni desactiva medios, incluso con más de 1 GB. Antes de aplicarla en producción deberá revisarse el inventario R2/D1 para confirmar tamaños reales.

El backend usa la suma de tamaños de **todos** los medios registrados (activos, inactivos, seleccionados o no, y eliminaciones no confirmadas), más reservas pendientes, para autorizar nuevas cargas. Una reserva se obtiene mediante una sola sentencia condicional D1, antes de guardar el objeto. Dos administradores compiten por esa misma capacidad. El consumo se deriva de filas persistentes; `settings.used_bytes` también se actualiza en el batch de confirmación o eliminación.

La subida verifica firma y límite por archivo; cuenta el stream y rechaza longitudes falsas, truncadas, canceladas o superiores a lo permitido. Tras el PUT verifica el tamaño definitivo con R2 HEAD. Solo entonces un batch confirma medio/contador y libera la reserva. Los nombres repetidos generan IDs y objetos diferentes, por lo que ambos consumen espacio. No existe reemplazo in-place en esta aplicación: reemplazar implica subir el nuevo archivo y retirar el anterior; ambos cuentan mientras existan. No se añadió un endpoint de reemplazo.

La prueba con workerd local detectó que un ReadableStream genérico no satisface el contrato de longitud de R2. Se conserva la medición del stream y se conecta a `FixedLengthStream(size)` antes del PUT, esperando también la finalización de la tubería. No se volvió a confiar ciegamente en la cabecera ni a cargar el archivo completo en memoria. Referencia oficial: https://developers.cloudflare.com/workers/runtime-apis/streams/transformstream/#fixedlengthstream

Al fallar una carga conocida se retira exclusivamente su objeto no publicado y se libera su reserva después de confirmar su ausencia. Si R2/D1 no permiten confirmar la limpieza, la reserva queda contada. Las cargas nuevas reintentan esas limpiezas conocidas. Un error ambiguo después de commit verifica antes si existe el medio y nunca borra su archivo confirmado.

**Interrupción abrupta del Worker:** D1 y R2 no forman una transacción distribuida. Un proceso terminado puede dejar un intent `uploading` sin respuesta. Se identifica como obsoleto tras una hora en la reconciliación y continúa contado. No se libera automáticamente por reloj ni se elimina un objeto de origen incierto. Requiere revisión administrativa y recuperación selectiva del intent/objeto, con autorización en una futura operación productiva. Esta limitación evita ocultar bytes reales o borrar contenido válido; no debe confundirse con una reserva fallida conocida, cuyo reintento ya existe.

Herramientas protegidas (sesión y permisos actuales, Origin exacto en escrituras):

- `GET /admin/api/storage`: contador de la propia D1, sin listar R2.
- `GET /admin/api/storage/reconcile`: inspección **solo lectura** de metadatos y objetos R2 paginados. Devuelve conteos de objetos ausentes, tamaños distintos, huérfanos y subidas pendientes/obsoletas; no devuelve nombres, claves ni credenciales. Ejecutar en una ventana sin subidas para evitar observaciones intermedias. No se invoca en cada carga de página.
- `POST /admin/api/storage/cleanup`: reintenta únicamente objetos no publicados ya marcados `cleanup`; no elimina huérfanos desconocidos ni medios activos/inactivos.

Los objetos creados fuera de la aplicación no se pueden conocer sin inventariar R2. La herramienta los detecta sin borrarlos. Una reconciliación con diferencias bloquea la recomendación de publicación hasta revisar y resolver selectivamente el origen; no se declara que el contador de metadatos prueba por sí solo la integridad del bucket.

La barra principal es compacta y muestra consumo, máximo, disponible y porcentaje. Los datos viajan en `/playlist.json`. Administración reutiliza el mismo render y refresca un agregado cada 30 segundos cuando está visible, al reconectar y después de subir/eliminar. No mantiene un inventario completo del bucket por recarga. Sin conexión se identifica la última lectura guardada; ante falta de datos no inventa un cero. Los archivos superiores al nuevo máximo permanecen reproducibles y eliminables; solo se impiden cargas que aumenten el consumo.

**Cuota lógica y Cloudflare:** 1 GB es la política de esta aplicación por cafetería. No crea una partición física, no cambia contratos ni garantiza una factura fija. El uso/costo real de R2, operaciones y demás servicios depende de los recursos y de la cuenta Cloudflare. Esta implementación no consultó precios ni modificó facturación.

Publicación futura: además de 0002, respaldar D1/R2 y reconciliar antes de aplicar 0003. Si hay más de 1 GB, conservarlo y comunicar el bloqueo de nuevas cargas. Crear recursos Santofé propios, aplicar sus migraciones y usar credenciales nuevas. Para rollback del Worker anterior, conservar las columnas/tablas aditivas y la cuota en 1 GB: el Worker previo también valida `storage_limit_bytes`; no volver a 5 GB silenciosamente ni restaurar toda D1. Revisar cualquier intent pendiente antes de volver al flujo de subidas anterior.

## Diagnóstico de WebKit

El archivo ficticio vertical se verificó con ffprobe: 360×640, píxel 1:1, relación 9:16, duración 6 segundos. WebKit de este entorno reportó distintas dimensiones intrínsecas (405×720 y previamente 720×1280); en ambos casos mantiene 9:16. La prueba inicial exigía 360×640 literal y falló. Tras reproducirlo y verificar archivo, duración y geometría, la prueba comprueba proporción 9:16, dimensiones positivas, duración y transformaciones. No se cambió el reproductor ni el archivo para ocultar la diferencia. Sigue pendiente la prueba en Safari/Fire TV físicos.

El comando diagnóstico que no pudo ejecutarse en la sesión anterior fue rechazado porque la revisión automática agotó su cuota; no fue una determinación de inseguridad y no se ejecutó. Se retomó por la vía normal de aprobación, sin evadirla.

En una ejecución extensa, la prueba histórica de fotos produjo `EncodingError` al invocar `img.decode()` inmediatamente después de desplazar una miniatura lazy. La misma prueba pasó aislada sin modificar archivos multimedia. Se añadió una espera acotada de carga real (`complete` y `naturalWidth > 0`) antes de la decodificación; se conserva la llamada a `decode()` y todas las verificaciones de relación de aspecto, video, audio y navegación. La espera no convierte un archivo corrupto en una prueba aprobada: falla si no termina de cargar.
