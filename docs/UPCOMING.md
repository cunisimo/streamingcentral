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
# -> { job, candidates, kept, upserted, providers, deleted, window, durationMs }

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
