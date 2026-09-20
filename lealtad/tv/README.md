# Renace Café TV

Aplicación independiente para reproducir imágenes, videos y música ambiental en la televisión del establecimiento. Se publica como un Worker estático separado en `https://renacecafetv.haloswebs.com/`; no usa D1, cuentas ni datos de Renace Card.

## Contenido

La lista se administra en `public/media.json`. Cada elemento necesita un `id`, `name`, `type` (`image` o `video`) y `source`; `thumbnail` es opcional. Las imágenes admitidas son JPG, JPEG, PNG y WEBP. Los videos deben ser MP4 aptos para reproducción web. `slideDurationSeconds` controla la duración de las imágenes y `music` puede apuntar a un MP3 local.

Los archivos se colocan en:

- `public/media/images/`
- `public/media/videos/`
- `public/media/audio/`

Al cambiar contenido, actualiza también `version` en `media.json`. El botón **Preparar sin conexión** descarga únicamente la selección actual o toda la biblioteca si no hay selección. El caché anterior se elimina después de terminar correctamente la nueva preparación.

## Ejecución y pruebas

1. Instala dependencias con `pnpm install`.
2. Ejecuta `pnpm run dev` y abre `http://127.0.0.1:8790/`.
3. Ejecuta `pnpm run check` y, con el servidor activo, `pnpm test`.

El caché usa nombres exclusivos `renace-tv-*` y además vive en el origen propio de TV, por lo que no interfiere con el service worker de la tarjeta de lealtad.

## Almacenamiento futuro

Para una primera presentación basta con archivos pequeños dentro del repositorio. Si la biblioteca crece, los valores `source` y `thumbnail` de `media.json` pueden cambiarse por URLs de Cloudflare R2. En ese momento habrá que configurar CORS para el subdominio de TV y añadir el dominio de R2 a la política `img-src`, `media-src` y `connect-src` del Worker. No hay bucket ni servicio de pago configurado en esta fase.
