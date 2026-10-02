# Presentación del sistema de TV promocional

Sitio comercial independiente: `https://sistematv.haloswebs.com/`. Reutiliza el patrón de la página de Lealtad, sin modificar ese proyecto, el reproductor de Renace TV ni los sistemas de las cafeterías. No tiene bases de datos, cuentas ni bindings D1/R2.

- `/`: información de TV y oferta de primer mes gratis; $150 MXN mensuales desde el segundo mes.
- `/propuesta/`: visor interno de las cuatro páginas del PDF aprobado, con PDF.js 6.3.289 legacy self-hosted.
- `/assets/docs/Sistema_TV_Promocional_Negocios.pdf`: PDF original sin modificaciones.
- `/descargar-propuesta/`: descarga explícita con `Content-Disposition: attachment`.
- `/presentacion-sistema-tv.pdf`: acceso directo adicional al documento.

## Desarrollo y publicación

Desde esta carpeta:

```sh
npm ci
npm run check
npm run dev
npm run deploy
```

El Worker `haloswebs-sistema-tv-pdf` es exclusivo del sitio comercial. El custom domain `sistematv.haloswebs.com` está declarado en `wrangler.jsonc`; Wrangler configura el dominio al desplegar con la cuenta que administra la zona. No desplegar ningún otro proyecto.

## Documento y seguridad

La fuente editable XLSX se mantiene fuera del sitio y no se publica. Para actualizar el PDF, sustituir el archivo aprobado en `public/assets/docs/` y ejecutar `npm run prepare:assets`. Este paso prepara la biblioteca, Worker y licencias, y genera la huella del documento; se ejecuta antes de dev, check y deploy.

Ver propuesta abre HTML; la librería se carga solo en el visor y renderiza el PDF real. No depende del visor nativo, iframe, embed ni object. Incluye texto accesible, estado de carga, fallback de descarga, densidad limitada y ajuste al ancho disponible. El zoom del navegador permanece permitido. iOS/Safari puede utilizar su propio flujo de guardar/compartir al descargar.

CSP restringida a recursos propios, sin eval ni scripts inline. HTTP redirige con 308 a HTTPS; HTTPS envía HSTS. HTML usa no-transform para evitar inyección de analítica externa. No hay PWA ni Service Worker. HTML/PDF/configuración se revalidan; las URLs de PDF.js versionadas son inmutables. Solo GET/HEAD y rutas públicas explícitas.

Para rollback de futuras actualizaciones, registrar la versión anterior y usar `wrangler rollback <version-id>` únicamente en este Worker. En la primera publicación no existe una versión anterior de este sitio.
