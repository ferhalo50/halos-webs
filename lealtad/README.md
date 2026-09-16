# Renace Lealtad

La aplicación real se ejecuta en Cloudflare Workers con una base D1 compartida:

- Entrada desde el sitio: `https://haloswebs.com/lealtad/renace/`
- Aplicación: `https://renacecafe.haloswebs.com/`
- Código, migraciones, pruebas y documentación técnica: [`live/`](live/)

La ruta estática de Halo's Webs redirige a la aplicación real. El prototipo anterior con datos en `localStorage` fue retirado para evitar que se confunda con la versión conectada al backend.
