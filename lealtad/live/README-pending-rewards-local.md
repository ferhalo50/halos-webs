# Recompensas per_item — revisión exclusivamente local

Santofé (meta 10) y Vainilla (meta 9) separan el progreso de las bebidas gratuitas.
Renace y MOON conservan su política diaria y su ciclo anterior.

## Saldo y operaciones

`loyalty_cards.rewards_pending` es el único contador de recompensas disponibles.
No había un equivalente: `redeemed_count` guarda recompensas ya canjeadas.
`reward_version` es una revisión para detectar concurrencia, no otro saldo.

Para una compra de Q cafés **pagados**:

- total = progreso + Q
- generadas = floor(total / meta)
- progreso nuevo = total % meta
- pendientes nuevos = pendientes + generadas

Vainilla: 8 + 4 = 3/9 y 1 pendiente; 8 + 19 = 0/9 y 3 pendientes.
Santofé: 8 + 5 = 3/10 y 1 pendiente.
Se permiten 1–99 cafés pagados por operación, conforme al límite existente del
campo de cantidad de auditoría. El empleado nunca incluye bebidas gratuitas en Q.

El canje explícito consume exactamente una pendiente. Mantiene el progreso,
incrementa `redeemed_count` y no crea flores/sellos.

`per_item_reward_operations` guarda la clave única de operación y la instantánea
anterior. Un trigger comprueba tenant, empleado, tarjeta, progreso, pendientes y
revisión; actualiza saldo y auditoría en la misma sentencia atómica.
Repetir la clave o confirmar una revisión vieja se rechaza sin cambios parciales.
El frontend envía `expectedVersion` y `operationId`; compras y canjes exigen revisión y clave de operación.
Cada compra deja un evento con cantidad pagada, progreso, recompensas generadas y
saldo pendiente. El canje deja un evento separado. No se duplican eventos de premio.
Los ajustes administrativos conservan su historial y normalizan una meta completa
a una recompensa pendiente; el canje no se confunde con un ajuste.

## Preparación local

Detener los cuatro servidores de desarrollo antes de ejecutar:

`node scripts/local-pending-rewards.mjs`

Este script solo puede abrir los archivos ficticios `.dev-final-renace`,
`.dev-final-moon`, `.dev-final-santofe` y `.dev-final-vainilla`. No usa red,
Wrangler, D1 remoto ni `--remote`. Vainilla también lo verifica en su arranque.
La migración local se ejecuta dentro de BEGIN IMMEDIATE/COMMIT y se revierte
completa si falla. Es idempotente mediante la presencia de la nueva columna.

La suite usa los cuatro servidores locales HTTP y conserva las pruebas anteriores,
actualizando solamente expectativas incompatibles con el nuevo modelo per_item.

## Impacto futuro en producción — no aplicado

Sí será necesaria `migrations/0013_pending_rewards.sql` antes de publicar este
backend. Añade dos columnas y una tabla de operaciones; conserva tablas, QR,
cuentas, sesiones, preferencias, canjes realizados e historial existentes.
Retira el trigger de canje automático anterior para evitar escrituras de clientes
viejos por esa vía. La actualización debe coordinar schema y backend; esta versión
no debe publicarse sola sobre el schema anterior.

Inicialización conservadora:

- Progreso per_item exactamente igual a la meta: era una recompensa actualmente
  disponible en el modelo anterior; se transforma en 0 de progreso y 1 pendiente.
- Progreso menor a la meta: se conserva y pendientes comienza en 0.
- Renace/MOON: progreso intacto; los campos nuevos no cambian su comportamiento.
- Saldos mayores a la meta requieren revisión previa. El preparador local se
  detiene ante ellos. Se requiere esa misma comprobación antes de una futura migración.

No se pueden reconstruir recompensas históricas fiables sumando eventos:
el modelo anterior registraba canjes automáticos, sin demostrar si una bebida se
entregó físicamente. No se restauran ni inventan recompensas de esos registros.
Antes de cualquier publicación deben revisarse los saldos actuales de Santofé,
aprobarse esta conversión, disponer de respaldo y acordar una ventana de cambio.
No se leyó ni escribió D1 de producción durante esta revisión.
