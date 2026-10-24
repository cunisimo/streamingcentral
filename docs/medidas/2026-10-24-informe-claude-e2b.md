# Informe de Claude para Codex — E2b local y ajustes A1/A2 (24/10/2026)

Rama `feat/resenas-reglas`, worktree `wt-resenas-comunidad`. Sólo
`supabase start` (contenedor `supabase_db_streamingcentral`, API
127.0.0.1:54321) y la app local en `localhost:3100` con
`.env.comunidad-local`. Sin Producción, sin E0, sin push, merge, deploy ni AAB.

**Pedido para la auditoría:** E2b y los dos ajustes del arnés. No hace falta
repetir la revisión general de E2a.

## Commits

| Commit | Qué |
|---|---|
| `02408a7` | Copia sin cambios de la auditoría de E2a (SHA-256 `4c22c7bc…26cb91`) y conciliación de `ESTADO.md` |
| `6e0e1d1` | **A2**: `scripts/comunidad/docker-local.mjs` (+ test) y `local.mjs` |
| `9cea2ea` | **A1**: `scripts/prueba-eliminar-cuenta.mjs` |
| `c6c6ba5` | **E2b**: migración 012, flujo, ruta, pantalla, baterías, runbook. También cablea A2 en `up-down-up.mjs` y `db-local.mjs` |
| (este) | Salidas, capturas del recorrido, este informe, `ESTADO.md` y el plan |

## A2: guardián de Docker

`dockerVerificado()` resuelve el contexto con la precedencia del CLI:
`DOCKER_HOST` → `DOCKER_CONTEXT` → `currentContext` de `config.json` →
`default`.

- Corta si `DOCKER_HOST` y `DOCKER_CONTEXT` están definidos a la vez.
- Corta si el contexto no existe.
- Sólo acepta endpoints de esta máquina: `unix://`, `npipe` del host `.` y
  `tcp` a loopback.
- Contrasta el resultado con `docker context show`.

Cada `docker` de las baterías, de `up-down-up` y de `db-local` recibe ese
endpoint fijo en `DOCKER_HOST`, sin `DOCKER_CONTEXT`, así que entre la
comprobación y el uso no puede cambiar de destino.

**Pruebas (11):**
- configuraciones simuladas, incluido tu caso
  `DOCKER_CONTEXT: 'auditoria-remoto'`, que ahora se rechaza;
- el CLI real sobre un `DOCKER_CONFIG` temporal con un contexto remoto
  creado por `docker context create`, que sólo escribe metadatos y no se
  conecta.

Una prueba de `local.test.mjs` exige que ningún `docker` de esos scripts
salga sin el entorno verificado.

**Límite:** la resolución reproduce la lógica del CLI; si una versión futura
cambia la precedencia, el contraste con `docker context show` corta la
corrida antes de enviar SQL.

## A1: prueba heredada de eliminación

Cada paso de la preparación y cada lectura comprueba su error y corta. Las
cantidades iniciales tienen que ser exactas, y una lectura denegada se
informa como error, no como cero.

Al corregirlo aparecieron **dos fallas que la versión anterior escondía:**
- **Permisos locales.** En `supabase start`, los roles de la API no tienen
  `SELECT`/`INSERT`/`UPDATE` sobre `profiles`, `votes`, `user_items` ni
  `view_history` (sólo `Dxtm`). En local, la preparación con la sesión del
  usuario nunca funcionó.
- **Tipo de `platforms`.** `profiles.platforms` es `integer[]` y el script
  mandaba `['n','d']`.

**Cómo prepara las fixtures ahora:** siguiendo la instrucción del dueño, el
dueño de la base local prepara y cuenta todas las fixtures heredadas, sin
abrir permisos ni policies. Por eso el script se niega a correr con una URL
o un `BASE` que no sean locales.

**Resultado: 0 fallas** (`e2b-salidas.txt` §08).

