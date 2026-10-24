-- Reversión de 011_comunidad_esquema.sql. NO es una migración que se aplique en
-- orden: es el rollback, y se corre a mano y con autorización.
--
-- Borra el esquema `comunidad` entero: sus once tablas, sus filas, sus
-- triggers y sus funciones. Todo nace y muere con esta entrega; ningún objeto
-- de fuera del esquema depende de él (E2a no crea funciones en `public`), así
-- que el CASCADE no alcanza a nada ajeno. Las FK hacia `auth.users` salen
-- con sus tablas; `auth.users` no se toca.
--
-- 🔴 Con datos reales esto BORRA reseñas, votos, tramos y denuncias. En E2a no
-- hay ninguna (local, sin publicación). Más adelante, revertir con datos exige
-- una decisión del dueño y un respaldo previo.
--
-- No toca `user_reviews` ni lo que cierra 022 (tiene su propia reversión).
-- Con `if exists`: repetirlo es inocuo.

drop schema if exists comunidad cascade;
