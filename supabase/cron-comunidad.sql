-- Jobs de la purga de reseñas de la comunidad (E8). 🔴 NO EJECUTAR SIN
-- AUTORIZACIÓN EXPRESA DEL DUEÑO: programarlo es un cambio en Producción
-- (revisión §2.5) y la purga borra físicamente. Este archivo no se aplica
-- solo: no está en ninguna lista de migraciones ni en scripts/sala/db-local.mjs.
--
-- Requisitos, en este orden:
--   1. 021_comunidad_purga.sql aplicada (y, antes, 011–020).
--   2. Los plazos de `comunidad.purga_config` revisados (P3). Este archivo NO
--      enciende la purga: sin `purga_activa = true`, cada corrida vuelve sin
--      hacer nada. Encenderla es un paso aparte y explícito:
--        update comunidad.purga_config set purga_activa = true, actualizada_en = now() where id;
--
-- Corre DIRECTO EN SUPABASE (pg_cron, SQL puro, como `sala-barrido` en 009):
-- sin Vercel, sin pg_net, sin claves y sin servicios nuevos. El comando es un
-- CALL a un procedimiento del dueño que confirma cada lote, así que no hay
-- transacciones largas. Ningún job toca `sala-barrido`, `tmdb-sync` ni otros:
-- sólo se (re)programan estos dos nombres.
--
--   - comunidad-purga-hora: minuto 17 de cada hora, las órdenes de "Más
--     útiles" vencidas.
--   - comunidad-purga-dia: 06:40 UTC (03:40 en Argentina), todo lo demás.
-- Los horarios evitan el minuto 0 (ahí corren otros jobs del proyecto).

create extension if not exists pg_cron;

-- Idempotente: si ya existían, se desprograman antes de volver a crearlos.
select cron.unschedule('comunidad-purga-hora')
where exists (select 1 from cron.job where jobname = 'comunidad-purga-hora');
select cron.unschedule('comunidad-purga-dia')
where exists (select 1 from cron.job where jobname = 'comunidad-purga-dia');

select cron.schedule('comunidad-purga-hora', '17 * * * *', $$ call comunidad.purgar('hora'); $$);
select cron.schedule('comunidad-purga-dia', '40 6 * * *', $$ call comunidad.purgar('dia'); $$);

-- Verificar:
--   select jobname, schedule, command, active from cron.job where jobname like 'comunidad-purga-%';
-- Historial (pg_cron) y registro propio, sin textos ni datos personales:
--   select * from cron.job_run_details where command like '%comunidad.purgar%' order by start_time desc limit 10;
--   select id, alcance, estado, iniciada_en, terminada_en, resumen from comunidad.purga_ejecuciones order by id desc limit 10;
--
-- Desprogramar (rollback de los jobs; NO recupera lo ya purgado):
--   select cron.unschedule('comunidad-purga-hora') where exists (select 1 from cron.job where jobname = 'comunidad-purga-hora');
--   select cron.unschedule('comunidad-purga-dia')  where exists (select 1 from cron.job where jobname = 'comunidad-purga-dia');
-- Apagar sin desprogramar (las corridas siguientes no hacen nada y una en
-- curso se detiene en el próximo lote):
--   update comunidad.purga_config set purga_activa = false, actualizada_en = now() where id;
