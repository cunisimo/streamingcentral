# E9a local — residual A1 (28/10/2026)

Claude, en `feat/resenas-reglas` desde `092aceb`, sobre la auditoría
`2026-10-28-auditoria-e9a-a1a2-092aceb.md`, copiada sin cambios (SHA-256
`1eae7f4e…`, igual al original). A2 está cerrada y no se tocó. Usé sólo
Supabase local y fixtures propias identificadas por id. No hubo bajadas de
migraciones ni limpiezas generales. Salidas:
`2026-10-28-e9a-a1-residual-salidas.txt`.

## Defecto

`decidirMeses` salteaba los meses sin consolidar. Un voto ajeno sobre una
reseña del recorrido en el mes corriente no frenaba nada, y
`sqlBorrarComunidad` borraba esa evaluación y su tramo porque el autor era
propio. Codex lo reprodujo; ver su auditoría.

## Corrección

`recorrido-e9a-nucleo.mjs` incorpora `sqlActividadAjena` (sólo lectura) y
`decidirActividadAjena`. Cuentan, en cualquier mes, la actividad ajena que el
borrado de lo propio arrastraría:
- votos de participantes ajenos sobre reseñas propias: evaluaciones, también
  las de «no me sirvió», y tramos;
- denuncias ajenas sobre reseñas propias;
- bloqueos ajenos a participantes propios;
- decisiones de un admin ajeno sobre objetos propios.

`limpiar` suma esos motivos a las discrepancias de ranking que ya tenía.
Cualquiera de los dos detiene la limpieza antes del primer borrado, con salida
1, y conserva el archivo y el registro. `decidirMeses` no cambió: en un mes sin
consolidar, los tramos entre ajenos no se borran y no tienen por qué frenar la
limpieza. El voto ajeno lo detecta el control nuevo.

## Evidencia

- **Núcleo: 8/8.** Incluye el caso puro de la auditoría: `decidirMeses` sigue
  sin conservar nada, pero `decidirActividadAjena` devuelve los dos motivos.
  Otro test fija que la consulta no filtra por mes ni por fecha.
- **Aislamiento en la base local real: 15/15.** Son los 13 anteriores más 2
  nuevos.
  - **Voto ajeno en el mes corriente:** en octubre, sin reloj y con el mes sin
    consolidar, dos evaluadores ajenos votaron reseñas del recorrido: un «me
    sirvió» y un «no me sirvió». `limpiar` salió con 1 y avisó «2 voto(s)» y
    «1 tramo(s) de votos». Una foto antes y después de la corrida confirma que
    no se borraron cuentas, reseñas, evaluaciones ni tramos. Quedaron el
    archivo, con los objetivos guardados, y el registro.
  - **Reintento:** borré sólo esas dos evaluaciones y ese tramo de prueba, por
    id de evaluador. El segundo intento verificó la limpieza de 12 cuentas y 11
    participantes propios y quitó el archivo y el registro. Los evaluadores
    ajenos siguieron vivos.
  - **El resto sigue funcionando:**
    - el recorrido normal, con cortes y reintentos;
    - la protección del ranking consolidado de septiembre, que ahora además
      informa la actividad ajena;
    - la identidad y el ranking ajenos sobreviven.
- **Controles afectados:** `scripts/comunidad` y `scripts/sala` dan 50/50,
  sin omitidas. `tsc` da 0 y `git diff --check` sale limpio.
- **Lo que no corrí, porque el cambio no los toca:** las quince baterías, el
  build y los recorridos visuales.

## Estado final

La base está en la línea base:
- 0 participantes, 0 versiones, 0 suspensiones, 0 evaluaciones y 0 tramos;
- 42 cuentas `@comunidad.test` y 0 de prueba;
- 24 tablas y todo apagado;
- `cron` sólo con `sala-barrido`;
- ni registro, ni reloj, ni archivo de estado, ni servidores.

El incidente anterior sigue registrado: no se recuperaron ni se recrearon sus
filas.

## Pendiente

- La revisión de Codex.
- La prueba del dueño: la guía sigue vigente y ahora aclara que votar,
  denunciar o bloquear desde una cuenta que no sea `@recorrido.test` detiene la
  limpieza.
- E0 y los pasos de Producción para cerrar E9a.
