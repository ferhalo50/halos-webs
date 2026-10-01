# Vainilla Coffee — revisión funcional local

Tenant `vainillacoffee`, business `business_vainillacoffee`, meta de 9 flores.
El hostname `vainillacoffee.haloswebs.com` es futuro; `localOnly` impide activarlo
como host público en el resolver. No se agregaron routes ni dominios en Wrangler.

## Preparar y abrir

Desde `lealtad/live`, ejecutar `node scripts/vainilla-local.mjs --http`.
En otra terminal, ejecutar `node scripts/vainilla-local-fixtures.mjs` una vez.
Las cuentas existentes se conservan y no se restablecen sus saldos o credenciales.
Detener el servidor HTTP y ejecutar `pnpm run dev:vainilla` para HTTPS local.
Dirección: `https://10.0.0.9:8790/` (certificado de desarrollo).

El primer arranque copia exclusivamente las definiciones del schema instalado
en `.dev-final-santofe` a una D1 nueva en `.dev-final-vainilla`. El origen se abre
en modo lectura. No copia usuarios ni operaciones y no
usa D1 remota. Inserta únicamente el business local si todavía no existe.
Si falta el schema local existente, se detiene. La migración aditiva de recompensas
se prepara exclusivamente en los archivos de prueba locales con el script descrito abajo.

## Accesos ficticios locales

Clientes: PIN `4826`, celulares `0000090000`, `0000090003`, `0000090008` y
`0000090009`, con 0, 3 y 8 flores; la cuenta terminada en 9 tiene 0 flores y una recompensa pendiente.
Mostrador: `vainilla_staff_local` / `Vainilla-staff-local928!`.
Administrador: `admin_vainilla_local` / `Vainilla-admin-local928!`.

## Regla y cruce de objetivo

Cada café pagado agrega una flor, sin límite diario. Se registran exclusivamente
cafés pagados, de 1 a 99 por operación. Cada meta de 9 genera una bebida gratis
pendiente y el sobrante continúa en un nuevo ramo. Ninguna recompensa se aplica
automáticamente. Por ejemplo, 8/9 + 4 pagados = 3/9 y 1 bebida gratis pendiente.
Canjear consume una pendiente sin cambiar las flores actuales.

El saldo persistente, la migración aditiva solo local, la atomicidad y el impacto
futuro en Santofé se documentan en README-pending-rewards-local.md.
Las cuentas de muestra creadas con 9 flores ahora tienen 0/9 y una recompensa.

## Verificación

La suite requiere los servidores locales HTTP en 8787, 8788, 8789 y 8790.
Ejecutar `pnpm run check`, `pnpm test` y `git diff --check`.
Los tests de Vainilla crean únicamente datos locales de prueba.
Los iconos se regeneran con `node scripts/vainilla-icons.mjs` mientras 8790
esté en HTTP; usan los assets aprobados dentro de la zona segura maskable.
La instalación real en Android/iOS y Wake Lock requieren un contexto HTTPS
confiable en el dispositivo; un certificado local no confiable puede impedirlos.
