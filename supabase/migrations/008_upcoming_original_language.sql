-- Próximamente: el idioma original, para poder distinguir anime de animación.
--
-- POR QUÉ. "Animación" y "anime" no son lo mismo, y el tope del 20% de la
-- sección tiene que aplicarse al segundo. Medido el 2026-09-04 sobre las 238
-- filas vigentes: de los 100 títulos con género Animación, 19 NO son anime —
-- Los Simpson, South Park, Futurama, American Dad, Teen Titans Go!, Masha y el
-- Oso (rusa), Super Wings (coreana), Tres Espías Sin Límite (francesa). Topear
-- "animación" habría estado sacando a los Simpson para dejar entrar anime.
--
-- Con `original_language = 'ja'` más el género, la clasificación acierta 81 de
-- 81 en esa medición, incluidos los tres de título romanizado que ninguna
-- heurística sobre el título original puede ver: BLEACH, BEYBLADE X y MAO.
--
-- NO CUESTA NINGUNA LLAMADA A TMDB. `discover` ya devuelve el campo en cada
-- resultado —verificado contra la API: `adult, backdrop_path, first_air_date,
-- genre_ids, id, name, origin_country, original_language, original_name,
-- overview, popularity, poster_path, softcore, vote_average, vote_count`— y el
-- sync lo estaba descartando porque su interfaz `RawTitle` no lo declaraba.
--
-- ⚠️ `origin_country` NO SE AGREGA, y no es un olvido. Se midió: aporta
-- exactamente CERO títulos. La animación cuyo `origin_country` incluye JP son
-- 76, y los que tienen `original_language = 'ja'` son los mismos 76. Habría
-- sido una columna sin consumidor.
--
-- INCREMENTAL Y COMPATIBLE:
--
--  * `if not exists` la vuelve idempotente: correrla dos veces no falla.
--  * Nullable y sin default, así que no reescribe las 246 filas existentes ni
--    toma un lock de tabla largo. En Postgres, un `add column` nullable sin
--    default es sólo metadata.
--  * Las filas actuales quedan en NULL y la app sigue funcionando: sin idioma,
--    un título sólo cuenta como anime si está en Crunchyroll (67 de los 81, o
--    sea 83% de recall). El tope se aplica igual, sobre menos títulos. Está
--    fijado por el test "sin originalLanguage sólo queda la señal de
--    Crunchyroll, y no rompe" en `lib/proximamente.test.ts`.
--
-- NO HACE FALTA BACKFILL, y esto es lo que hay que verificar si alguien duda:
-- `syncUpcoming` hace un `upsert` con `onConflict: 'tmdb_id,media_type'` de
-- TODOS los candidatos que descubre en cada corrida, o sea que reescribe la fila
-- entera —no un subconjunto de columnas—. Toda fila que siga siendo vigente se
-- reescribe en la próxima corrida (el cron es diario, 6am hora argentina) y
-- queda con el idioma puesto. Las que no se re-descubren las borra la
-- reconciliación a los `GRACE_DAYS`. La ventana sin el dato es de un día como
-- máximo, y degrada en vez de romper.
--
-- Es el mismo criterio que la 006, que sí necesitó un backfill: esa reparaba
-- texto ya escrito en filas que nadie estaba mirando. Ésta agrega un campo que
-- la corrida siguiente completa sola.

alter table public.upcoming_content
  add column if not exists original_language text;

comment on column public.upcoming_content.original_language is
  'Idioma original de TMDB (ISO 639-1: "ja", "en", "ko"). Lo escribe el sync '
  'desde discover. Único consumidor: la clasificación de anime de '
  'lib/proximamente.ts. NULL en filas anteriores a esta migración; el sync '
  'las completa en su próxima corrida y la app tolera el NULL.';
