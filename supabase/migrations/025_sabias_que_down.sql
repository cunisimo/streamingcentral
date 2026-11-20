-- Reversión de 025_sabias_que.sql. Se corre a mano y con autorización.
--
-- 🔴 BORRA LAS CURIOSIDADES CARGADAS (borradores y publicadas). Antes de
-- correrla, exportar la tabla si tiene filas. Retirar la sección de la app NO
-- exige esta reversión: sin filas publicadas la ficha no muestra nada.
drop function if exists curiosidad_publicada(text, integer);
drop trigger if exists curiosidades_antes_de_escribir on curiosidades;
drop table if exists curiosidades;
drop function if exists curiosidades_antes_de_escribir();
