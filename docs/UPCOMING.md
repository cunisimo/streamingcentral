# Agenda de Estrenos — infraestructura

Motor que sincroniza los próximos estrenos (películas, nuevas temporadas,
próximos episodios) de TMDB a Supabase una vez por día, para que la app **nunca**
consulte TMDB en vivo por estrenos. Lo consumirán Planner, Home y notificaciones.

## Piezas

- **Schema** (`supabase/schema.sql`, sección "Agenda de Estrenos"): tablas
  normalizadas `providers`, `upcoming_content`, `upcoming_content_providers`.
  RLS de lectura pública; escritura solo con service role.
- **Edge Function** (`supabase/functions/tmdb-sync/`): Deno. Dispatcher por `job`.
  Hoy implementa `syncUpcoming`; `syncProviders/syncTrending/syncPopular/syncGenres`
  son scaffolding (devuelven 501).
- **Cron** (`supabase/cron.sql`): pg_cron diario que invoca la función.
- **Read path** (`lib/upcoming.ts` + `app/api/upcoming/route.ts`): el UpcomingService
  que lee Supabase y expone la Agenda a la app. Es lo único que toca la app; la
  función es backend puro.

## Regla de negocio

Se guarda **solo** lo que tiene ≥1 proveedor de streaming flatrate en AR. La
lista completa de plataformas queda normalizada en el join.

**Límite de la fuente:** TMDB no publica watch-providers hasta cerca del estreno,
así que la Agenda cubre sobre todo estrenos cercanos y originales de plataforma
ya listados. No es un bug.

## Despliegue (requiere Supabase CLI)

```bash
# 1. Schema: correr la sección nueva de supabase/schema.sql en el SQL editor
#    (o) supabase db push

# 2. Secrets de la función
supabase secrets set TMDB_READ_TOKEN=<token_v4>
# SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las inyecta Supabase solas.

# 3. Deploy de la función
supabase functions deploy tmdb-sync

# 4. Invocación manual (prueba)
curl -X POST "https://<ref>.supabase.co/functions/v1/tmdb-sync" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"job":"syncUpcoming"}'
# -> { job, candidates, kept, upserted, providers, dropped, deleted, window, durationMs }
#    kept=guardados (≥1 provider AR); dropped=evaluados que perdieron provider y se borraron;
#    deleted=expirados por fecha. upserted cuenta filas afectadas (insert+update juntos).

# 5. Cron diario: correr supabase/cron.sql (reemplazando ref + key)
```

## Parámetros (env de la función, opcionales)

- `SYNC_WINDOW_DAYS` (default 90) — ventana hacia adelante.
- `SYNC_MAX_PAGES` (default 5) — páginas de discover por tipo.
- `SYNC_GRACE_DAYS` (default 2) — días de gracia antes de expirar un estreno pasado.

## Read path (app)

`GET /api/upcoming`:
- `?mediaType=movie|tv`
- `?platform=n|d|m|...` (código interno)
- `?month=YYYY-MM`
- `?items=movie:123,tv:456` (cruce con la Watchlist; el browser manda sus refs)

Idempotencia: correr la función N veces el mismo día deja el mismo estado
(upsert por `tmdb_id+media_type`, links reemplazados en bloque, expiración por fecha).

## Seguridad

La función valida `role="service_role"` en el JWT del header Authorization: la
anon key (role="anon") es rechazada con 403. Solo el cron/backend (con la
service role key) puede dispararla.

## Limitación conocida (aceptada v1)

El reemplazo de links por título es delete+insert no transaccional: existe una
ventana de milisegundos (a las 6am, tráfico bajo) donde un título podría leerse
con 0 plataformas. El fix definitivo es un RPC transaccional en Postgres; queda
para un hardening futuro.

## El idioma del sync, y el póster (decidido el 2026-08-24)

El sync escribe en el idioma que diga `IDIOMA_TITULOS` (secret de Edge
Functions, default `es-ES`), con respaldo a `es-ES` cuando TMDB no traduce.

**`poster_path` cambia con el idioma, y es DELIBERADO.** Los pósters de TMDB son
localizados: el de `es-MX` no es el de `es-ES`. La primera corrida en `es-MX`
cambió el póster de 12 de 43 filas. No es un daño ni un efecto colateral que
haya que corregir — acompaña el objetivo de encontrabilidad, que es que el
usuario vea en Yump lo mismo que va a ver en la plataforma.

**El backfill NO comparte ese alcance**: sigue limitado a `title`, `overview` y
`episode_name`. La diferencia no es contradictoria: el sync reescribe la fila
entera porque es su trabajo, y el backfill toca lo mínimo porque corre sobre
filas que nadie está mirando.

### Qué hace el sync cuando el respaldo no alcanza

La decisión es **por campo** y sobre el resultado **ya fusionado** — no sobre si
la fusión cambió algo:

| Situación | Qué pasa | Métrica |
|---|---|---|
| Sinopsis vacía en los dos idiomas | **se escribe** | `sinopsis_sin_mejora` |
| Título sigue roto después de fusionar | **no se escribe**, la fila anterior queda | `titulo_sin_reparar` |
| Episodio sin nombre en los dos idiomas | se conserva vacío | `episodio_sin_nombre` |
| Episodio ilegible sin respaldo útil | **no se escribe** | `episodio_no_reparado` |
| El respaldo se cayó | **no se escribe** | `fallos` |

**Los dos primeros no son problemas.** Una sinopsis vacía en es-MX que también
está vacía en es-ES no la rompió el cambio de idioma: ese título no tiene
sinopsis en español y nunca la tuvo. Descartarlos —que fue la primera versión—
tiró 79 títulos de 120 en la primera corrida real y bajó el descubrimiento a un
tercio.

**Solo `fallos` justifica reintentar.** Los demás son datos sobre el catálogo,
no fallas.
