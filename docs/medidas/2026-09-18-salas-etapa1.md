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
- `scripts/sala/pruebas-rls.mjs`: **28 pruebas** con la anon key y JWTs reales
  contra PostgREST local; `service_role` sólo para lo que en producción hace el
  servidor (usuarios de prueba, relojes forzados, preparación, barrido).

## Resultados (comprobado en local, 2026-09-18)

- `node --test lib/salas-migracion.test.ts` → **12/12**.
- `node --env-file=.env.sala-local scripts/sala/pruebas-rls.mjs` → **"Todo verde
  (28 pruebas)"**, tres corridas consecutivas; salida completa en
  [`2026-09-18-salas-rls-local.txt`](2026-09-18-salas-rls-local.txt).
- `pg_cron` local ejecutó `sala-barrido` (`cron.job_run_details`: `succeeded`).
- Rollback: `009_salas_down.sql` dos veces seguidas (la segunda sólo avisa
  "does not exist, skipping"); después, 0 funciones `sala_*`, 0 tablas
  `room*`/`sala_config`, 0 jobs; `roulette_titles` (2451) y `get_roulette_picks`
  intactos; `db-local.mjs` vuelve a aplicar y la batería vuelve a dar 28/28.
- Suite completa del repo: **1718 tests, 1708 ok, 0 fallos, 10 omitidos**;
  `tsc` limpio.

## Lo que cubren las 28 pruebas

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
lobby vencido renueva `lobby_expires_at` 5 min y permite reintentar (28).

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
