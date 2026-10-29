-- Rollback de 013_comunidad_protocolo.sql: borra sólo lo que esa migración
-- creó o redefinió. Va ANTES de 012_down y 011_down.
begin;

drop function if exists comunidad.mes_ar(timestamptz);
drop function if exists comunidad.rige_antes_de(timestamptz, timestamptz, timestamptz);
drop function if exists comunidad.corte_de_mes(date);
drop function if exists comunidad.proto_corte_exclusivo();
drop function if exists comunidad.proto_marca();
drop function if exists comunidad.proto_contadores(uuid, text[], date);
drop function if exists comunidad.proto_suspensiones(uuid[]);
drop function if exists comunidad.proto_votos(uuid[], bigint[]);
drop function if exists comunidad.proto_versiones(bigint[]);
drop function if exists comunidad.proto_resena(bigint);
drop function if exists comunidad.proto_participantes(uuid[]);
drop function if exists comunidad.proto_cuenta(uuid, boolean);
drop function if exists comunidad.proto_avanzar(integer, text);
drop function if exists comunidad.proto_nivel();

-- resolver_participante vuelve a la definición de 012, TAL CUAL (con su
-- FOR UPDATE): 013 la había redefinido sin bloquear la fila (auditoría de
-- E2c, A1). Copia literal de 012_comunidad_baja.sql.
create or replace function comunidad.resolver_participante(p_uid uuid, p_crear boolean)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id      uuid;
  v_sancion timestamptz;
  v_ahora   timestamptz;
begin
  if p_uid is null then
    raise exception 'resolver_participante: uid nulo' using errcode = '22004';
  end if;
  perform comunidad.tomar_cuenta(p_uid);

  if exists (select 1 from comunidad.bajas_en_curso
              where user_id = p_uid and cancelada_en is null) then
    raise exception 'baja_en_curso' using errcode = 'CB001',
      detail = 'La cuenta tiene una eliminación pendiente: no se aceptan operaciones comunitarias.';
  end if;

  select id into v_id from comunidad.participantes where user_id = p_uid for update;
  if found or not p_crear then
    return v_id;
  end if;

  insert into comunidad.participantes (user_id) values (p_uid) returning id into v_id;

  select sancion_hasta into v_sancion from comunidad.bajas_en_curso
   where user_id = p_uid and cancelada_en is not null;
  v_ahora := clock_timestamp();
  if v_sancion is not null and v_sancion > v_ahora then
    insert into comunidad.suspensiones (participante_id, desde, hasta)
    values (v_id, v_ahora, case when v_sancion = 'infinity' then null else v_sancion end);
  end if;
  return v_id;
end;
$$;
revoke all on function comunidad.resolver_participante(uuid, boolean) from public, anon, authenticated, service_role;

commit;
