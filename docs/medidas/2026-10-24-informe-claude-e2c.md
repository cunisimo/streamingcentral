# Informe de Claude para Codex: E2c local y cierre de E2b (24/10/2026)

Rama `feat/resenas-reglas`, worktree `wt-resenas-comunidad`. Todo corrió sólo
contra `supabase start`. No hubo Producción, E0, push, merge, deploy ni AAB.

**Qué pide la auditoría:** E2c y la corrección A1 de E2b. No hace falta
repetir E2a ni E2b.

## Commits

| Commit | Qué |
|---|---|
| `8646586` | A1 de E2b: aviso neutral, regresión, copia de la auditoría (SHA-256 `d768cb80…`) y log sin la línea vacía final |
| `a306cb8` | E2c: migración 013 (+ down), `sesiones.mjs`, `pruebas-concurrencia.mjs`, 013 en up/down/up y en db-local |
| (este) | Salidas, este informe, `ESTADO.md`, plan y conciliación en la revisión §5 |

## 1. Corrección A1 de E2b

**Qué cambió.**
- `trasIntento`: `baja-parcial` lleva a "pendiente", porque Auth confirmó
  la cuenta viva.
- `baja-sin-verificar` lleva a un estado propio, **"sin-verificar"**.
- `avisoVisible(estado)` devuelve título, cuerpo y botón. El componente
  muestra exactamente eso.
- El aviso de "sin-verificar" se titula "Eliminación sin confirmar". Su
  cuerpo dice: "Ya borramos tus datos de comunidad, pero no pudimos
  verificar si tu cuenta se eliminó. Reintentá para confirmarlo." El botón
  sigue siendo "Reintentar eliminación".
- El comentario que daba por existente el marcador está corregido.

**Regresión** (`lib/cuenta/estado-baja-nucleo.test.ts`).
- Escenario: `correrFlujo` con un `borrar` que elimina la cuenta simulada y
  pierde la respuesta, más una reconciliación `indeterminado`.
- Resultado: `baja-sin-verificar`.
- El diálogo y el aviso no afirman existencia ni eliminación. Se comprueba
  partiendo tanto de "sin baja" como de "pendiente".
- Otra prueba fija que sólo "pendiente" dice "todavía existe".

**Cifras.**
- 36/36 en el flujo y el núcleo; 48/48 junto con los auxiliares.
- `npm test`: 2364 pasan, 0 fallan.

**Control en el navegador local.** Con la falla real de Auth (`baja-parcial`)
el aviso sigue en "Eliminación pendiente" a través de `avisoVisible`.

**Límite.** "sin-verificar" no se puede provocar en el servidor real sin
agregar un gancho de prueba: lo cubre la regresión del núcleo, no un
recorrido visual.

## 2. E2c

### 013: primitivas del protocolo

Hashes: `013_comunidad_protocolo.sql` `61e91531…`; su down `94ba3343…`.

**Pasos, en el orden de §2.2.4:**
1. `proto_cuenta(uid, crear)`: K_CORTE compartido, después K_CUENTA, después
   relectura del marcador. Reusa `resolver_participante` de E2b.
2. `proto_participantes`, por id.
3. `proto_resena`.
4. `proto_versiones`, por id.
5. `proto_votos`: evaluaciones y tramos abiertos, por (evaluador, versión).
6. `proto_suspensiones`.
7. `proto_contadores`: crea las filas que falten y las bloquea.
8. `proto_marca()`: devuelve `clock_timestamp()` **después** de todos los
   locks.

Las primitivas de bloqueo devuelven las filas bloqueadas, para que quien
llama relea el estado.

**Consolidación:** `proto_corte_exclusivo()` toma sólo K_CORTE exclusivo, y
se rechaza fuera de READ COMMITTED (§2.2.4, "Aislamiento").

**Primitivas del corte:**
- `corte_de_mes(mes)`: T(M) a las 00:00 del día 1 siguiente, hora
  argentina;
- `rige_antes_de(desde, hasta, T)`: `desde < T and (hasta is null or T <= hasta)`;
- `mes_ar(t)`.

**El orden se hace cumplir.** El nivel alcanzado vive en un GUC local de la
transacción (`comunidad.nivel_locks`). Cada primitiva lanza `CB002
orden_de_locks` en estos casos:
- falta el paso 1;
- se repite un nivel;
- se retrocede;
- se pide un lock después de la marca;
- se repite el paso 1;
- la consolidación tiene otro lock.

Probado: falla en el acto, sin esperar ningún lock. **Lo que no ve:** un
`for update` escrito a mano por fuera de las primitivas. Por eso cada
entrega tiene que hacer el inventario de que sus funciones sólo bloquean con
ellas.

**Permisos:** revoke a PUBLIC, `anon`, `authenticated` y `service_role`.
Comprobado por catálogo y con `SET ROLE` (42501 en las tres).

**up/down/up 15/15.**
- 013 up → down → up reproduce el volcado `c16e231f…`.
- Sin 013, el volcado es `49e76e46…`, idéntico al de E2b.
- Los hashes de 011 coinciden con los de E2a.