**Límite:** la comprobación "las filas ajenas no cambiaron" es débil en
`votes`, `user_items`, `view_history` y `user_reviews`, porque localmente
hay 0 filas ajenas.

## E2b: qué se construyó

**Migración `012_comunidad_baja.sql`** (SHA-256 `dd3d5ada…`; down
`a2b9fc0e…`).

*Marcador:* `bajas_en_curso` suma tres columnas:
- `origen` (`app` o `admin`);
- `sancion_hasta`;
- `cancelada_en`. La cancelación no borra la fila, para que la copia de la
  sanción sobreviva (B14). Un marcador está activo mientras `cancelada_en`
  es nulo.

*Locks:* dos espacios de dos claves, para no compartir el de una clave que
usan las salas:
- `K_CORTE` = (7301, 0);
- `K_CUENTA` = (7302, `hashtext(uid)`).

*Funciones internas* (esquema `comunidad`, nadie de la API las ejecuta):
- `tomar_cuenta`;
- `resolver_participante(uid, crear)`. Con marcador activo lanza
  `baja_en_curso` (SQLSTATE `CB001`) y no crea participante;
- `limpiar_participante`;
- `aplicar_baja`.

*Qué hace el paso 1:*
- cierra con una sola marca los tramos donde la cuenta es evaluadora o
  autora;
- borra sus reseñas, que arrastran en cascada sus versiones y los votos y
  denuncias que recibieron;
- borra sus votos, denuncias hechas, bloqueos hechos y contadores;
- anula el nombre y desvincula (`user_id = null`);
- conserva el seudónimo y las suspensiones;
- es idempotente.

*Red de seguridad:* un trigger `AFTER UPDATE OF user_id`, `security
definer` con `lock_timeout` de 5 s, que dispara el `on delete set null` de
Auth. Un trigger `BEFORE` impide volver a vincular un participante.

*API, sólo `service_role`:*
- `comunidad_baja_comunitaria`;
- `comunidad_baja_comunitaria_admin` (runbook);
- `comunidad_estado_baja`;
- `comunidad_baja_registrar_fallo`.

**Flujo** (`lib/eliminar-cuenta-flujo.ts`):
1. configuración;
2. contraseña;
3. paso 1;
4. `deleteUser`;
5. si falla, `getUserById`.

Resultados posibles:
- `ok: true` sólo con `deleteUser` ok o con la ausencia confirmada (404
  `user_not_found`);
- `baja-parcial`: la cuenta está viva; se registra el fallo en el marcador;
- `baja-sin-verificar`: red, 5xx o cliente ausente.

Un paso que lanza vale como su respuesta pesimista, y `cuentaComoIntento`
no cambió. Los adaptadores reales están en `lib/eliminar-cuenta-deps.ts` (sin
`server-only`), para que la batería los corra tal cual.

**App:**
- `GET /api/cuenta/estado-baja`, con Bearer y CORS como `cuenta/eliminar`;
- la ruta de eliminación devuelve los dos motivos nuevos;
- Configuración muestra "Eliminación pendiente" con "Reintentar
  eliminación". La lógica vive en `lib/cuenta/estado-baja-nucleo.ts`, puro,
  con generaciones: descarta respuestas de otra cuenta o viejas, y un error
  no se lee como "sin baja".

**Runbook:** `docs/MANTENIMIENTO.md`, "baja de cuenta pedida FUERA de la
app".

## Pruebas ejecutadas por Claude

Todas en secuencia, en este orden. El log completo está en
`docs/medidas/2026-10-24-e2b-salidas.txt`.

| Prueba | Resultado |
|---|---|
| Auxiliares (`local`, `docker-local`, `db-local`) | 23/23 |
| `db-local.mjs` (con 012) | 11 archivos aplicados |
| `pruebas-permisos.mjs` | 27/27 |
| `pruebas-invariantes.mjs` | 81/81 |
| `up-down-up.mjs` | 14/14 |
| `pruebas-baja.mjs` | **26/26** |
| Salas (`pruebas-rls.mjs`) | 37 en verde |
| `prueba-eliminar-cuenta.mjs` | 0 fallas |
| `tsc --noEmit` | 0 errores |
| `npm test` | 2378 pruebas: 2362 pasan, 0 fallan, 16 omitidas |

