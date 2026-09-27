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
  (5..20). Devuelve tres cuentas distintas: `consultadas` (candidatas enviadas
  a `cardsByIds`), `enriquecidas` (cards que TMDB devolvió de verdad) y
  `descartadas` (consultadas − válidas: sin card, sin duración o sin plataforma
  en común). 10 tests con dobles.
- `lib/sala/preparar-ruta.ts` — handler HTTP puro: kill switch del servidor
  (503) antes de la sesión, 401, **400 sin valores por defecto**, `hostUid` sólo
  del JWT, 409/403/503/500 por motivo. **El `detalle` interno de un fallo NO
  viaja en el body**: el handler lo devuelve aparte, acotado a 200 caracteres,
  sólo para el log del servidor. 6 tests (uno mete un detalle reconocible y
  comprueba que no aparece en la respuesta).
- `lib/sala/preparar.ts` (server-only) — cableado con `supabaseAdmin()`,
  `cardsByIds` y `roulettePlatformNames`; cuenta las RPC admin (no pasan por el
  observador de `lib/supabase.ts`).
- `app/api/sala/preparar/route.ts` — `conCors`, `maxDuration 60`, línea
  `[sala] preparar <size>/<duracion> <estado> (<consultadas> consultadas,
  <enriquecidas> enriquecidas, <descartadas> descartadas) <status> | tmdb … |
  redis … | supabase … + N rpc admin | ms [| detalle: …]`.
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

**Corrida 3 (lotes adaptativos, cuentas todavía "enriquecidas = consultadas"),
tres tamaños alternados en un proceso recién levantado:**

| size | estado | consultadas | válidas | TMDB | Redis cmd (hit/miss) | Supabase + rpc | ms servidor | ms pared |
|---|---|---|---|---|---|---|---|---|
| 5 | frío | 5 | 5 | **10** | 14 (0/11) | 2 + 3 | **846** | 1841 |
| 5 | caliente | 5 | 5 | 0 | 2 (6/0) | 1 + 3 | 242 | 270 |
| 5 | control | 5 | 5 | 0 | 2 (6/0) | 1 + 3 | 195 | 227 |
| 10 | frío | 10 | 10 | **20** | 23 (1/20) | 1 + 3 | **1040** | 1072 |
| 10 | caliente | 10 | 10 | 0 | 2 (11/0) | 1 + 3 | 168 | 194 |
| 10 | control | 10 | 10 | 0 | 2 (11/0) | 1 + 3 | 360 | 404 |
| 20 | frío | 25 | 24 | **50** | 56 (2/50) | 1 + 3 | **2738** | 2783 |
| 20 | caliente | 25 | 24 | 0 | 4 (27/0) | 1 + 3 | 315 | 344 |
| 20 | control | 25 | 24 | 0 | 4 (27/0) | 1 + 3 | 348 | 388 |

(En esa versión la línea decía "25 enriquecidas, 1 descartada": el 25 eran las
candidatas ENVIADAS, no las cards devueltas. Se corrigió: hoy la ruta separa
`consultadas` / `enriquecidas` / `descartadas`.)

### Tres frías independientes de tamaño 20 (código final)

Pedido del cierre de la Etapa 2: tres preparaciones frías de 20 con el código
final, **proceso reiniciado y caché en memoria vacía antes de cada una**
(`preview_stop` + `preview_start`), caliente y control inmediatamente después de
cada frío. Líneas crudas del servidor, corrida por corrida, en
[`2026-09-19-salas-preparacion-crudo.txt`](2026-09-19-salas-preparacion-crudo.txt).

| corrida | estado | consultadas | enriquecidas | descartadas | TMDB (ok) | Redis cmd (hit/miss) | Supabase + rpc | **ms servidor** | ms pared |
|---|---|---|---|---|---|---|---|---|---|
| 3 | frío | 25 | 24 | 1 | 50 (48) | 55 (1/51) | 2 + 3 | **2952** | 3805 |
| 3 | caliente | 25 | 24 | 1 | 2 (0) | 5 (26/2) | 1 + 3 | 357 | 385 |
| 3 | control | 25 | 24 | 1 | 2 (0) | 5 (26/2) | 1 + 3 | 364 | 394 |
| 4 | frío | 25 | 24 | 1 | 50 (48) | 55 (1/51) | 2 + 3 | **2856** | 4899 |
| 4 | caliente | 25 | 24 | 1 | 2 (0) | 5 (26/2) | 1 + 3 | 311 | 341 |
| 4 | control | 25 | 24 | 1 | 2 (0) | 5 (26/2) | 1 + 3 | 399 | 431 |
| 5 | frío | 30 | 25 | 7 | 60 (50) | 57 (1/61) | 2 + 3 | **2046** | 3083 |
| 5 | caliente | 30 | 25 | 7 | 10 (0) | 6 (27/10) | 1 + 3 | 650 | 713 |
| 5 | control | 30 | 25 | 7 | 10 (0) | 6 (27/10) | 1 + 3 | 586 | 621 |

