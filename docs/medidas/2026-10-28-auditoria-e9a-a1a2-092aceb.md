# Auditoría focalizada E9a A1/A2 — 28/10/2026

**Revisión:** `092aceb`, correcciones `71afeef` y `1b81ab6`, base
`187be15`, rama `feat/resenas-reglas`, checkout `wt-resenas-comunidad`.

**Dictamen:** A2 cerrada. A1 mejoró sustancialmente, pero conserva un
pendiente P2 en la protección de actividad ajena antes de consolidar un
mes. No rehacer el registro, los módulos de producto ni las baterías
generales: extender el control existente y probarlo de forma focalizada.
E9a y la prueba del dueño siguen pendientes.

## A1 residual — P2: el voto ajeno sólo se protege después de consolidar

`scripts/comunidad/recorrido-e9a-nucleo.mjs:41` descarta el mes con
`if (!m.consolidado) continue` antes de comprobar `tramosAjenos`.

Un evaluador ajeno puede votar una reseña propia del recorrido durante
el mes corriente, que aún no se puede consolidar. `sqlMeses` sí informa
ese tramo ajeno, pero `decidirMeses` no produce discrepancia. La limpieza
continúa y `sqlBorrarComunidad` elimina tanto el tramo como la evaluación
ajenos porque su autor está entre los participantes propios. El arreglo
del defecto que Claude encontró en su cuarta corrida sólo lo frena si
ya existe `top_meses`.

**Reproducción propia, sin ejecutar el recorrido completo:**

- Caso puro contra la función actual:
  `{mes:'2026-10-01', consolidado:false, tramosAjenos:1, resultadosAjenos:0}`.
  Resultado: `borrar:[], conservar:[], discrepancias:[]`.
- Sonda transaccional real con el prefijo de `fixturesSql({conAuth:false})`:
  participante autor propio, evaluador ajeno al recorrido, reseña y versión
  válidas, evaluación positiva y tramo de octubre. Ambas identidades y todos
  los datos son fixtures propias de esta auditoría.
- `sqlMeses` real devuelve el caso anterior. El SQL generado por
  `sqlBorrarComunidad` borra la evaluación y el tramo del evaluador ajeno:
  `ANTES|1` → `DESPUES|0|0`.
- Se ejecutó dentro de una transacción externa, quitando sólo BEGIN/COMMIT
  del SQL generado para poder hacer ROLLBACK al final. Limpieza confirmada:
  `LIMPIO|0|0` (participantes/tramos); sin datos persistentes ni cuentas nuevas.

**Corrección requerida:** detectar y detener la limpieza antes de borrar
cuando hay actividad ajena que el borrado de lo propio eliminaría, también
sin mes consolidado. Mantener el comportamiento ya probado para rankings
mixtos, la información de recuperación y el éxito del recorrido normal.
Agregar una regresión de mes sin consolidar (idealmente el corriente) con
evaluador ajeno: no debe borrar nada y debe conservar archivo/registro.
Al retirar la fixture ajena de prueba, el reintento debe limpiar lo propio.
No hace falta generar otro ranking ni ampliar la arquitectura del registro.

## A2 cerrada

Los dos arneses llaman a `exigirFreno` antes de aplicar archivos o ejecutar
otras mutaciones. El inventario sale de las migraciones; se cubren 015 sin
016, 021, estado actual, filas anteriores y configuración modificada.
La consulta real `ESTADO_SQL` se ejecutó sólo en lectura: el arnés 011–014
recibió cuatro motivos de rechazo y el de 020, dos. No se ejecutó ninguna
bajada ni se reaplicó una migración.

Los tests instrumentan los arneses reales y rechazan las escrituras; se
verificó que el falso `local.mjs` y el gancho no acceden a la base real.

## Evidencia propia y revisada

- **48/48 pruebas propias**, sin omitidas:
  `node --test "scripts/comunidad/*.test.mjs" "scripts/sala/*.test.mjs"`.
  Incluye los diecinueve controles de frenos y seis de limpieza.
- Tipado `npx tsc --noEmit --incremental false`: exit 0.
- `git diff 187be15..092aceb --check`: limpio.
- Auditoría anterior copiada con SHA-256 idéntico:
  `eb99009f9cb00ba9f2104fa31f242d3b9078bdac3c4e95a16e01718487bdbdd0`.
- Revisados registro SQL, recuperación, scripts, guía y salidas. Se corrigen
  los filtros generales por fecha y meses nuevos y se conserva el estado
  ante discrepancias. El caso propio anterior no está en sus seis tests.
- Los **13/13 de aislamiento real son evidencia de Claude**, revisada en
  fuente y salidas; no se repitió aquí esa batería completa. Su caso de voto
  ajeno consolida septiembre antes de limpiar y por eso no cubre el residual.
- Conciliación documental correcta: doce pares apagados, diez iguales y dos
  controles alternados. No se exige repetirlos ni reabrir `/api/title`.

## Estado final y alcance

Consulta propia: 0 participantes/versiones/suspensiones; 42 cuentas antiguas;
0 `@recorrido.test`; interruptores y purga apagados; sin `recorrido_e9a` ni
`solo_local`; cron sólo `sala-barrido`. No hay archivo de estado del recorrido.
Se mantiene el registro del incidente anterior; las filas perdidas no se
recuperaron ni se inventaron sustitutos.

Corregir sólo el residual A1; A2 no necesita otra ronda de implementación.
No se modificó código ni SQL por Codex ni se levantaron servidores.
Sin E0, Producción, bajadas de migraciones, cron instalado, gastos, push,
merge, deploy, AAB o cambio de versión. La prueba del dueño no está realizada.
