# Auditoría del plan de reseñas — 9450006

22/10/2026. Codex. Lectura del plan completo y contraste con revisión v3.1,
auditoría e34c53e, `scripts/sala/db-local.mjs` y flujo actual de baja.
Commit sólo Markdown; checkout de Claude limpio; diff check sin errores.
No se ejecutó código, SQL, suite de aplicación ni consultas a Producción.

## Resultado

El contrato de baja incorpora el marcador persistente, la comprobación bajo
lock por cuenta y la reconciliación, cerrando la laguna principal de e34c53e
a nivel de diseño. No es evidencia de ejecución: hay que probarlo en E2b.

E1 (reglas puras y banco local) está suficientemente delimitada para ser la
primera entrega, cuando el dueño la autorice. No requiere E0 ni proveedor.
El resto del plan necesita correcciones concretas de cobertura y orden antes
de ejecutar base/integración. No reescribir de nuevo el diseño de producto.

## A1 — Alto: faltan tareas de interfaz para varias decisiones aprobadas

E3a/E3b enumeran funciones y rutas de servidor, no componentes cliente ni
pruebas de formulario. E5a sólo modifica el acordeón; E5b sólo detalla servidor
y Wilson; E6 no asigna la lista de reseñas del perfil. E9a declara “sin archivos
nuevos de lógica”. Por lo tanto no hay tarea que garantice el recorrido visible
completo, aunque §2 diga genéricamente “rutas, funciones y UI”.

Asignar explícitamente archivos/componentes y pruebas para:
- escribir/editar/eliminar, contador 80–600 y aceptación de términos;
- aviso de reinicio de votos, estados retenido/rechazado y pedir revisión;
- Me sirvió/No me sirvió/retirar evaluación y conteo explícito;
- cinco reseñas iniciales, orden Más útiles/Recientes y Cargar más;
- denunciar/bloquear/desbloquear, confirmación y fallos/reintentos;
- invitación al registro sin sesión, incluida ficha sin ninguna reseña;
- perfil comunitario con reseñas y agregados permitidos;
- limpieza de datos de usuario al cerrar sesión/cambiar de cuenta, accesibilidad
  y comportamiento en Android. No exponer contenido en HTML/metadata/cachés.

Criterios de cierre de UI en navegador con fixtures/local antes del cierre de
integración; no dar por implementado un recorrido porque su endpoint exista.

## A2 — Alto: dependencias y pruebas de entregas anteriores a sus funciones

E2b B8 pide un voto concurrente y una consolidación; E2c exige probar editar,
votar y suspender y verificar que cada función real siga el protocolo. Pero
las funciones reales aparecen en E3a, E4 y E7. No se puede declarar cerradas
E2b/E2c con esas pruebas antes de que existan sus dependencias.

Separar pruebas de primitivas con fixtures/helpers sólo locales de los gates
de integración sobre funciones reales. Ubicar cada caso en la primera entrega
donde todas sus funciones existen y repetirlo antes del lanzamiento. O adelantar
las primitivas reales mínimas y sus interfaces, explícitamente. No usar un helper
local como evidencia de que la ruta de producción cumple el mismo protocolo.

El script de base local actual sólo aplica schema, 001–003 y 009: no incluye
007 ni `is_admin_mfa()`. Especificar cómo se obtiene en local el helper real de
MFA y los fixtures AAL1/AAL2, sin reemplazarlo por un stub permisivo para probar
la autorización administrativa de E4.

## A3 — Medio: E0 es de lectura, pero el inventario de permisos es incompleto

Las consultas propuestas son SELECT/SHOW dentro de BEGIN READ ONLY/ROLLBACK;
no hay mutaciones expresas ni lectura de comandos del cron. Eso NO sustituye
la autorización P5, que sigue pendiente.

Antes de ejecutarlas, completar:
- Q3 usa `role_table_grants`, que omite privilegios vía PUBLIC. Añadir permisos
  efectivos de roles/columnas, owner, relrowsecurity/relforcerowsecurity y
  privilegios de esquema relevantes; una policy escrita no acredita RLS activa.
- Q8 devuelve sólo nombres: no acredita cuerpo, owner, security-definer,
  search_path o permisos EXECUTE de `is_admin_mfa()`. Consultar esos datos
  acotados para verificar lo que se promete, sin volcar funciones ajenas.
- Q4 `prosrc ILIKE` es una heurística, no inventario exhaustivo de dependencias
  (no detecta todo SQL dinámico, cuerpo compilado, etc.). Documentar alcance y
  complementar catálogo de dependencias; filtrar esquema de vistas.
- Si `cron` o una tabla no existe, esa sentencia aborta la transacción y deja
  sin correr las siguientes. Prever bloques de lectura independientes o pasos
  condicionados a existencia, sin funciones temporales/mutaciones en Producción.
- Q7 ya dice “posibles autoconfirmadas”; conservar ese grado de evidencia en la
  acción final: no convertir la heurística en demostración de posesión o no
  posesión del buzón. Q2 contiene filas; no Q3, como dice el cierre de E0.

Fuente de la omisión de PUBLIC:
https://www.postgresql.org/docs/current/infoschema-role-table-grants.html

## A4 — Medio: E9c vuelve a introducir aprobación manual de todo

Propone lectura → publicación con retención total revisada por el dueño →
publicación automática. Retener/revisar TODO contenido real como paso obligatorio
no fue acordado y contradice la restricción global “no se impone leer cada reseña”.
Sustituir por pruebas con datos sintéticos/cuentas de prueba en entorno aislado
y activación autorizada con colas/muestreo de P6. Si se propone una beta manual
limitada a voluntarios, marcarla opcional con alcance y límite explícitos, no
condición general que aumente carga sin consentimiento.

## A5 — Medio: pruebas de acceso al esquema privado no pueden quedar en 404

E2a introduce `comunidad` no expuesto a PostgREST. Un 404 desde REST sólo prueba
ausencia de endpoint, no los grants/RLS ni el CHECK. Distinguir barreras:
pruebas SQL con SET ROLE por objeto, REST público y EXECUTE de RPC expuestas.
Declarar en qué esquema se exponen las funciones para que API/RPC puedan usarlas
sin exponer las tablas. `service_role` no pasa de “sólo funciones” a inserción
directa para probar CHECK en la misma matriz: definir qué rol propietario de
fixture prueba constraints, y permisos efectivos para service_role por separado.

## Condiciones puntuales para E2b, sin otro rediseño

- `getUserById` puede fallar por red/5xx/configuración. Sólo ausencia confirmada
  permite éxito; error indeterminado debe decir que no pudo verificarse y permitir
  reintento. Añadir el caso explícito a B1–B11.
- Consultar marcador tras login exige una vía autorizada de lectura y UI propias;
  asignar archivo/contrato, pues E2a niega toda lectura directa de tablas.
- Quitar marcador por admin no debe permitir saltar sanción activa. B10 prueba
  cuenta normal y B11 suspendida por separado, pero falta su combinación.
- Rollback: la afirmación general “nunca toca existentes” debe contemplar el
  cierre de policies de `user_reviews` que el propio plan permite. Definir cuándo
  se conserva cierre y cómo se evita reabrir lecturas accidentalmente.

## Próximo paso

Corregir puntualmente el plan y su trazabilidad, sin otra ronda completa del
diseño. E1 puede autorizarse por separado en local, sin consultas reales ni base;
los otros gates se cierran cuando existan sus dependencias. No se autoriza ninguna
entrega, lectura de Producción, migración, gasto, merge, deploy ni AAB mediante
este informe. Salas conserva su prueba y el AAB será conjunto con reseñas.
