-- Rollback de 013_comunidad_protocolo.sql: borra sólo lo que esa migración
-- creó. Va ANTES de 012_down y 011_down.
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

commit;
