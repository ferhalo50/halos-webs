# Ajustes administrativos y sincronización — preparación local

Fecha de preparación: 17 de octubre de 2026, America/Tijuana.
Revisión final: 18 de octubre de 2026, America/Tijuana.
Alcance exclusivo: `lealtad/live`. No publicación, D1 remota, credenciales
productivas, limpieza de clientes, Hermanitos, TV ni documentación comercial.

## Auditoría y cambios

Antes, `live.js` consultaba `/api/card` cada 5 segundos cuando la tarjeta del
cliente estaba visible; Mostrador conservaba su selección sin refresco periódico.
Cada consulta de tarjeta realiza dos sentencias SELECT: sesión/tenant y tarjeta
con sus subconsultas. La sesión podía actualizar `last_seen_at` cada 15 minutos.
No debe confundirse ese número de sentencias con las filas leídas facturadas por D1.

La adición administrativa múltiple ya existía en `admin-stamp-adjustment.js`:
cantidad 1–99, motivo de 5–200 caracteres, instantánea y clave de operación,
actualización relativa y un registro en `admin_audit_log`, en un `D1.batch`.
No se convierte en compra ni consume la visita diaria. Se conserva esa lógica.

`admin-card-adjustment.js` añade `remove`, `clear`, `reward_add`, `reward_remove`
y `reward_clear` al mismo endpoint `/api/admin/customers/:id/stamps`.
La vista previa del servidor está en ese endpoint seguido de `/preview`.
No se reproduce en el navegador una segunda fórmula de recompensas.

- Todos los ajustes exigen admin activo del mismo negocio, motivo, cantidad
  entera, instantánea de progreso/versión/fecha y clave de operación.
- Cantidad normal: 1–99, límite ya existente del sistema. En daily, agregar
  se limita al espacio restante; quitar se limita al progreso disponible.
- Limpiar requiere la cantidad exacta del saldo observado, nunca un clamp.
  Retirar todas las recompensas puede superar 99 si ese es el saldo completo;
  se valida como entero seguro y se confirma explícitamente.
- Las tarjetas daily completas conservan su recompensa: quitar/limpiar se
  bloquea hasta el canje. No se transforma ese premio en un contador nuevo.
- Santofé mantiene `per_item`, meta 10, normalización existente y decisiones
  obligatorias. Una adición que cruza metas usa el helper y trigger existentes.
- Solo Santofé/per_item permite ajustar `rewards_pending`. Esas operaciones
  conservan `stamps`, `reward_choices_pending` y `redeemed_count`, incluso cuando
  hay decisiones pendientes. No inventan compras ni canjes.
- Quitar/limpiar progreso no borra eventos ni anula una visita del día. La ruta
  antigua de corrección individual mantiene compatibilidad, incluido su control
  explícito de anulación, pero también protege la recompensa diaria completa.
- Actualización y auditoría están en una transacción `D1.batch`: una comparación
  fallida produce cero filas actualizadas y el guard NOT NULL aborta la auditoría
  y toda la transacción. Los triggers de recompensas también se revierten.
- Repetir una clave o una instantánea obsoleta se rechaza sin otra aplicación.
  Es protección contra repetición, no una promesa de devolver el mismo HTTP 200.
  Ante pérdida de respuesta se consulta el estado; no se reintenta una escritura
  automáticamente. La clave se conserva si se pulsa de nuevo la misma confirmación.
- Actividad y XLSX muestran cantidad, motivo y actor. Se conservan los motivos
  literales, sin traducir los datos del usuario.

El canje diario antes actualizaba el saldo e insertaba el evento en dos pasos
independientes. Ahora compra diaria y canje realizan comparación de versión,
saldo relativo y evento juntos en un batch. No cambia su regla comercial.
Los clientes antiguos sin versión/clave siguen siendo aceptados para daily;
la operación usa una instantánea actual del servidor. La UI nueva siempre envía
ambas y detecta cambios desde que se mostró la tarjeta.

## Sincronización elegida

Polling adaptativo, Page Visibility, eventos focus/online/pageshow y ETag privado.
Cada revalidación autentica sesión, rol y tenant antes de comparar el ETag.
No se guarda una tarjeta en caché compartida; las API mantienen `no-store`.
El ETag incluye la representación completa: progreso, recompensa, versión,
nombre, preferencia de sello y disponibilidad de la visita del día.

