# Salas compartidas — Etapa 1: base de datos (`009_salas.sql`)

Plan: [`superpowers/plans/2026-09-17-salas-compartidas.md`](../superpowers/plans/2026-09-17-salas-compartidas.md), Tareas 1.1–1.5.
Rama `feat/salas`. **Todo en la base local de `supabase start`. Nada aplicado en
Producción; sin deploy, merge ni push.**

## Qué hay

- `supabase/migrations/009_salas.sql`: seis tablas cerradas (RLS sin policies,
  `revoke all` a `anon`/`authenticated`, `grant all` explícito a `service_role`),
  24 funciones con `revoke execute … from public, anon, authenticated` y `grant`
  sólo a quien corresponde (3 de participante, 4 de cuenta, 5 de servidor, 12
  internas), trigger `rooms_publicar_cambio` → `realtime.send` público con sólo
  `{v}`, cron `sala-barrido` cada minuto. `sala_config.activas` nace `'false'`.
- `supabase/migrations/009_salas_down.sql`: reversión completa e idempotente.
- `lib/salas-migracion.test.ts`: 12 guards textuales (inventario de funciones y
  permisos, tablas cerradas, códigos = `ALL_CODES`, sin `participant_id`,
  `search_path` pineado, orden de bloqueo sala→ronda, `sala_candidatos` con el
  criterio de texto real y sin exigir "pero", `advertencia` nullable, nace
  apagado, y que el down borre exactamente lo que el up crea y nada más).
- `scripts/sala/pruebas-rls.mjs`: **37 pruebas** con la anon key y JWTs reales
  contra PostgREST local; `service_role` sólo para lo que en producción hace el
  servidor (usuarios de prueba, relojes forzados, preparación, barrido).

## Correcciones tras la auditoría: recuperación ante respuesta perdida

**Segunda ronda (misma fecha).** La primera solución —un `p_intento` uuid con
tokens generados por la base— tenía dos huecos: cada reintento rotaba el token
(seis respuestas concurrentes, seis tokens, sólo el último vivo, y las
respuestas pueden llegar desordenadas), y el intento en claro era una
credencial de recuperación sin hashear. Se reemplazó por el modelo definitivo:
**la credencial la genera el cliente** (32 bytes aleatorios, base64url de 43
caracteres), se persiste antes de la primera solicitud, se manda siempre la
misma, y la base guarda sólo su sha256 (`token_hash`, único global) y **nunca
genera ni devuelve tokens** (`sala_nuevo_token` eliminada; `sala_reclamar`
también recibe la credencial). Repetir la misma credencial devuelve la misma
sala/participación sin rotar nada, así que el orden de las respuestas es
irrelevante. La recuperación va **antes del kill switch** y del estado. Una
cuenta ya participante que entra con credencial nueva pasa su participación a
esa credencial y puede recuperarla después con ella. Lo que sigue describe la
primera ronda; lo que vale es lo de arriba.

### Primera ronda (superada)

La auditoría encontró que, si `sala_crear` se confirmaba en la base pero la
respuesta HTTP se perdía, el organizador quedaba con una sala activa cuyo
`room_id` y token nunca recibió: el reintento daba `sala_ya_tiene_activa` y
`sala_reclamar` exige conocer el `room_id`. Y repetir un `sala_unirse`
anónimo creaba otro participante. Corregido con un **identificador de
intento** (`uuid`) que el cliente genera y persiste antes de la primera
solicitud: `rooms.intento_crear` único por `(host_user_id, intento_crear)`,
`room_participants.intento` único por `(room_id, intento)`; repetir el mismo
intento devuelve la misma sala/participación con token nuevo y `repetido:
true`, antes de mirar el estado (sirve aunque la sala ya haya empezado). Sin
intento, las dos RPCs rechazan. No se deduplica por nombre.

También se corrigió la **discrepancia entre el índice `rooms_host_activa_idx`
(`estado <> 'vencida'`) y el conteo de `sala_crear`** (que además exigía
`expires_at > now()`): ahora `sala_crear` aplica primero los vencimientos por
reloj de las salas del organizador y cuenta con el predicado exacto del índice.
Una sala vencida de hecho pero no barrida se marca `vencida` ahí mismo y la
nueva nace; no hay error crudo de índice (el índice de apoyo no es único; la
regla la garantiza el bloqueo consultivo).

Al re-aplicar en local aparecieron como **sobrecargas** las firmas viejas sin
`p_intento` (con `grant` a `authenticated`): habrían salteado la
idempotencia. El up las borra a propósito, el down también, y la prueba 29b
llama sin `p_intento` exigiendo que ninguna función responda.

## Resultados (comprobado en local, 2026-09-18)

- `node --test lib/salas-migracion.test.ts` → **12/12**.
- `node --env-file=.env.sala-local scripts/sala/pruebas-rls.mjs` → **"Todo verde
  (37 pruebas)"**, dos corridas consecutivas tras la segunda corrección (antes,
  dos con 34 y tres con 28); salida completa en
  [`2026-09-18-salas-rls-local.txt`](2026-09-18-salas-rls-local.txt).
