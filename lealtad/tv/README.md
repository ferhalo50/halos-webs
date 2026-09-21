# Renace Café TV

Pantalla independiente en `https://renacecafetv.haloswebs.com/`, sin D1, cuentas, R2 ni servicios de pago adicionales.

## Biblioteca de demostración

Las 9 fotografías, 3 videos y `musicacoffee.mp3` actuales son **material temporal para demostrar el sistema**. Pueden sustituirse por el contenido definitivo del negocio sin cambiar el reproductor.

`public/media.json` contiene `version`, `slideDurationSeconds` (10), `music` y `items`. Cada elemento tiene `id`, `name`, `type` (`image` o `video`), `source`, y opcionalmente `thumbnail` y `fit`. Solo se reproduce lo declarado en `items`; no se exploran carpetas automáticamente.

- Fotos: `public/media/images/`. JPG/JPEG, PNG o WEBP.
- Videos para web: `public/media/videos/web/`. MP4 con H.264, píxeles yuv420p y audio AAC.
- Música: `public/media/audio/musicacoffee.mp3`.
- `logo-renace.png` se conserva como recurso de identidad y no forma parte de la lista. Los videos sin miniatura real muestran una tarjeta VIDEO con su nombre.
- `renace-qr.png` es un cartel de acceso a la tarjeta de lealtad. Se conserva en la carpeta, fuera de la lista automática; puede añadirse intencionalmente para una campaña.

Los tres originales `.mp4` usan MPEG-4 Part 2 (`mp4v`), que no produjo fotogramas en el navegador de prueba. Se conservaron intactos y se crearon copias H.264 en `videos/web/`. `public/.assetsignore` excluye los originales del despliegue del Worker para no duplicar la transferencia. No basta con renombrar una extensión para cambiar el códec.

### Sustituir medios

1. Copia el archivo definitivo en la carpeta correspondiente. Para MP4 utiliza H.264/AAC y comprueba reproducción real antes de publicar.
2. Actualiza `source`, nombre y miniatura opcional en `media.json`. Preferir un nombre de archivo nuevo cuando cambie el contenido.
3. Mantén `fit: "contain"` para ver el contenido completo, centrado y sin deformación. El valor predeterminado es `contain`; `cover` es opcional solo en presentación y recorta intencionalmente. Las miniaturas siempre muestran la imagen completa.
4. Incrementa `version` y ejecuta las pruebas antes de desplegar.
5. En cada TV, recarga conectado y pulsa nuevamente **Preparar sin conexión**.

No se necesitan cambios en Renace Card para actualizar esta biblioteca.

## Uso y música

Selecciona tarjetas o usa **Reproducir todo**. Las imágenes duran 10 segundos; cada video termina antes de avanzar. La lista vuelve al principio. La presentación tiene fondo negro, respeta las proporciones y solicita pantalla completa al iniciarse; si el navegador la rechaza, continúa como una vista que ocupa la ventana.

**Música ambiental · Encendida / Apagada** inicia o pausa el MP3 después de un clic o pulsación. Reproduce en bucle, conserva su posición al pausarse y continúa entre fotos y videos. Los videos empiezan silenciados. Flechas: navegación en biblioteca; izquierda/derecha: elemento anterior/siguiente; Enter: activar en biblioteca; Escape o salir del fullscreen con Atrás: volver a la biblioteca. La presentación no muestra controles; en pantallas táctiles puedes salir con doble toque.

## Sin conexión

Al abrir la página solo se prepara la interfaz; no se descargan automáticamente todos los videos. **Preparar sin conexión** guarda la selección o toda la biblioteca si no hay selección, además de la música. Muestra avance y errores de espacio/conexión. Sin conexión, la biblioteca muestra únicamente la lista preparada.

La descarga se prepara en un caché nuevo y solo sustituye el anterior cuando termina correctamente. Un fallo conserva la versión anterior. Se soportan peticiones parciales de video/audio. Los cachés `renace-tv-*` están aislados por origen de Renace Card y no eliminan cachés ajenos. Para cambiar código de la interfaz, incrementar también `SHELL_CACHE` en `service-worker.js`.

El almacenamiento local depende del espacio y las políticas del navegador; puede borrarse al limpiar sus datos. Antes de la demostración prepara el contenido en el dispositivo que usarás y verifica que abre al desconectar internet. No es una copia de seguridad permanente.

## Desarrollo y pruebas

`pnpm install`, `pnpm run dev` (puerto 8790), `pnpm run check` y `pnpm test`.

Las pruebas usan los medios reales de `media.json`: rutas, decodificación de imágenes, fotogramas de cada MP4, música, secuencias de fotos/videos/mixtas, bucle, pantalla completa y alternativa, teclado, 1920×1080, móvil, descarga offline, recarga offline, lectura parcial y reemplazo seguro de caché. Para acortar el ensayo de videos, se reproduce el MP4 real a velocidad aumentada y se espera su evento real de finalización (sin simularlo). No se reemplaza la reproducción con archivos ficticios.

Queda una comprobación física en Amazon Silk/Fire TV para el mando Atrás y la capacidad del dispositivo, y en teléfonos para las particularidades del navegador. Las pruebas de escritorio no certifican esos equipos.

## Almacenamiento futuro

Las rutas `source` y `thumbnail` pueden apuntar posteriormente a R2. Requerirá configurar CORS y permitir ese origen en `img-src`, `media-src` y `connect-src`. Esta versión no activa R2 ni otros servicios de pago.


## Compatibilidad y presentación limpia (septiembre 2026)

