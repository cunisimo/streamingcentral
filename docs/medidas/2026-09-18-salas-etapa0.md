# Salas compartidas — Etapa 0: precondiciones, auditoría y entorno local

Plan: [`superpowers/plans/2026-09-17-salas-compartidas.md`](../superpowers/plans/2026-09-17-salas-compartidas.md).
Rama `feat/salas`. Sin merge, sin push, sin deploy, sin migraciones en Producción.

## Tarea 0.1 — Lectura del panel (informado por el dueño el 2026-09-18, comprobado en panel)

| Ítem | Valor |
|---|---|
| Plan de Supabase | Free |
| PostgreSQL | 17.6 |
| `realtime.send(payload jsonb, event text, topic text, private boolean)` | **presente** (→ go de la Etapa 1) |
| `realtime.broadcast_changes` | presente |
| Realtime | activado; "Allow public access to channels" **activado** |
| Extensiones | `pg_cron` 1.6.4 · `pg_net` 0.20.3 · `pgcrypto` 1.3 |
| `cron.job` | `tmdb-sync-upcoming-daily`, `0 6 * * *`, activo |
| Uso Realtime (24 h visibles del Free) | sin actividad |
| `SUPABASE_SERVICE_ROLE_KEY` en Vercel | existe en Production y Preview |
| Vercel, últimos 30 días | 19K / 1M invocaciones · 29m53s / 4h Active CPU · 5,4 / 360 GB-h memoria · 170,65 MB / 100 GB Fast Data Transfer · 393,7 MB / 1 GB Function Storage |

Con `pg_cron` 1.6.4 sobre PostgreSQL 17.6 la sintaxis `"N seconds"` está disponible;
el plan usa `* * * * *` (un minuto), que alcanza para la ventana de 5 min.

## Tarea 0.2 — SQL de auditoría (sólo lectura)

`scripts/sala/auditoria-pool.sql`: cinco consultas con los mismos filtros que
tendrá `sala_candidatos`. **Pendiente de correr en Producción por el dueño**;
el criterio de go de la Etapa 1 es `cualquiera >= 20` en `n,d,m`, `n,d` y
`n,d,m,p`, y `>= 10` en `n`.

Prueba de humo en la base **local** cargada con `data/carga-ruleta-*.sql`
(la carga versionada en `data/`, **no** la base de Producción, aunque los
totales coinciden con MANTENIMIENTO §9 — ver abajo):

**Cambio de requisito del 2026-09-18 (dueño):** el "Pero" (`advertencia`)
pasa a ser **opcional**; `razon` sigue siendo obligatoria. La auditoría se
actualizó (consultas 1, 3 y 5) y se volvió a correr en local:

| unión | cualquiera | corta | larga | sin_pero (admitidas) |
|---|---|---|---|---|
| n,d,m | 1005 | 131 | 874 | 180 |
| n | 317 | 44 | 273 | 46 |
| n,d | 638 | 79 | 559 | 114 |
| n,p | 611 | 91 | 520 | 83 |
| n,d,m,p | 1245 | 174 | 1071 | 209 |
| d / m / p | 335 / 424 / 336 | 35 / 53 / 47 | 300 / 371 / 289 | 70 / 77 / 41 |
| mb | 101 | 26 | 75 | 12 |

(Con la regla anterior —ambos textos— `n,d,m` daba 825 / 107 / 718: el "pero"
opcional abre ~22 % más de pool en esa unión.)

Pool local: **2449** filas `movie` = **2401** de `data/carga-ruleta-*.sql` +
**48** películas ficticias (49 fixtures, una es `tv`; la 48.ª es "Sin pero",
servible desde el cambio de regla). Con `razon`: 2306; con `razon` y
`advertencia`: 1828 = 1782 reales + 46 ficticias — el 1782 es exactamente el
"con advertencia" de MANTENIMIENTO §9 (11/08), así que `data/` es la misma
foto que Producción a esa fecha. Servibles para sala con la regla nueva:
**1922** (antes 1600); la consulta 5 cuenta **478** títulos con razón y sin
pero, que ahora se admiten, y 143 sin razón, que siguen afuera.

