-- AYUDA SÓLO LOCAL para la batería del Top Yumpers (E7, plan: "igualdad
-- exacta en T(M) con marcas forzadas por solo-local.sql"). NUNCA va en una
-- migración: scripts/comunidad/local.test.mjs falla si algún archivo de
-- supabase/migrations/ contiene `solo_local`.
--
-- Reemplaza `comunidad.proto_marca()` (la definición vigente es la de 015)
-- por una que devuelve `solo_local.reloj.fijo` si hay una fila, y
-- `clock_timestamp()` si no. Todo lo demás de la función es IGUAL (mismo
-- guardián de nivel, mismos atributos). Así las funciones REALES de votar,
-- retirar, editar, moderar, suspender y levantar escriben su marca en el
-- instante que fija la batería, sin tocar las filas después.
--
-- Lo instala y lo quita scripts/comunidad/pruebas-top.mjs (o
-- solo-local-reloj-quitar.sql a mano), que compara la definición de
-- proto_marca antes de instalar y después de quitar. La base local es
-- compartida: esto no debe quedar instalado.
begin;

create schema if not exists solo_local;
revoke all on schema solo_local from public, anon, authenticated, service_role;

create table if not exists solo_local.reloj (
  id    boolean primary key default true check (id),
  fijo  timestamptz not null
);
revoke all on solo_local.reloj from public, anon, authenticated, service_role;

create or replace function comunidad.proto_marca()
returns timestamptz
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.proto_avanzar(10, 'proto_marca');
  return coalesce((select r.fijo from solo_local.reloj r), clock_timestamp());
end;
$$;

commit;