### Batería `pruebas-concurrencia.mjs`

**Qué es real y qué es fixture.**
- Usa sesiones psql reales y concurrentes en el contenedor.
- Las esperas se **observan** en `pg_stat_activity`. Las barreras son locks
  consultivos (7399, n) de una sesión de control.
- Las **operaciones** son **fixtures**: votar, retirar, editar, suspender y
  consolidar. Usan las primitivas reales en el orden del protocolo, pero no
  son `comunidad_votar` (E3a), la suspensión de E4 ni `consolidar_mes` (E7).
  Por eso **todo es preliminar**, y nada se presenta como validación de esas
  funciones.

**Casos** (el esperado está escrito en el nombre de cada prueba):

| Caso | Resultado | Gate |
|---|---|---|
| Permisos de 013 (`SET ROLE` y catálogo) | 42501 / ninguna ejecutable | — |
| Guardián: siete violaciones | CB002 en el acto; el orden correcto pasa y no sobrevive a la transacción | — |
| Marca después de los locks | La marca de quien esperó es posterior al momento en que el otro soltó | E3a |
| 1a votar ‖ retirar (gana votar) | B espera K_CUENTA, relee y retira; marcas monótonas; igual al serial | E3a |
| 1b retirar ‖ votar (gana retirar) | No-op, después vota; igual al serial | E3a |
| 2a edición primero | El voto espera la fila del autor, relee, ve "reemplazada" y da CB003; no escribe nada | E3a |
| 2b voto primero | La edición espera y reinicia el voto con una marca posterior | E3a |
| 3 dos ediciones con la misma esperada | La segunda da CB003; una sola versión nueva | E3a |
| 4 mismo `id_intento` | Una versión, un reinicio; la segunda devuelve la misma | E3a |
| 5a suspensión primero | El voto relee y da CB004 | E4 |
| 5b voto primero | `desde` de la suspensión > marca del voto | E4 |
| Violación del orden (a mano) | Deadlock 40P01; abortada siempre la sesión fuera de orden; su escritura previa no quedó | — |
| `lock_timeout` 1 s | 55P03; tampoco queda el participante que creó el paso 1 | E3a |
| Error tras escrituras parciales | La edición con texto inválido se revierte entera | E3a |
| 6 compartido antes de T, confirma después | m < T ≤ L; la consolidación la cuenta | E7 |
| 7a consolidación calculando | La operación espera; m > L; no cuenta | E7 |
| 7b consolidación esperando | La operación no se cuela delante; mX < L < mY; cuenta X y no Y | E7 |
| 11 primitivas | T(M), ±1 µs, inicio y fin de tramo y de suspensión, primera positiva | E7 |
| 11 cómputo de fixture | Con marcas exactas cuentan exactamente ev0, ev2 y ev5 | E7 |

En 7b, el log de Postgres muestra la cola, por ejemplo: `Wait queue: 30921,
30924` (la consolidación delante de Y).

**Resultados.** **20/20 en cinco corridas seguidas** (criterio de cierre del
plan). Limpieza `0|0|0|0` en cada una: cuentas, participantes, sesiones y
locks consultivos (`e2c-salidas.txt`).

**Otras verificaciones:**
- salas: 37 en verde;
- `tsc`: 0 errores;
- `npm test`: 2380 pruebas, 2364 pasan, 0 fallan, 16 omitidas por builds
  ausentes.

**No repetí** las baterías generales de E2a (permisos, invariantes) ni la de
E2b.

## Diferencias respecto del plan y limitaciones

- **Memoria.** La primera corrida falló en 2 de 20 casos con `VirtualAlloc …
  errno=1455`, el mismo síntoma que Codex en E2a. La máquina tenía unos
  290 MB de memoria virtual libre. No era un fallo del protocolo, pero la
  causa estaba en el arnés: un `docker exec` por sondeo. Lo cambié por un
  observador psql persistente y una única sesión de control, y detuve el
  servidor de Next del puerto 3100. Después de eso: cinco de cinco.
- **`log_lock_waits` sólo registra esperas de más de `deadlock_timeout`
  (1 s).** Con el observador, la mayoría de las esperas duran menos y no
  aparecen en el log. La prueba de cada espera es la observación en
  `pg_stat_activity`. El log aporta el deadlock, el timeout y la cola de 7b.
- **Casos 8–10 de §2.2.4** (baja durante la consolidación, red de seguridad
  con voto, cosas entre el corte y la primera consulta) no son de E2c según
  el plan. B8 de E2b ya cubre una parte, como preliminar.
- **La suspensión de fixture no cierra tramos**: eso lo define E4.
- **Base local compartida.** Ahora tiene 013 aplicada. Siguen 34 cuentas
  `@comunidad.test` de corridas anteriores de la batería de permisos de E2a
  (de Claude y de Codex), que no toqué. Las de esta entrega se limpiaron.
- **Servidor de la app.** El del puerto 3100 quedó **detenido**. En el
  informe de E2b figuraba corriendo.
- **Moderación.** No se tocó ni se preparó ningún reservado. Retención (P3),
  N=20 y la validación de E1 siguen como estaban.
