# Salas compartidas — Etapa 2: preparación en Vercel y medición

Plan: [`superpowers/plans/2026-09-17-salas-compartidas.md`](../superpowers/plans/2026-09-17-salas-compartidas.md), Tareas 2.1–2.3.
Rama `feat/salas`. **Todo en local: base de `supabase start`, `next dev` con
`.env.sala-local`, TMDB real. Nada en Producción; sin deploy, merge ni push.**

## Qué hay

- `lib/sala/tipos.ts` — tipos y constantes client-safe (`SIZES`, `DURACIONES`,
  `LIMITE_SEG`, `CONFIG_DEFAULT`, `Candidata`, `CardSala`, `ResultadoPreparar`).
- `lib/sala/preparacion-nucleo.ts` — selección PURA: orden de la semilla, una
  plataforma en común con la unión alcanza, sin card o sin duración se
  descarta, `advertencia` vacía → `null`. 9 tests.
- `lib/sala/preparar-nucleo.ts` — orquestación con dependencias inyectadas:
  iniciar → candidatas (tope 80, semilla = `room_id`) → `cardsByIds` por lotes →
  publicar atómica; aborta (idempotente) si no alcanza o si algo lanza. Lotes:
  el primero del tamaño de la tanda, los siguientes el doble de lo que falta
  (5..20). 9 tests con dobles.
- `lib/sala/preparar-ruta.ts` — handler HTTP puro: kill switch del servidor
  (503) antes de la sesión, 401, **400 sin valores por defecto**, `hostUid` sólo
  del JWT, 409/403/503/500 por motivo. 5 tests.
- `lib/sala/preparar.ts` (server-only) — cableado con `supabaseAdmin()`,
  `cardsByIds` y `roulettePlatformNames`; cuenta las RPC admin (no pasan por el
  observador de `lib/supabase.ts`).
- `app/api/sala/preparar/route.ts` — `conCors`, `maxDuration 60`, línea
  `[sala] preparar <size>/<duracion> <estado> (<enriquecidas>, <descartadas>)
  <status> | tmdb … | redis … | supabase … + N rpc admin | ms`.
- `lib/cors-inventario.test.ts` — 27 rutas = 24 integradas + 3 excluidas.
- `scripts/sala/medir-preparacion.mjs` — la medición de abajo.
- `.claude/launch.json` — configuración `sala-local`: `node --env-file=.env.sala-local
  next dev -p 3111` (el `--env-file` gana sobre `.env.local`, así que el
  servidor habla con la base LOCAL aunque `.env.local` apunte a Producción;
  verificado: valida un JWT local y devuelve 400 sin defaults).

## Precondiciones comprobadas (2026-09-19)

Docker Engine 29.8.0 arrancado; `supabase start`; rollback + `db-local.mjs`
(`sala_config.activas = true`, 2451 títulos) → batería **37/37**;
`db-local.mjs --catalogo-real` para la medición (2401 títulos reales).

## Medición: preparación fría y caliente (5 / 10 / 20, `cualquiera`, unión n,d,m)

Método (`scripts/sala/medir-preparacion.mjs`): una sala de 2 por tamaño; "frío"
= primera preparación en un proceso recién levantado (caché en memoria, sin
`UPSTASH_*`); "caliente" = **la misma sala** vuelta a preparar (misma semilla →
mismas candidatas; se borra la ronda con `service_role`, sólo en local);
"control" = una tercera vez, que tiene que dar lo mismo que caliente
(MANTENIMIENTO 8.b). Los tres tamaños alternados en la misma ventana. Las
cifras son las de la línea `[sala]` del servidor; "pared" es lo que vio el
cliente.

**Corrida 3 (código final, lotes adaptativos), proceso recién levantado:**

| size | estado | enriquecidas | descartadas | TMDB | Redis cmd (hit/miss) | Supabase + rpc | ms servidor | ms pared |
|---|---|---|---|---|---|---|---|---|
| 5 | frío | 5 | 0 | **10** | 14 (0/11) | 2 + 3 | **846** | 1841 |
| 5 | caliente | 5 | 0 | 0 | 2 (6/0) | 1 + 3 | 242 | 270 |
| 5 | control | 5 | 0 | 0 | 2 (6/0) | 1 + 3 | 195 | 227 |
| 10 | frío | 10 | 0 | **20** | 23 (1/20) | 1 + 3 | **1040** | 1072 |
| 10 | caliente | 10 | 0 | 0 | 2 (11/0) | 1 + 3 | 168 | 194 |
| 10 | control | 10 | 0 | 0 | 2 (11/0) | 1 + 3 | 360 | 404 |
| 20 | frío | 25 | 1 | **50** | 56 (2/50) | 1 + 3 | **2738** | 2783 |
| 20 | caliente | 25 | 1 | 0 | 4 (27/0) | 1 + 3 | 315 | 344 |
| 20 | control | 25 | 1 | 0 | 4 (27/0) | 1 + 3 | 348 | 388 |

Lectura: **2 llamadas a TMDB por card enriquecida en frío** (detalle +
proveedores), 0 en caliente; el control coincide con el caliente en las tres
unidades. Los tres frío quedan dentro del umbral del plan (≤ 6 s p95) y los
caliente muy por debajo de 2 s. "Supabase" cuenta el `usuarioDeToken` (1) más,
en la primera, la lectura de `ed:pub` de `publishedIds` (caché 5 min); las 3 RPC
admin son iniciar / candidatas / publicar. El "ms pared" del primer frío incluye
la compilación del módulo por `next dev`.

**Lo que cambió entre corridas, y por qué se mide tres veces:**

| corrida | lote | 5 frío | 10 frío | 20 frío |
|---|---|---|---|---|
| 1 | fijo 20 | 40 TMDB (20 enriquecidas para usar 5) · 3,5 s | 37 · 3,0 s | 75 (≈40 enriquecidas) · 3,8 s |
| 2 | = size | 10 · 0,7 s | 20 · 0,8 s | 81 (2.º lote fijo de 20) · 4,2 s |
| 3 | 1.º = size, siguientes = max(5, 2·faltan) | 10 · 0,8 s | 20 · 1,0 s | **50** (25 enriquecidas, 1 descartada) · 2,7 s |

En la corrida 1 una candidata falló en TMDB de forma estable (`[tmdb]
api/sala/preparar: 1 descarte(s)`, dos llamadas sin `ok` también en caliente):
`titleCard` no guarda `null`, así que se reintenta en cada preparación y se
descarta. No se identificó el `tmdb_id`; es el comportamiento esperado de la
Etapa 3.a (un descarte por TMDB no tumba la tanda, se saltea la card).

**Qué NO dice esta medición:** nada sobre Producción (Redis real, Vercel, red
del teléfono) ni sobre concurrencia entre salas o con el Home. `pv3:`/`card:`
en Producción se comparten con el resto de la app, así que el "caliente" real
será más frecuente que acá; el "frío" real paga además el round-trip a Upstash
por cada card (~40 SET para 20).

## Verificación

- `node --test lib/sala/*.test.ts` → 23/23 (9 + 9 + 5). `tsc` limpio.
- Suite completa: 1742 tests, 1732 ok, 0 fallos, 10 omitidos.
- Batería PostgREST tras reconstruir el entorno: 37/37.

## Qué NO se hizo

Aplicar 009 en Producción; deploy; encender salas; refresco del catálogo;
merge; push. Sigue la Etapa 3 (cliente: lobby y votación).
