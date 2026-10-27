-- Rollback de 020 (E7): quita el Top Yumpers. Borra lo consolidado
-- (`top_meses`, `top_resultados`): es derivado de los tramos y se puede volver
-- a calcular al subir 020 mientras no haya purga (E8). No toca tramos,
-- votos, suspensiones ni participantes.
begin;

drop function if exists public.comunidad_top_yumpers_activo();
drop function if exists public.comunidad_top_yumpers(date);
drop function if exists comunidad.consolidar_mes(date);
drop function if exists comunidad.puntos_al_corte(date, timestamptz);
drop table if exists comunidad.top_resultados;
drop table if exists comunidad.top_meses;
drop index if exists comunidad.tramos_por_mes;

commit;