**Corrección de un número publicado en esta sesión:** un conteo anterior dijo
"2212 títulos en `data/`". Era otra magnitud: `count(*) where tmdb_id <
900000`, o sea los títulos reales con id **menor a 900.000**; TMDB ya emite
ids hasta 1.668.364 y 189 del catálogo superan ese umbral. El total real es
2401. De ese error salió otra corrección: las fixtures sintéticas estaban en
`900001…900107`, un rango que TMDB alcanza y que podía chocar con títulos
reales; se movieron a `90000001…90000107`, y el estado local se purgó y
volvió a cargar (2401 + 47 = 2448 verificado).

La fecha `mas_vieja`/`mas_nueva` de la consulta 2 en local es la hora de la
carga (`now()` del upsert), no la de Producción. Los números que valen son los
de Producción.

La consulta 4 (nombres de plataforma en AR) devuelve en local 38 nombres, entre
ellos varios que no están en `lib/roulette-providers.ts` (Plex, Pluto TV,
Mercado Play, Runtime, FilmBox+…): son las exclusiones deliberadas de
MANTENIMIENTO §5, a revisar contra la salida de Producción.

## Tarea 0.3 — `--solo-datos` en `scripts/build-roulette-sql.mjs`

- Tests: `node --test scripts/build-roulette-sql.test.mjs` → 5/5.
- **Control válido** (8.b): la salida del script de `HEAD~` y la del nuevo en
  modo normal son idénticas — 7 archivos, `md5 6754c157fa4373a3b7080078e53c9482`
  del concatenado. Un primer control con `git status data/` fue **inválido**:
  `data/carga-ruleta-*.sql` están ignorados por `.gitignore:21`, así que "sin
  cambios" no probaba nada.
- En `--solo-datos` el `insert … on conflict` no menciona `razon`,
  `advertencia` ni `atencion` (verificado con `diff` sobre `carga-ruleta-1.sql`).
- **No se ejecutó contra Producción.** `data/` quedó regenerado en modo normal.

## Tarea 0.5 — Entorno local

- `db-local.mjs` elige el contenedor por **`project_id` exacto** leído de
  `supabase/config.toml` (`supabase_db_streamingcentral`) y falla si no está
  o si la coincidencia no es única; nunca por prefijo. Selector puro probado
  en `scripts/sala/db-local.test.mjs` (6/6) y negativo real contra
  `docker ps` con un `project_id` inexistente.

- Docker Engine 29.8.0 corriendo (versión del daemon vía `docker version`; la
  de Docker Desktop no se leyó); Supabase CLI 2.111.0; `supabase init` →
  `supabase/config.toml` con `[db.migrations] enabled = false` y `[db.seed]
  enabled = false` (motivo en el archivo). **Sin `supabase link`.**
- `supabase start` levantó PostgreSQL 17.6 local con `pgcrypto` 1.3,
  `pg_net` 0.20.4 y `realtime.send`/`broadcast_changes` presentes. `pg_cron`
  no venía creada: `scripts/sala/local-pre.sql` (sólo local) la habilita →
  1.6.4, misma versión que Producción.
- `node scripts/sala/db-local.mjs` aplica `local-pre.sql`, `schema.sql`, 001,
  002, 003, (009 cuando exista), opcionalmente `data/carga-ruleta-*.sql` con
  `--catalogo-real`, y las fixtures. Idempotente (segunda corrida: sólo avisos
  "already exists").
- Comprobado **con la anon key local vía PostgREST**, no desde psql: `select`
  directo a `roulette_titles` → 401 `42501`; `get_roulette_picks` con
  `p_limit 999` → 40 filas (cap); `corta` con n,d,m → 6 (las 5 fixtures cortas
  **más la serie 900106**: `get_roulette_picks` no filtra `media_type`, lo que
  confirma que `sala_candidatos` tiene que hacerlo); MUBI → sólo 90000041.
- Fixtures tras el cambio de regla: 41 "Ficticia" + "Sin pero" (90000042,
  `advertencia` NULL, HBO Max) = **41 candidatas** con `n,d,m`; el control
  negativo por texto pasa a ser "Sin razón" (90000104). Recargado y verificado:
  2401 + 48 = 2449 películas.
- `.env.sala-local` (ignorado) con las claves locales; `.env.sala-local.example`
  versionado.

## Qué NO se hizo

Aplicar nada en Producción; refresco productivo (Apéndice A); deploy; merge;
push; encender `sala_config.activas`. La Etapa 1 espera la salida real de
`auditoria-pool.sql` en Producción.