**Frío de servidor: 2952 / 2856 / 2046 ms → máximo 2952 ms.** Son tres
observaciones y su máximo, **no un p95 estadístico**: con tres muestras no hay
percentil que calcular. Las tres quedan debajo del umbral del plan (≤ 6 s), y
los caliente entre 0,31 y 0,65 s. El "ms pared" del frío incluye la compilación
de la ruta por `next dev` (`Compiled /api/sala/preparar in 573 / 1573 / 685 ms`),
que no existe en un build de producción.

**Dos corridas más quedan registradas y fuera del cómputo.** La corrida 1
(3170 ms de servidor, 59 s de pared) corrió con la pestaña del preview cargando
el Home: la ruta se compiló y respondió detrás de la composición del Home, y no
se conservó el log completo para descartar tráfico a TMDB en paralelo — vale
como cota bajo carga, no como observación limpia. La corrida 2 está
**descartada**: el Home compuso en paralelo (450 llamadas a TMDB) y `next dev`
recompiló entre requests, lo que **vació la caché de proceso** — caliente y
control volvieron a pagar 51 llamadas. Incumple MANTENIMIENTO 8.b (nada más
contra TMDB mientras se mide). Desde la corrida 3 la pestaña se manda a
`offline.html` apenas arranca el servidor y se comprueba en el log que
`/api/home` no compuso (o que ya había terminado) antes de correr el script.

**Los "descartes por error de TMDB" son los fixtures locales.** Comprobado
sobre la sala de la corrida 5: entre las 30 primeras candidatas de su semilla
están `90000006`, `90000007`, `90000008`, `90000022` y `90000023` — ids de
`scripts/sala/fixtures-local.sql` ("Ficticia", con Netflix / Disney Plus / HBO
Max entre sus providers) — y TMDB responde 404 (`status_code 34`) para los
cinco. `db-local.mjs --catalogo-real` carga el catálogo real **y** los fixtures,
así que en local entran a las tandas de n,d,m, cuestan 2 llamadas a TMDB cada
uno antes de descartarse y, como `titleCard` no guarda `null`, se reintentan en
cada preparación (los "10 llamadas (0 ok)" del caliente). Es un **sesgo
pesimista** de la medición local —llamadas de más, nunca de menos— y en
Producción no hay fixtures. Explica también el "1 descarte estable" de las
corridas anteriores, que había quedado sin identificar.

Lectura general: **2 llamadas a TMDB por consultada en frío** (detalle +
proveedores), 0 llamadas exitosas en caliente; el control coincide con el
caliente en las tres unidades. "Supabase" cuenta el `usuarioDeToken` (1) más,
en la primera, la lectura de `ed:pub` de `publishedIds` (caché 5 min); las 3
RPC admin son iniciar / candidatas / publicar.

**Lo que cambió entre corridas de la Tarea 2.3, y por qué se midió varias veces:**

| corrida | lote | 5 frío | 10 frío | 20 frío |
|---|---|---|---|---|
| 1 | fijo 20 | 40 TMDB (20 consultadas para usar 5) · 3,5 s | 37 · 3,0 s | 75 (≈40 consultadas) · 3,8 s |
| 2 | = size | 10 · 0,7 s | 20 · 0,8 s | 81 (2.º lote fijo de 20) · 4,2 s |
| 3 | 1.º = size, siguientes = max(5, 2·faltan) | 10 · 0,8 s | 20 · 1,0 s | **50** (25 consultadas, 24 enriquecidas) · 2,7 s |

**Qué NO dice esta medición:** nada sobre Producción (Redis real, Vercel, red
del teléfono) ni sobre concurrencia entre salas o con el Home. `pv3:`/`card:`
en Producción se comparten con el resto de la app, así que el "caliente" real
será más frecuente que acá; el "frío" real paga además el round-trip a Upstash
por cada card (~40 SET para 20).

## Verificación

- `node --test lib/sala/*.test.ts` → **25/25** (9 selección + 10 orquestación +
  6 handler). `npx tsc --noEmit` limpio.
- `npm run build` (con red) en verde: `/api/sala/preparar` aparece como ruta
  dinámica (ƒ) y no hay error de frontera `server-only`.
- Suite completa **después del build**: **1745 tests, 1735 ok, 0 fallos, 10
  omitidos** — los 10 son los del artefacto Capacitor (`out-capacitor`), que es
  la línea base; los seis "WEB: sin build web" que `next dev` había dejado
  omitidos vuelven a correr.
- Batería PostgREST tras reconstruir el entorno: 37/37 (Etapa 1, sin cambios).

## Qué NO se hizo

Aplicar 009 en Producción; deploy; encender salas; refresco del catálogo;
merge; push. La Etapa 3 (cliente: lobby y votación) **no está autorizada
todavía**.
