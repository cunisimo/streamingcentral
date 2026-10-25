-- Rollback de 014_comunidad_escritura.sql: borra sólo lo que esa migración
-- creó. Va ANTES de 013_down. Antes de activar no hay datos reales; si los
-- hubiera, se pierden las aceptaciones de términos y los intentos.
begin;

drop function if exists public.comunidad_leer_titulo(uuid, text, integer);
drop function if exists public.comunidad_textos_recientes(uuid);
drop function if exists public.comunidad_retirar_voto(uuid, bigint);
drop function if exists public.comunidad_votar(uuid, bigint, boolean);
drop function if exists public.comunidad_borrar(uuid, bigint);
drop function if exists public.comunidad_editar(uuid, bigint, bigint, text, jsonb, uuid, text);
drop function if exists public.comunidad_publicar(uuid, text, integer, text, jsonb, uuid, text);
drop function if exists public.comunidad_aceptar_terminos(uuid, text);

drop function if exists comunidad.rechazo_cuenta(text, jsonb);
drop function if exists comunidad.intento_previo(uuid, text, uuid, text);
drop function if exists comunidad.decision_valida(jsonb);
drop function if exists comunidad.consumir_cupo(uuid, text, date);
drop function if exists comunidad.hay_cupo(uuid, text, date);
drop function if exists comunidad.condiciones_a(uuid, uuid);
drop function if exists comunidad.dia_ar(timestamptz);

drop table if exists comunidad.intentos;

do $$
begin
  if to_regclass('comunidad.participantes') is not null then
    alter table comunidad.participantes
      drop column if exists terminos_version,
      drop column if exists terminos_aceptados_en;
  end if;
  if to_regclass('comunidad.config') is not null then
    alter table comunidad.config
      drop constraint if exists config_terminos_forma,
      drop column if exists terminos_version;
  end if;
end;
$$;

commit;