Los originales `renacevideo1.mp4`, `renacevideo2.mp4` y `videocoffee.mp4` usan MPEG-4 Part 2 (`mp4v`) y pueden verse negros en navegadores. Las primeras copias `*-h264.mp4` eran AVC High nivel 4.0. Las variantes actuales `*-tv720-v2.mp4` usan **H.264 Constrained Baseline nivel 3.1, yuv420p, 1280×720, 30 FPS**, AAC-LC estéreo 44.1 kHz y faststart. Ocupan alrededor de 9.05 MB en total. Se conservan todos los archivos anteriores; `.assetsignore` excluye originales y variantes anteriores de la publicación para no duplicar descargas. Solo se reproduce lo declarado en `media.json`, versión `2026.09.21-1`; fotos de 10 segundos, material DEMO.

`docs/video-diagnostics.json` contiene contenedor, codec/tag, perfil/nivel cuando AVC, resolución, FPS, bitrate, audio, frecuencia/canales y duración de los nueve archivos. No había `ffprobe` en PATH. El diagnóstico se hizo con el FFmpeg ya disponible y la cabecera `avcC`; no se instaló software. Los originales MPEG-4 no declaran nivel AVC. Se decodificaron por completo las tres nuevas variantes antes de cambiar la playlist. No es una garantía de compatibilidad con cada generación de Fire TV: falta repetir la prueba en el dispositivo que falló.

Comando de diagnóstico si ya se dispone de ffprobe:

```powershell
ffprobe -v error -show_entries format=format_name,duration,bit_rate:stream=codec_name,codec_tag_string,profile,level,pix_fmt,width,height,r_frame_rate,bit_rate,sample_rate,channels,duration -of json "entrada.mp4"
```

Comando de conversión recomendado, con FFmpeg existente y una salida nueva:

```powershell
ffmpeg -n -i "entrada.mp4" -map 0:v:0 -map "0:a?" -vf "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=30" -c:v libx264 -profile:v baseline -level:v 3.1 -preset medium -crf 24 -maxrate 2500k -bufsize 5000k -pix_fmt yuv420p -c:a aac -profile:a aac_low -ac 2 -ar 44100 -b:a 96k -movflags +faststart "salida-tv720.mp4"
```

En esta PC se puede sustituir `ffmpeg` por `& 'C:\Users\ferha\Documents\Codex\2026-09-13\referenced-chatgpt-conversation-this-is-an\renace-update\tools\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe'`. No es un archivo publicado ni una dependencia del sitio web.

### Pantalla, fallas y recursos

La presentación muestra exclusivamente medio y fondo negro. No hay títulos, controles ni progreso. El cambio usa 160 ms de salida y 160 ms de entrada, sin dos videos activos a la vez; con movimiento reducido no se anima. Al sustituir un medio se cancelan listeners, temporizadores y callbacks de fotogramas, se pausa el video anterior y se libera su `src`. Se quitaron los fondos con blur de la interfaz. Las imágenes y miniaturas usan contain.

Se comprueban error, metadata, canplay, fotogramas cuando la API existe y avance de reproducción. Un medio que no comienza en unos 15 segundos o se detiene durante unos 10 segundos se omite automáticamente con diagnóstico en consola y sin mensaje técnico en la presentación. Si todos los medios de la selección fallan, vuelve a biblioteca con aviso sencillo. Los navegadores sin callbacks de fotogramas usan avance de tiempo y dimensiones como respaldo; una falla de decodificación del hardware que no reporte el navegador requiere prueba física.

Salir del fullscreen mediante Atrás dispara `fullscreenchange`, libera recursos y devuelve la biblioteca. Se mantiene Escape, y doble toque/doble clic en la presentación para pantallas táctiles o navegadores sin fullscreen. No se intercepta BrowserBack/GoBack agresivamente. Flechas izquierda/derecha cambian de medio.

### Música y Spotify

Música ambiental reproduce el MP3 local en bucle tras interacción del usuario, sin reiniciarlo al cambiar foto/video. Videos muted. El botón y estado están solo en biblioteca.

“Abrir Spotify” es un enlace externo HTTPS a `https://open.spotify.com/`, en otra pestaña con `noopener noreferrer`; el sistema decide si ofrece abrir la app. No se fuerza un esquema privado ni se garantiza apertura de la app en Silk. No hay API, OAuth, SDK, iframe ni tokens. El botón pausa música ambiental para evitar sonidos superpuestos. No se garantiza que Spotify conserve el audio al regresar a Silk: depende del dispositivo y su audio focus.

Solo la selección de medios se guarda en localStorage (`renace-tv-selection`) y se filtra contra la biblioteca actual al recargar. No se inicia música automáticamente al volver y no se guarda información de Spotify. El Service Worker solo procesa recursos del propio origen; no cachea Spotify ni páginas externas. `Preparar sin conexión` conserva el procedimiento atómico, progreso y aviso por falta de espacio. Tras actualizar la versión hay que preparar de nuevo el contenido en cada TV.

### Verificaciones físicas

Probar en ambos Fire Stick: cada video, reproducción mixta prolongada, mando Atrás, pantalla sin overlays, música y regreso desde Spotify, preparación offline y recarga sin red. En Android/iPhone revisar doble toque/salida, pantalla completa y reproducción. La suite automatizada valida pantalla limpia, fades, movimiento reducido, errores, inicio bloqueado, pausa prolongada, persistencia de selección, enlace externo, medios reales y caché offline; no certifica hardware Fire TV.