- `pg_cron` local ejecutó `sala-barrido` (`cron.job_run_details`: `succeeded`).
- Rollback: `009_salas_down.sql` dos veces seguidas (la segunda sólo avisa
  "does not exist, skipping"); después, 0 funciones `sala_*`, 0 tablas
  `room*`/`sala_config`, 0 jobs; `roulette_titles` (2451) y `get_roulette_picks`
  intactos; `db-local.mjs` vuelve a aplicar y la batería vuelve a dar 37/37.
  Exactamente **una** firma de `sala_crear`, `sala_unirse` y `sala_reclamar` en
  `pg_proc` después del up (las previas se borran en el up y en el down).
- Suite completa del repo: **1720 tests, 1710 ok, 0 fallos, 10 omitidos** en
  tres corridas consecutivas; `tsc` limpio. Una corrida anterior, lanzada
  inmediatamente después de la batería (con la pila local de Supabase bajo
  carga), dio 4 fallos que no se capturaron por nombre: compatible con #23,
  **no atribuido**.

## Lo que cubren las 37 pruebas

Acceso directo a las seis tablas rechazado con anon y con JWT (1); creación
sólo con sesión, plataformas desconocidas/vacías rechazadas, token de 43
caracteres (2); una sola sala activa (3) y **bajo concurrencia** de 10 llamadas
(20); dedup/orden de plataformas y nombre normalizado (4); una cuenta no ocupa
dos lugares — rota el token, el viejo muere, `sala_reclamar` (5); token de otra
sala inválido (6); máximo 6 (7); invitado sin acciones de host, anon sin
preparación (8); candidatas correctas —controles negativos afuera, "Sin pero"
adentro, `unión` congelada— y publicación atómica con siete rechazos distintos
sin dejar filas a medias, `advertencia` nula y vacía aceptadas y normalizadas a
NULL, doble publicación rechazada (9); lobby cerrado (10); voto sólo en la
siguiente `pos`, idempotente, `ya_votado` con `siguiente`, fuera de orden,
voto inválido (11); nadie ve votos ajenos, sin tokens ni ids ajenos en el
estado (12); seis participantes cerrando a la vez → un único `ganador` (13);
dos Sí simultáneos en sala de 2 → un único `match`, y un Sí solo no es match
(14); empate en sala de 3, sólo el host desempata, tres llamadas dan el mismo
ganador, coincide con `min(md5(seed || tmdb_id))` recalculado en Node, ventana
renovada (15); voto tras cierre (16); barrido borra las seis tablas (17); otra
tanda excluye la ronda anterior y una card repetida se rechaza (18); payload
falso en el tópico público no cambia nada (19); publicar vs abortar (21) y
publicar vs barrido (22) con un solo desenlace; voto vs cierre por plazo sin
votos fantasma (23); 12 funciones internas inejecutables con anon y JWT (24);
kill switch en la base (25); "otra tanda" a segundos del vencimiento renueva
`expires_at` y el barrido no toca una sala en `preparando` (26); una sala en
`preparando` nunca se borra, `sala_cerrar` conserva 5 min (27); aborto con
lobby vencido renueva `lobby_expires_at` 5 min y permite reintentar (28);
**crear con respuesta perdida → misma sala, un host, la credencial del cliente
sirve y ninguna respuesta trae token (29); ninguna firma previa responde (29b);
unirse anónimo con respuesta perdida → un participante, también tras el
arranque, y otra credencial con el mismo nombre es otra persona (30); seis
reintentos concurrentes de la misma credencial → una sala / un participante y
todas las respuestas llevan a la misma credencial válida (31); respuestas
concurrentes procesadas en orden inverso → credencial válida (31b); credencial
distinta respeta una sola sala activa (32); sala vencida por reloj no barrida
se vence al crear y la nueva nace, y repetir la credencial de una vencida la
devuelve con su estado (33); recuperación antes del kill switch (34); cuenta ya
participante con credencial nueva y respuesta perdida, sala empezada, repetir
recupera la misma participación (35). También: la base guarda el sha256 de la
credencial y no la credencial (2); no se puede robar la credencial de otro con
`sala_reclamar` ni reutilizarla en otra sala (5, 6).**

## Hallazgos durante la etapa

- **Los default privileges difieren entre local y Producción.** En el stack
  local, las tablas nuevas de `public` nacen con ACL `Dxtm` para
  `anon`/`authenticated`/`service_role` (sin SELECT/INSERT) y las funciones sin
  EXECUTE para nadie salvo `postgres`. En Producción el proyecto tiene otros
  defaults (la app lee tablas con `anon`). Por eso la migración **no depende de
  ninguno**: `grant all … to service_role` explícito en las seis tablas, y
  revoke+grant explícitos en las 24 funciones. Es exactamente lo que el test de
  inventario exige.
- `anon` llamando a una función sin grant recibe `42501 permission denied`
  **antes** de entrar a la función: `sala_crear` sin sesión no llega a
  `sala_sin_sesion`. La prueba 2 lo fija así.
- Las fixtures llevan el proveedor sintético `Pruebas` para que la batería
  quede aislada del catálogo real cuando está cargado con `--catalogo-real`.
- `drop table` de `room_participants` exige `cascade`: `sala_participante`
  devuelve el tipo de fila de esa tabla.

## Qué NO se hizo

Aplicar 009 en Producción; encender `sala_config.activas` en Producción; deploy;
refresco del catálogo; merge; push. Sigue: Etapa 2 (preparación en Vercel).
