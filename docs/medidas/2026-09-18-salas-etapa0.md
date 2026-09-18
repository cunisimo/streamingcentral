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
(snapshot parcial versionado, **no** es Producción):

| unión | cualquiera | corta | larga |
|---|---|---|---|
| n,d,m | 825 | 107 | 718 |
| n | 271 | 36 | 235 |
| n,d | 524 | 64 | 460 |
| n,p | 528 | 76 | 452 |
| n,d,m,p | 1036 | 144 | 892 |
| d / m / p | 265 / 347 / 295 | 28 / 44 / 40 | 237 / 303 / 255 |
| mb | 89 | 25 | 64 |

Pool local: 2448 filas `movie` (2212 del snapshot + fixtures), 1828 con ambos
textos, 1600 servibles para sala. **Ojo:** MANTENIMIENTO §9 (11/08) daba 2401
filas y 2259 con texto en Producción; `data/` es otra foto. Los números que
valen son los de Producción.

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

- Docker Desktop 29.8.0 corriendo; Supabase CLI 2.111.0; `supabase init` →
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
  confirma que `sala_candidatos` tiene que hacerlo); MUBI → sólo 900041.
- `.env.sala-local` (ignorado) con las claves locales; `.env.sala-local.example`
  versionado.

## Qué NO se hizo

Aplicar nada en Producción; refresco productivo (Apéndice A); deploy; merge;
push; encender `sala_config.activas`. La Etapa 1 espera la salida real de
`auditoria-pool.sql` en Producción.
