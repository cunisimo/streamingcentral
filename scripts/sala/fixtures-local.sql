-- Fixtures SINTÉTICAS para la base local de las salas. Sólo local.
--
-- Todo con tmdb_id >= 90000001 para no chocar con el catálogo real (que se puede
-- cargar además con `db-local.mjs --catalogo-real`). Los títulos son ficticios:
-- sirven para probar RLS, RPCs y concurrencia, no para enriquecer con TMDB.
--
-- Con Netflix + Disney Plus + HBO Max quedan 41 candidatas `cualquiera`
-- (5 `corta`, 36 `larga`): las 40 "Ficticia" más "Sin pero" (90000042), que
-- tiene `razon` presente y `advertencia` NULL y ES servible desde el 2026-09-18 (el
-- "pero" es opcional; la card no muestra esa sección). Alcanza para una tanda
-- de 20 y para probar `insuficientes` pidiendo 20 en `corta`. La 90000041 es
-- exclusiva de MUBI. Los controles negativos (900001xx) no pueden salir NUNCA
-- de sala_candidatos.

-- Las salas nacen apagadas en la migración 009; en local se encienden acá. El
-- bloque es condicional para poder aplicar las fixtures antes de que exista 009.
do $$
begin
  if to_regclass('public.sala_config') is not null then
    update sala_config set valor = 'true' where clave = 'activas';
  end if;
end $$;

insert into roulette_titles (tmdb_id, media_type, title, year, runtime, genres, edad, apto_chicos, vote_count, vote_average, razon, advertencia, atencion)
select 90000000 + g, 'movie', 'Ficticia ' || g, 2000 + (g % 20), 80 + (g * 2), array['Drama'], 'adultos', false, 100, 7.0,
       'Por qué verla ' || g, 'Pero ' || g, 'media'
from generate_series(1, 41) g
on conflict (tmdb_id, media_type) do nothing;

-- Servible SIN "pero": razon presente, advertencia NULL. Larga (95 min), HBO Max.
insert into roulette_titles (tmdb_id, media_type, title, runtime, apto_chicos, requiere_contexto, razon, advertencia) values
  (90000042, 'movie', 'Sin pero', 95, false, false, 'Por qué verla, sin pero', null)
on conflict (tmdb_id, media_type) do nothing;

-- Controles negativos: ninguno puede salir de sala_candidatos
insert into roulette_titles (tmdb_id, media_type, title, runtime, apto_chicos, requiere_contexto, razon, advertencia) values
  (90000101, 'movie', 'Infantil 1',   90,   true,  false, 'r', 'a'),
  (90000102, 'movie', 'Infantil 2',   120,  true,  false, 'r', 'a'),
  (90000103, 'movie', 'Sin duración', null, false, false, 'r', 'a'),
  (90000104, 'movie', 'Sin razón',    95,   false, false, null, 'a'),
  (90000105, 'movie', 'Secuela',      100,  false, true,  'r', 'a'),
  (90000106, 'tv',    'Serie',        45,   false, false, 'r', 'a'),
  (90000107, 'movie', 'Sin AR',       100,  false, false, 'r', 'a'),
  (90000108, 'movie', 'Razón en blanco', 100, false, false, '   ', 'a')
on conflict (tmdb_id, media_type) do nothing;

-- Disponibilidad en AR para todo salvo 90000107 ("Sin AR"). La 90000108 (razón de
-- sólo espacios) SÍ tiene disponibilidad: prueba que el filtro de texto real la saca igual.
insert into title_availability (tmdb_id, media_type, region, providers, rent_only, checked_at)
select t.tmdb_id, t.media_type, 'AR',
       -- Todas llevan además el proveedor sintético "Pruebas": la batería de RLS
       -- pide candidatas con p_providers = [Pruebas] y así queda aislada del
       -- catálogo real aunque esté cargado (--catalogo-real). La exclusiva de MUBI
       -- no lo lleva, para poder probar que una plataforma fuera de la unión no
       -- entra.
       case when t.tmdb_id = 90000041 then array['MUBI']
            when t.tmdb_id = 90000042 then array['HBO Max', 'Pruebas']
            when t.tmdb_id % 3 = 0 then array['Netflix', 'Pruebas']
            when t.tmdb_id % 3 = 1 then array['Disney Plus', 'Pruebas']
            else array['HBO Max', 'Pruebas'] end,
       false, now()
from roulette_titles t
where t.tmdb_id between 90000001 and 90000106 or t.tmdb_id = 90000108
on conflict (tmdb_id, media_type, region) do update set providers = excluded.providers, checked_at = now();
