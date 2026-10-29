-- Cierre de `user_reviews` (seam dormido de schema.sql), entrega E2a.
-- Plan: docs/superpowers/plans/2026-10-22-resenas-comunidad.md (E2a);
-- diseño: revisión §2.1.4 (hallazgo C1: `anon` lee las aprobadas y el autor
-- tiene INSERT/UPDATE/DELETE directos por REST).
--
-- 🔴 SÓLO LOCAL HASTA NUEVO AVISO. En Producción se aplica recién después del
-- inventario de E0 (filas existentes y permisos efectivos) y con autorización
-- del dueño. Numerada 022 a propósito: no entra en el orden de 011–021.
--
-- QUÉ HACE. Quita las dos policies (lectura pública de aprobadas y gestión del
-- autor) y revoca todo a `anon` y `authenticated`. RLS queda activada, sin
-- policies: doble cierre. `service_role` no cambia (lo usa el servidor; el
-- borrado de cuenta sigue cayendo por CASCADE desde auth.users).
--
-- QUÉ NO HACE. No borra la tabla, no borra ni migra filas, no toca su trigger
-- `user_reviews_protect_estado` ni la función `protect_review_estado`. La
-- reseña comunitaria nueva vive en el esquema `comunidad` (011).
--
-- Consecuencia conocida: scripts/prueba-eliminar-cuenta.mjs inserta una fila
-- en `user_reviews` con la sesión del usuario. Después de este cierre ese
-- insert falla (el script no revisa el error) y el conteo da 0. Se informa en
-- el traspaso; el script no se cambia en esta entrega.
--
-- Rollback: 022_cerrar_user_reviews_down.sql, CONSERVADOR (no reabre).

begin;

drop policy if exists "lectura publica aprobadas" on public.user_reviews;
drop policy if exists "el autor gestiona la suya" on public.user_reviews;

alter table public.user_reviews enable row level security;
revoke all on table public.user_reviews from public, anon, authenticated;

commit;