No hay nuevas tablas, conexiones persistentes, servicio de eventos ni heartbeats.
Las lecturas de `/api/card` y `/api/staff/card` ya no actualizan `last_seen_at`.
Otras acciones conservan la gestión de sesiones existente y la expiración se
valida en cada petición.

| Estrategia | Ventaja | Coste/limitación | Decisión |
|---|---|---|---|
| Polling fijo 5 s | Sencillo, compatible | 12 peticiones/minuto aunque nada cambie | Sustituido en Cliente |
| Adaptativo + visibilidad | Sin infraestructura adicional; limita trabajo en reposo | Latencia acotada por intervalo | Elegido |
| Focus/online | Recupera inmediatamente el estado | No sustituye detección mientras se trabaja | Complemento |
| Versionado/ETag | Conflictos seguros y 304 sin cuerpo | No elimina las dos SELECT por revalidación | Complemento |
| SSE | Aviso unidireccional rápido | Conexión persistente, reconexión y un origen de eventos; sondear D1 dentro no ahorra consultas | No justificado ahora |
| WebSocket/DO | Avisos rápidos y coordinación por tarjeta | Nuevo estado/infraestructura, autenticación/reconexión, costes de mensajes/conexión/almacenamiento según uso | Reevaluar si el volumen lo justifica |

