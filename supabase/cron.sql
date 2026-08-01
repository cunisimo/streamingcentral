-- Cron diario que dispara la Edge Function tmdb-sync (job=syncUpcoming).
-- Correr UNA vez en el SQL editor de Supabase (o Dashboard -> Database -> Cron).
-- Requiere las extensiones pg_cron + pg_net (disponibles en Supabase).
--
-- Reemplazar:
--   <PROJECT_REF>       -> el ref del proyecto (el de NEXT_PUBLIC_SUPABASE_URL)
--   <SERVICE_ROLE_KEY>  -> la service role key del proyecto
-- Recomendado: guardar la key en Vault y leerla, en vez de hardcodearla acá.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotente: re-crear el schedule si ya existía.
select cron.unschedule('tmdb-sync-upcoming-daily')
where exists (select 1 from cron.job where jobname = 'tmdb-sync-upcoming-daily');

select cron.schedule(
  'tmdb-sync-upcoming-daily',
  '0 6 * * *',                       -- 06:00 UTC todos los días
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/tmdb-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object('job', 'syncUpcoming')
  );
  $$
);

-- Verificar:  select * from cron.job;
-- Historial:  select * from cron.job_run_details order by start_time desc limit 10;
