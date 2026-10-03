# Vainilla Coffee — política diaria y revisión local

Tenant vainillacoffee, business business_vainillacoffee, hostname vainillacoffee.haloswebs.com.
Meta de **9 flores**, política existente **daily**, máximo una flor por día calendario de America/Tijuana (no por cada 24 horas).
Una compra válida registra una visita, aunque incluya varios cafés. Mostrador no ofrece selector de cantidad; la API rechaza cantidades distintas de uno. El índice único diario impide duplicar la visita. Al día siguiente se permite otra flor.

En 9/9 el ramo permanece completo y hay una bebida gratis disponible. El canje explícito devuelve el progreso a 0/9 y aumenta redeemed_count; no añade flores ni cancela la visita del día. Vainilla no usa rewards_pending, decisiones de reward_choices_pending, guardado de recompensas ni sobrantes por cantidad. Santofé conserva esos mecanismos per_item y su meta 10 sin cambios.

No se necesita una migración: el schema instalado soporta ambas políticas. El cambio de configuración de producción y la limpieza de pruebas son acciones separadas, autorizadas y respaldadas; ninguno de estos scripts locales las ejecuta.

## Preparar y abrir

Desde lealtad/live: node scripts/vainilla-local.mjs --http.
El primer arranque copia solamente el schema local existente en .dev-final-santofe hacia .dev-final-vainilla, sin usuarios ni operaciones, e inserta el business local con daily/meta 9 si no existe. Si encuentra una configuración previa incompatible se detiene: no cambia saldos automáticamente. Nunca usa D1 remota. Los scripts no se ejecutan al desplegar.

En otra terminal: node scripts/vainilla-local-fixtures.mjs. Prepara cuentas ficticias únicamente en http://127.0.0.1:8790. Los estados 0, 3, 8 y 9/9 se preparan mediante ajustes administrativos locales con motivo; no simulan varias compras válidas del mismo día. Las cuentas existentes se conservan.

Clientes ficticios: PIN 4826, teléfonos 0000090000, 0000090003, 0000090008, 0000090009.
Mostrador local: vainilla_staff_local / Vainilla-staff-local928!.
Admin local: admin_vainilla_local / Vainilla-admin-local928!.
**No son accesos de producción.**

Para HTTPS local, detener HTTP y ejecutar pnpm run dev:vainilla. Dirección LAN https://10.0.0.9:8790/ con certificado de desarrollo.

## Verificación

La suite completa requiere servidores ficticios HTTP en 8787, 8788, 8789 y 8790.
Ejecutar pnpm run check, pnpm test y git diff --check. Los tests de Vainilla crean únicamente datos locales de prueba. La cobertura independiente en memoria de test/vainilla-daily.test.mjs incluye límite diario, día siguiente, 9/9, canje, rechazo de sobrantes y regresión de Santofé.
La UI conserva tarjeta vertical, ramo, 9 flores, ES/EN, PNG con QR decodificable, roles y responsive.

Los iconos y branding aprobados no cambian. Vainilla usa su caché vainillacoffee-shell-v14, sin alterar los caches de otras cafeterías. La instalación física y Wake Lock requieren HTTPS confiable en el dispositivo.
