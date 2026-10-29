-- Reversión CONSERVADORA de 022_cerrar_user_reviews.sql. Se corre a mano y con
-- autorización.
--
-- 🔴 NO REABRE NADA. No vuelve a crear la lectura pública de aprobadas (`anon`
-- leía reseñas sin sesión, contra el diseño) ni la escritura directa del autor
-- (saltaba toda moderación por REST). Reabrirlas sería reintroducir el hallazgo
-- C1 de la revisión; si algún día hiciera falta, es una decisión del dueño y
-- una migración nueva, no este archivo.
--
-- Lo único que "revierte" es dejar constancia: la tabla, sus filas, su trigger
-- y el acceso de `service_role` nunca se tocaron, así que no hay nada que
-- restaurar. Comprueba que siga así y falla si no.

do $$
begin
  if to_regclass('public.user_reviews') is null then
    raise exception 'public.user_reviews no existe: 022 no la borra, algo más cambió';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.user_reviews'::regclass
                    and tgname = 'user_reviews_protect_estado') then
    raise exception 'falta el trigger user_reviews_protect_estado';
  end if;
end;
$$;