Detalle de las filas que lo necesitan:
- **Permisos (27/27).** Las cuatro `public.comunidad_*` son `security
  definer` con `search_path` vacío. En catálogo, sólo `service_role` tiene
  `EXECUTE`. Por REST, las 7 credenciales reciben 401/403 en las cuatro y
  `service_role` recibe 200. En el OpenAPI, `anon` no ve ninguna y
  `service_role` ve sólo esas cuatro.
- **Invariantes (81/81).** Dos casos de E2a cambiaron a propósito. Fijaban
  que al borrar Auth "la reseña sobrevive", porque todavía no había red de
  seguridad. Ahora fijan que la reseña se borra, que el tramo se cierra y
  que la suspensión queda.
- **up/down/up (14/14).** Orden: 012_down → 011_down, y 011 → 012. Los
  volcados con y sin 011 dan los **mismos hashes que en E2a**
  (`2121d0f0…`, `6aa72742…`), y con 012 da `49e76e46…`.
- **Baja (26/26).** Detalle por caso abajo.
- **`npm test`.** Las omitidas dependen de builds ausentes. En E2a fueron
  18; no se investigó la diferencia más allá de eso. Se actualizaron tres
  inventarios: rutas CORS (26 → 27, `estado-baja` integrada), sitios
  `catch` (dos nuevos, sin relación con TMDB) y la ubicación del `signOut`
  de la revalidación.

**`pruebas-baja.mjs`, caso por caso.** "Pre" marca los preliminares (§5.0
del plan); se repiten como gate en E3a, E4 o E7.

| # | Resultado |
|---|---|
| Permisos SQL | `anon` y `authenticated` reciben 42501 en las cuatro; `service_role` recibe 42501 en las internas y ejecuta las cuatro |
| B6 | Sólo marcador; después, completa |
| B1 | Falla real de `deleteUser`: un trigger sólo local hace fallar la transacción de Auth (no es un mock). Resultado `baja-parcial` con el texto del contrato; marcador con un intento; 2 tramos cerrados con una marca; lo de la otra cuenta queda |
| B2 (pre) | `resolver_participante` con y sin creación → `CB001`; no se crea participante |
| B13 | Ruta real: la cuenta propia ve pendiente, otra no lo ve, sin sesión o con un token inválido → 401 |
| B7 | El reintento completa |
| B3a (pre) | Escritura con `K_CUENTA` tomado; la baja espera; después borra el voto y cierra el tramo |
| B3b (pre) | Secuencial y concurrente: relee el marcador y rechaza |
| B4 | Dos `baja_comunitaria` se serializan y la segunda no cambia nada. Ver la observación sobre `deleteUser` simultáneos abajo |
| B5 | Borrado real con la respuesta descartada → reconcilia → ok; no queda marcador |
| B12 | `getUserById` contra un puerto cerrado (falla de red real) y con el cliente ausente → `baja-sin-verificar`. El reintento reconcilia: primero parcial, después completa |
| B9 | Runbook: las dos consultas de verificación dan 0 |
| B10 (pre) | El dueño cancela el marcador → nace otro participante, sin historial; el viejo no se puede volver a vincular |
| B11 | Una cuenta suspendida puede pedir la baja; `sancion_hasta` queda en `infinity`; la suspensión no se toca; `CB001` impide recrear la identidad |
| B14 (pre) | El participante nuevo nace suspendido hasta la misma fecha; la baja siguiente reactiva el marcador. "No publica ni vota" no se pudo probar: esas funciones son de E3a |
| B8a (pre) | Voto de otra cuenta y consolidación esperando: Postgres reordenó la cola; Auth terminó (ok) |
| B8b (pre) | Escritura de la propia cuenta: deadlock real (40P01); la víctima fue Auth (500) y nada cambió; el reintento terminó |
| B8c (pre) | `K_CUENTA` retenido 7 s: `lock_timeout` (55P03); Auth se revirtió entera; el reintento terminó |

