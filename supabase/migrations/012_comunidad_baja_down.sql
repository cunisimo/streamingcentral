-- Rollback de 012_comunidad_baja.sql: borra sólo lo que esa migración creó.
-- Antes de activar no hay datos reales. Si ya hubiera marcadores con
-- `sancion_hasta` o `cancelada_en`, esas columnas se pierden: informarlo antes
-- de correr esto (plan, rollback general).
begin;

drop function if exists public.comunidad_baja_comunitaria(uuid);
drop function if exists public.comunidad_baja_comunitaria_admin(uuid);
drop function if exists public.comunidad_estado_baja(uuid);
drop function if exists public.comunidad_baja_registrar_fallo(uuid, text);

do $$
begin
  if to_regclass('comunidad.participantes') is not null then
    drop trigger if exists participantes_desvinculado on comunidad.participantes;
    drop trigger if exists participantes_vinculo on comunidad.participantes;
  end if;
  if to_regclass('comunidad.bajas_en_curso') is not null then
    alter table comunidad.bajas_en_curso
      drop constraint if exists bajas_origen,
      drop column if exists origen,
      drop column if exists sancion_hasta,
      drop column if exists cancelada_en;
  end if;
end;
$$;

drop function if exists comunidad.participantes_desvinculado();
drop function if exists comunidad.participantes_vinculo();
drop function if exists comunidad.aplicar_baja(uuid, text);
drop function if exists comunidad.limpiar_participante(uuid);
drop function if exists comunidad.resolver_participante(uuid, boolean);
drop function if exists comunidad.tomar_cuenta(uuid);

commit;
