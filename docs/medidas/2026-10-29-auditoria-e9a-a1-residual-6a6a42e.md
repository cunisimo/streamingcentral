# Cierre focalizado E9a A1 residual — 29/10/2026

**Revisión:** `6a6a42e`, corrección `91a2951`, base `092aceb`, rama
`feat/resenas-reglas`, checkout `wt-resenas-comunidad`.

**Dictamen:** residual A1 corregido, sin nuevos hallazgos bloqueantes en
este alcance. A1/A2 de las herramientas locales quedan cerradas. Próximo
paso: preparar la prueba local del dueño, comprobando primero que Docker
y Supabase estén disponibles. Esto no cierra E9a completa ni habilita
Producción, E0, Android o publicación.

## Corrección comprobada

`sqlActividadAjena` consulta, sin filtros por mes o consolidación, votos
positivos/negativos, tramos, denuncias, bloqueos y decisiones de otro admin
que el borrado de los objetivos propios eliminaría. `limpiar` suma esos
motivos a las discrepancias de rankings antes de ejecutar
`sqlBorrarComunidad` o eliminar cuentas.

Si hay actividad ajena, guarda objetivos y discrepancias, sale con error y
conserva archivo y registro. Sin ella, mantiene el recorrido de limpieza
existente. A2 no se modificó y no se reabre.

## Verificación propia

- **50/50 pruebas de scripts**, sin fallos ni omitidas:
  `node --test "scripts/comunidad/*.test.mjs" "scripts/sala/*.test.mjs"`.
  Incluye ocho del núcleo de limpieza y diecinueve de los frenos.
- **Tipado:** `npx tsc --noEmit --incremental false`, exit 0.
- **Diff:** `git diff 092aceb..6a6a42e --check`, limpio.
- **Flujo real de limpiar instrumentado:** se extrajo el bloque actual y se
  ejecutó con filesystem, registro y SQL simulados, con dos evaluaciones
  ajenas y un tramo en un mes no consolidado. Resultado: salida 1, sólo
  dos consultas SELECT, ningún borrado, objetivos y discrepancia guardados.
  No se modificó el archivo fuente ni se usó una base real en esta sonda.
- La auditoría anterior copiada coincide por SHA-256:
  `1eae7f4ee88373df0eb97ac3dd3dfd3ba2ab87d2aa07912d4ec5f3cdc721fcd6`.

## Evidencia real de Claude y límite ambiental

Se revisaron fuente y salidas de los **15/15 casos reales de Claude**:
dos evaluadores ajenos, positivo y negativo en el mes corriente sin
consolidar, limpieza detenida sin cambios en cuentas/reseñas/votos/tramos,
archivo/registro conservados, retiro de las fixtures ajenas por id y
reintento que limpia lo propio sin borrar esas cuentas ajenas. También
permanecen las pruebas de cortes y de ranking ya consolidado. Son corridas
de Claude, no se presentan como ejecuciones propias.

Se intentó repetir sólo preparación inicial, los dos casos residuales y
limpieza de fixtures, cargando el arnés en memoria. Docker estaba apagado;
se inició Docker Desktop sin tocar volúmenes. El motor terminó devolviendo
500 en `docker ps`, antes de acceder a Supabase o iniciar las pruebas.
No se ejecutó preparación, se crearon cero fixtures y no se bajaron ni
reaplicaron migraciones. No se hizo reset ni se intentó reparar el motor.
Docker Desktop quedó iniciado, con disponibilidad del motor pendiente.

No pudo confirmarse de nuevo el estado de la base. La línea base
0 participantes/versiones/suspensiones y 42 cuentas antiguas, sin cuentas
del recorrido, con flags y purga apagados y sólo `sala-barrido` en cron, es
la evidencia final de Claude revisada, no una consulta propia de hoy.
Se comprobó en el filesystem que no hay `.recorrido-e9a.local.json`.

## Continuación

La guía conserva los pasos y ahora aclara usar cuentas `@recorrido.test`
para votar, denunciar o bloquear durante la prueba. Ante una discrepancia
la limpieza debe detenerse: no borrar manualmente datos ajenos para
forzarla. La prueba del dueño sigue pendiente; no quedó preparada por
Codex y no se levantó servidor de la app.

No se repitieron baterías generales, build ni recorridos visuales. Se
conservan el incidente previo, el texto de baja pendiente y las condiciones
de E0/integración/publicación. Sin modificaciones de código o SQL por
Codex, Producción, cron instalado, gastos, push, merge, deploy o AAB.
