-- SÓLO LOCAL. Deja la base de `supabase start` con lo que Producción ya tiene
-- habilitado desde el panel (comprobado por el dueño el 2026-09-18: pg_cron
-- 1.6.4, pgcrypto 1.3, pg_net, realtime.send). En Producción NO se corre: ahí
-- las extensiones se administran desde el panel, no desde una migración.
create extension if not exists pg_cron;
create extension if not exists pgcrypto with schema extensions;