En B8b y B8c el motivo del aborto sale del log de Postgres de la misma
corrida (`e2b-salidas.txt` §06b). Limpieza final: 0 cuentas, participantes,
esquema `solo_local` ni trigger remanentes.

**Recorrido visible**, en el navegador local, con capturas en
`docs/medidas/2026-10-24-e2b-recorrido/`:
1. con la falla de Auth activa, pedir la baja muestra el texto parcial
   (`1-baja-parcial.jpg`);
2. cerrar sesión y volver a entrar muestra "Eliminación pendiente" con
   "Reintentar eliminación" (`2-eliminacion-pendiente.jpg`);
3. sin la falla, el reintento elimina y cierra la sesión
   (`3-eliminada-sesion-cerrada.jpg`);
4. el login con esa cuenta da `Invalid login credentials`, y la base queda
   limpia.

## Observaciones y limitaciones

- **B4, distinto de lo esperado en el plan.** Con dos `deleteUser`
  realmente simultáneos, el GoTrue local respondió **200 a los dos**. El
  plan esperaba que uno fallara y reconciliara. El contrato se cumple (los
  dos flujos responden eliminación completa), y el camino "falla (404) y
  reconcilia" se probó aparte, forzando el orden.
- **B8, distinto de lo esperado.** Un ciclo "blando" (cola de K_CORTE) no
  aborta: Postgres reordena la cola. El deadlock real necesita la propia
  cuenta en vuelo (B8b).
- **Preliminares.** B2, B3, B8, B10 y B14 usan primitivas y fixtures,
  porque las escrituras (E3a), la consolidación (E7) y
  `comunidad_quitar_marcador_baja` (E4) todavía no existen.
- **Decisiones de interpretación, para auditar:**
  - la baja **borra físicamente** las reseñas, y con ellas las denuncias
    abiertas que **otros** hicieron sobre ese texto. El contrato dice "borra
    reseñas"; §5 habla de "salvo denuncia abierta" para el borrado del
    autor, no para la baja;
  - **conserva las suspensiones**: lo pide la reconstrucción del ranking, y
    el dueño pidió no quitar suspensiones. §5 dice "con la baja, se borra"
    para la sanción activa; ahí hay una tensión que no resolví;
  - conserva los bloqueos que otros le hicieron al seudónimo.
- **Orden de despliegue.** La ruta de eliminación ahora **depende de 011 y
  012**. Sin `comunidad_baja_comunitaria`, el paso 1 falla y la eliminación
  responde `fallo-borrado` sin borrar nada. Antes de desplegar este código,
  las migraciones tienen que estar aplicadas (después de E0 y con
  autorización).
- **Bundles Android viejos** reciben los códigos nuevos y muestran su
  mensaje genérico de error, que también es cierto.
- **Texto del diálogo.** La lista "Se va a borrar para siempre" no menciona
  todavía los datos de comunidad, que no son visibles con el módulo
  apagado. Va a hacer falta en E9a.
- **Base local compartida.** Ahora tiene 012 aplicada. Las cuentas y las
  ayudas sólo locales se limpiaron.
- **Servidor local.** Quedó corriendo en el puerto 3100 desde el panel de
  vista previa.
- **No probado:**
  - privilegios por defecto de Producción (E0 Q5);
  - el `getUserById` de GoTrue de Producción ante una cuenta ausente. El
    criterio es estricto: sólo 404 con `user_not_found`, o 404 sin código
    con el mensaje "User not found";
  - Android.
- **Moderación.** No se tocó. E1 sigue pendiente de validación
  independiente, N=20 es una hipótesis y no hay plazos de retención nuevos.
