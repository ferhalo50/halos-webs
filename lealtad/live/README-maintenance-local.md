# Mantenimiento y cutover (preparación local; no autorización para publicar)

`MAINTENANCE_MODE=OFF` conserva el comportamiento normal. `ON` bloquea todas
las APIs antes de resolver el tenant, leer sesión o acceder a D1. La configuración
normal es explícitamente `OFF`; si falta la variable se conserva compatibilidad.
Cualquier otro valor, incluido vacío, activa mantenimiento por seguridad.
La comparación admite espacios y minúsculas.

## Garantías

- Todos los métodos de `/api`, `/api/*` y `/renace/api/*` reciben HTTP 503,
  `{ok:false,error:{code:"maintenance",message:"…"}}`, `Retry-After: 300` y
  `Cache-Control: no-store`. No se modifica la cookie ni se lee D1.
- No hay bypass por header, secreto de bootstrap, rol o cuerpo de solicitud.
- HTML, CSS, JS, logos, manifest y service worker permanecen disponibles.
- `scheduled` sale antes de crear tareas D1; el cron sigue configurado.
- El frontend conserva la sesión y formularios, muestra el aviso ES/EN y pausa
  el polling. Reintentar es manual; recargar también recupera el servicio.
- La bandera no cancela solicitudes/cron que ya comenzaron en otra versión.
  No demuestra por sí sola que se drenaron todas las operaciones anteriores.

## Ensayo exclusivamente local

Las pruebas de `test/maintenance.test.mjs` usan SQLite en memoria y HTTP loopback.
Las pruebas existentes utilizan únicamente las cuatro bases ficticias locales.
El ensayo sobre copia de producción y sus reportes quedan fuera de Git, en
`Documents/Codex/production-prep-2026-10-01/maintenance/`.
Nunca servir esa copia por LAN/túnel ni publicar sus archivos o datos privados.

## Orden futuro propuesto — NO ejecutado

1. Obtener autorización expresa para commit/push/deploy, migración 0013 y las
   escrituras de configuración aprobadas. Repetir preflight y registrar versión
   activa/deployment al 100%, configuración, backup/bookmark y plan de reversión.
2. Tomar backup preliminar fresco. Publicar el Worker nuevo **con ON explícito**
   sobre schema antiguo, sin split de versiones. Esto ya es seguro por la
   guardia temprana; no hace falta un puente distinto con lógica antigua.
3. Confirmar 503 en todos los hosts/métodos, assets 200 y cron suspendido.
   Drenar solicitudes y jobs de la versión anterior usando trazas de finalización
   y observación de actividad. Si no puede confirmarse el drenaje, detenerse:
   un 503 aislado o esperar unos segundos no prueba cero operaciones en vuelo.
4. Tomar **backup/bookmark definitivo después del drenaje**, antes de 0013.
   El preliminar puede no incluir las últimas operaciones aceptadas.
5. Aplicar solo 0013; validar con SELECT schema, triggers, integridad, saldos,
   QR, sesiones y actividad. No inferir recompensas desde canjes históricos.
6. Confirmar mismo Worker final al 100%, todavía ON. Toda publicación adicional
   durante el corte debe conservar ON explícito: no usar accidentalmente el
   valor OFF del archivo normal. Smoke de assets/PWA, 503 y controles de schema.
   No hay bypass autenticado durante mantenimiento.
7. Con Worker/schema verificados y autorización vigente, cambiar a OFF como
   acción separada. Confirmar APIs normales; recargar las pantallas de equipo.
   Clientes antiguos no incluyen revision/operationId: el backend los rechaza
   de forma segura, pero empleados deben cargar el cliente actualizado.
8. Smoke real no destructivo de las tres cafeterías. No usar login/cookies
   reales si la verificación debe ser cero escrituras D1: autenticación puede
   crear/renovar sesiones incluso mediante GET. Las operaciones funcionales se
   validaron previamente en copia local. Monitorear errores y actividad.
9. Vainilla es una activación separada, todavía pendiente de autorización:
   preparar credenciales de forma segura, crear su business autorizado, habilitar
   hostname/routing y DNS/custom domain únicamente en esa fase. Crear Admin y
   Mostrador con el flujo existente `POST /api/setup` y un secreto de bootstrap
   temporal. ON también bloquea setup: no introducir bypass para aprovisionarlo.
   El endpoint ya valida el business, impide setup repetido, cifra ambas claves
   con PBKDF2 y crea los dos roles en batch. Mantener los secretos solo en memoria/
   entrada oculta, no en argumentos, archivos versionados ni logs; retirar el
   secreto temporal al terminar. Verificar HTTPS/PWA y aislamiento. No reutilizar
   fixtures ni publicar el hostname mientras `localOnly` siga activo.

La futura publicación debe emplear el procedimiento de deploy existente y un
override explícito ON; la reapertura utiliza un override explícito OFF. Estas
instrucciones no ejecutan ni autorizan comandos remotos.

## Rollback

Antes de 0013: mantener bloqueo y volver a la versión anterior; no hace falta
restaurar D1 si no hubo cambios. Después de 0013, antes de nuevas operaciones:
mantener el Worker nuevo ON, restaurar D1 al snapshot definitivo y verificar
schema/datos mientras la guardia sigue activa. La versión antigua publicada no
reconoce esta bandera: volver a ese Worker equivale a reabrir y debe ser el último
paso, después de verificar la restauración y compatibilidad OLD/OLD en copia.
No suponer que configurar ON en la versión antigua la bloquea. OLD/NEW y NEW/OLD con OFF siguen
siendo incompatibles. No restaurar únicamente el Worker.

Después de cualquier operación aceptada con el nuevo schema —incluidas sesiones
y aprovisionamiento— un backup anterior pierde información posterior. Activar
ON, preservar un snapshot actual, preferir recuperación hacia adelante/versiones
compatibles y definir reconciliación con autorización explícita. No restauración
automática ni down-migration improvisado; nunca importar el dump sobre una base
ocupada como si fuese un parche.

Los tiempos del ensayo son locales. La activación en proceso, SQLite y el arranque
local de workerd no estiman propagación, backup o ventana real de Cloudflare.