Referencias: [transacciones batch D1](https://developers.cloudflare.com/d1/worker-api/d1-database/)
y [WebSocket Hibernation en Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

### Presupuesto de consultas

Valores de régimen estable; no incluyen navegación inicial ni acciones manuales.

| Escenario | Antes | Ahora |
|---|---:|---:|
| Cliente visible sin cambios | 12 HTTP/min; 24 SELECT/min | 4 HTTP/min; 8 SELECT/min |
| Mostrador con tarjeta seleccionada estable | 0 automáticas; saldo podía quedar viejo | 12 HTTP/min; 24 SELECT/min |
| Mostrador sin selección | 0 | 0 |
| Pestaña oculta / app en segundo plano detectable | 0 periódicas | 0; se aborta además la petición en vuelo |
| Pestaña/navegador cerrado | 0 | 0 |
| Escrituras de seguimiento causadas por polling | Hasta una `last_seen_at` cada 15 min | 0 |

Cliente: 5 s al inicio/después de un cambio; tras tres respuestas sin cambios,
15 s. Mostrador: 3 s inicialmente/después de un cambio y luego 5 s. Error de
conexión: 15 s; offline explícito: se suspende. Al volver a foco/online se consulta
inmediatamente, sin duplicar peticiones en vuelo.

Estimaciones de latencia (más red/servidor): Cliente 0–15 s en reposo;
Mostrador 0–5 s. No es push ni tiempo real instantáneo.
Ejemplo teórico: 100 tarjetas de cliente + 5 mostradores estables pasan de
1,200 peticiones/min a 460; de 2,400 SELECT/min a 920 (61.7% menos), incluyendo
la nueva sincronización de los mostradores. No es una medición de producción.

Mediciones locales: el test instrumentado comprobó 2 SELECT por respuesta 200
o 304, cero escrituras y conservación de `sessions.last_seen_at`. El navegador
con reloj simulado observó 4 peticiones/min de Cliente y 12 de Mostrador;
una prueba con reloj real observó aproximadamente 3 segundos hasta mostrar un
ajuste en Mostrador. Son muestras locales, no SLA ni estimaciones de coste monetario.

La interfaz actualiza las regiones de datos cambiadas y preserva selección,
cantidad, búsqueda, foco, scroll, detalles y cara QR. Pausa aplicación de cambios
durante confirmación, descarga y edición del estilo. Las respuestas de otra
selección/sesión/generación se descartan. No hay reintentos automáticos de compras.

## Migración 0015 y compatibilidad

`0015_daily_card_version.sql` crea un trigger AFTER UPDATE de `stamps` o
`redeemed_count`, limitado a negocios daily. Incrementa el `reward_version`
existente únicamente si cambió un saldo real y el escritor no incrementó ya
la versión. No añade columnas, transforma saldos ni reescribe historia.

- La actualización interna solo modifica `reward_version`: no vuelve a disparar
  el trigger de `stamps,redeemed_count`. Se prueba también con recursive_triggers=ON.
- Un UPDATE sin cambio de saldo no incrementa la versión.
- 3 → 2 → 3 incrementa dos veces: la instantánea anterior ya no sirve (caso ABA).
- Per_item conserva sus propios triggers y no recibe otro incremento de este.
- Hay una escritura interna adicional por cambio real de saldo daily, nunca por
  lectura o por paso del tiempo. Es intencional para cubrir también escritores
  antiguos durante la transición. No confundir con cero escrituras totales.
- Se prueba aplicándola sobre el esquema versionado hasta 0014 y comparando todas
  las filas antes/después: idénticas. SQLite integrity_check=ok y FK=0 errores.
- Se aplicó exclusivamente a bases ficticias locales; también con Wrangler/D1
  local. Antes de producción hay que confirmar la versión de schema remota real.

La UI y Worker nuevos requieren que 0015 esté aplicada para proteger el caso ABA
daily. Orden futuro: backup/preflight → 0015 → Worker/assets. El Worker anterior
puede seguir funcionando con ese trigger. No hace falta detener servicio por el
mero DDL; si el preflight detecta una incompatibilidad, detener la publicación.

## Publicación futura: no ejecutada

Requiere autorización separada del usuario.

1. Revisar Git/CI y archivos incluidos; registrar commit y versión/deployment
   actual del Worker `lealtad`. Verificar binding DB, nombre `sistema-lealtad`,
   UUID `9648ba79-12f2-4ae8-a1b3-22ce25b57e7c`, cuenta y dominio de cada tenant.
2. Export SQL fresco completo de esa D1 con Wrangler oficial, fuera del repo y
   de carpetas públicas, con nombre único/fecha. No reutilizar un respaldo viejo.
   Registrar tamaño >0, SHA-256 y hora; importar a SQLite temporal privada;
   comprobar tablas críticas, conteos agregados, integrity_check y foreign_key_check.
   Si hay errores o dudas, no migrar ni publicar. Registrar Time Travel si disponible.
3. SELECT remoto de schema/migraciones/triggers y conteos agregados sin PII.
   Confirmar hasta 0014, ausencia de otro trigger equivalente y ninguna migración
   ajena pendiente. No ejecutar indiscriminadamente migraciones no auditadas.
4. Aplicar solamente 0015 mediante el procedimiento de migraciones aprobado;
   comprobar trigger y conservación de datos. Publicar únicamente `lealtad/live`
   con el procedimiento existente. Push normal solo cuando esté autorizado.
5. Smoke público HTTPS/API no destructivo de los cuatro tenants; comprobar assets,
   CSP, PWA y errores Worker/D1. Flujos autenticados con fixtures locales o simulación:
   no crear clientes ni ajustes reales en producción para probar.
6. Credenciales de Santofé y limpieza son tareas posteriores independientes.

### Recuperación

Guardar la versión previa y mantener disponible el rollback oficial del Worker.
Ante regresión de código, volver a esa versión; **dejar 0015 aplicada**, porque
es aditiva y compatible con el Worker previo. No rebobinar saldos ni restaurar
D1 para solucionar un problema visual. Un eventual retiro del trigger se haría
como cambio forward-only revisado, sin decrementar versiones ni borrar historia.
Restore/Time Travel solo ante daño de datos demostrado, con nueva autorización
y considerando operaciones legítimas posteriores al backup.

## Evidencia y límites de la revisión

Pruebas nuevas: validaciones, motivos, roles, aislamiento, concurrencia, repetición,
fallo de auditoría/evento, recompensas completas, decisiones, histórico, ABA,
ETag, consultas sin escritura, desconexión, suspensión/reanudación, respuestas
tardías, doble submit, XLSX, formularios preservados y conflictos de confirmación.
Se conserva y ejecuta la suite anterior con las expectativas de la nueva UI.

Revisión de interfaz: Edge/Chromium, ES/EN, 360×800, 390×844, 412×915,
430×932, 768×1024 y escritorio. También WebKit local con tamaños iPhone/iPad.
Esto no sustituye una comprobación final opcional en los dispositivos físicos.
Capturas y logs locales se guardan fuera del repositorio, en Documents/Codex.
Los mensajes de fallo forzado en pruebas de rollback son intencionales y deben
corresponder a tests aprobados, no a errores ignorados.

No se hizo backup ni consulta de datos productivos durante esta preparación.
No se cambiaron contraseñas, cuentas ni sesiones productivas de Santofé.
No se hizo limpieza, push, deploy ni migración remota.

## Resultado de la revisión local

- `pnpm run check`: aprobado. El proyecto usa JavaScript y `node --check`;
  no tiene scripts independientes de TypeScript/typecheck ni ESLint. No se
  presenta esta comprobación de sintaxis como análisis estático de tipos.
- `pnpm test`: **125/125 aprobados**, 0 fallos, 0 omitidos, aproximadamente
  12 minutos 9 segundos. Se añadieron 24 pruebas a las 101 existentes.
- `git diff --check`: sin errores de whitespace. Git avisa de su conversión
  habitual LF/CRLF para el test de Vainilla; no es un fallo del código.
- Regresión de los cuatro tenants, QR/PNG, PWA, reglas diarias, recompensas
  de Santofé, permisos y aislamiento: aprobada en el entorno local.
- Edge/Chromium y WebKit: controles, confirmaciones y sincronización comprobados.
  Capturas revisadas: confirmación móvil MOON y escritorio Santofé, sin recortes
  ni superposición; la matriz automatizada cubre los cuatro tenants en ES/EN.
- Seguridad: controles de rol/tenant en servidor, cantidades/motivos estrictos,
  datos de usuario escapados, snapshot y clave contra repetición, rollback ante
  fallo de auditoría/evento, sesión expirada y respuestas tardías comprobados.
- Medición final con reloj real: **2,985 ms** para reflejar un cambio en Mostrador.
  Reloj simulado: Cliente 4 y Mostrador 12 consultas en 60 segundos estables.

### Incidencias resueltas sin debilitar las pruebas

El fixture de Vainilla fijaba directamente 8 flores y después enviaba la versión
anterior. Con 0015, ese cambio aumenta la versión y debe rechazarse. El test ahora
comprueba explícitamente el rechazo `card_changed`, el saldo intacto en 8 y cero
eventos; vuelve a leer la tarjeta y verifica 8 → 9 → canje → 0, con el límite
diario intacto y sin decisiones/recompensas guardadas. `rewardVersion` ahora es
un dato de concurrencia también en daily, no una recompensa per_item.

La prueba premium aún seleccionaba el antiguo control individual. Se adaptó
al selector de acción/cantidad y a la confirmación actuales, manteniendo las
comprobaciones de escáner, desconexión y actualización. Quitar progreso conserva
la visita del día. La prueba de tiempos se corrigió para instalar el reloj
simulado antes de programar la medición; no se relajaron los intervalos esperados.
La comparación visual que falló transitoriamente pasó tanto aislada como dentro
de la ejecución completa final, sin modificar esa prueba.

### Archivos de esta tanda

Modificados (14):

- `package.json`
- `public/assets/live.js`
- `public/assets/refinements.css`
- `public/assets/help.js`
- `public/assets/i18n.js`
- `public/assets/xlsx-worker.js`
- `worker/index.js`
- `worker/activity.js`
- `worker/admin-stamp-adjustment.js`
- `test/adjustments.test.mjs`
- `test/admin-multistamp.test.mjs`
- `test/premium.test.mjs`
- `test/reward-choice-fixture.mjs`
- `test/vainilla-daily.test.mjs`

Nuevos (5):

- `worker/admin-card-adjustment.js`
- `migrations/0015_daily_card_version.sql`
- `test/admin-card-adjustment.test.mjs`
- `test/card-sync-ui.test.mjs`
- `README-admin-sync-preparation.md`

Git: rama `main`, base `0610730`. Los cambios quedan sin commit para revisión;
no hay cambios ajenos entre los archivos versionados pendientes. Todo el diff
está dentro de `lealtad/live`. Evidencias y logs están fuera del repositorio;
las bases ficticias locales están ignoradas por Git.

Evidencia: `C:/Users/ferha/Documents/Codex/outputs/loyalty-admin-sync-2026-10-17/`.
Suite completa: `C:/Users/ferha/Documents/Codex/loyalty-full-final-2026-10-17.log`.
Caso reforzado de Vainilla: `C:/Users/ferha/Documents/Codex/loyalty-vainilla-final-2026-10-18.log`.

No se detectó un bloqueo local para solicitar autorización. Siguen pendientes
el preflight remoto y backup fresco, aplicar 0015 antes del Worker, publicación
y smoke posterior, todos sujetos a autorización. Las credenciales, cuenta de
Mostrador y limpieza de Santofé permanecen expresamente fuera de esta tanda.
