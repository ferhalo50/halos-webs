# Presentación del sistema de lealtad

Este proyecto independiente es el sitio comercial `sistemalealtad.haloswebs.com`. No comparte backend, datos ni configuración con `lealtad/live` o Renace TV.

- `/`: portada con Ver propuesta y Descargar PDF como acciones distintas.
- `/propuesta/`: lector de cuatro páginas, renderizadas desde el PDF real con PDF.js 6.3.289 (legacy), self-hosted.
- `/assets/docs/Tarjeta_Lealtad_Digital_Cafeterias.pdf`: documento aprobado sin modificaciones.
- `/descargar-propuesta/`: descarga con `Content-Disposition: attachment`.
- `/presentacion-sistema-lealtad.pdf`: URL antigua compatible, sirve la versión actual.

## Desarrollo y publicación

Desde esta carpeta:

```sh
npm ci
npm run check
npm run dev
npm run deploy
```

El nombre del Worker es `haloswebs-sistema-lealtad-pdf`. El dominio personalizado está declarado en `wrangler.jsonc`; Wrangler lo configura al desplegar con la cuenta que administra `haloswebs.com`.

## Actualizar el documento

Reemplaza únicamente `public/assets/docs/Tarjeta_Lealtad_Digital_Cafeterias.pdf` por la versión aprobada de cuatro páginas. `npm run prepare:assets` prepara la librería, su Worker y licencias, y calcula la huella del PDF para actualizar `public/assets/document.json`. Se ejecuta antes de dev, check y deploy. Nunca publicar el XLSX.

El visor carga la librería solo en `/propuesta/`, dibuja secuencialmente las páginas a un máximo de 2× de densidad, se adapta a cambios de ancho y ofrece texto extraído para lectores de pantalla. No depende de iframe, embed ni object. El zoom del navegador permanece habilitado. La descarga solicita guardar el archivo; iOS/Safari puede mostrar su propio flujo de vista/compartir/guardar.

No hay PWA ni Service Worker. HTML, CSS, visor y PDF se revalidan; las URLs versionadas de PDF.js son inmutables. El documento incorpora una huella en su URL. CSP solo permite recursos propios; no permite eval ni scripts inline/externos. El visor desactiva evaluación dinámica y WebAssembly. HTTP del dominio comercial redirige con 308 a HTTPS; HTTPS envía HSTS. Las rutas no públicas y métodos de escritura se rechazan.

Publicar únicamente desde esta carpeta con `npm run deploy`. No cambiar rutas de Cloudflare ni DNS: el dominio existente permanece en `wrangler.jsonc`. Para rollback usar `wrangler rollback <version-id>` del mismo Worker, con la versión previa registrada antes de publicar.
