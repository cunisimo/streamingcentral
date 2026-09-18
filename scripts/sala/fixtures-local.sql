-- Fixtures SINTÉTICAS para la base local de las salas. Sólo local.
--
-- Todo con tmdb_id >= 900001 para no chocar con el catálogo real (que se puede
-- cargar además con `db-local.mjs --catalogo-real`). Los títulos son ficticios:
-- sirven para probar RLS, RPCs y concurrencia, no para enriquecer con TMDB.
--
-- Con Netflix + Disney Plus + HBO Max quedan 40 candidatas `cualquiera`
-- (5 `corta`, 35 `larga`), o sea alcanza para una tanda de 20 y para probar
-- `insuficientes` pidiendo 20 en `corta`. La 900041 es exclusiva de MUBI.
-- Los controles negativos (9001xx) no pueden salir NUNCA de sala_candidatos.

-- Las salas nacen apagadas en la migración 009; en local se encienden acá. El
-- bloque es condicional para poder aplicar las fixtures antes de que exista 009.
do $$
begin
  if to_regclass('public.sala_config') is not null then
    update sala_config set valor = 'true' where clave = 'activas';
  end if;
end $$;

insert into roulette_titles (tmdb_id, media_type, title, year, runtime, genres, edad, apto_chicos, vote_count, vote_average, razon, advertencia, atencion)
select 900000 + g, 'movie', 'Ficticia ' || g, 2000 + (g % 20), 80 + (g * 2), array['Drama'], 'adultos', false, 100, 7.0,
       'Por qué verla ' || g, 'Pero ' || g, 'media'
from generate_series(1, 41) g
on conflict (tmdb_id, media_type) do nothing;

-- Controles negativos: ninguno puede salir de sala_candidatos
insert into roulette_titles (tmdb_id, media_type, title, runtime, apto_chicos, requiere_contexto, razon, advertencia) values
  (900101, 'movie', 'Infantil 1',   90,   true,  false, 'r', 'a'),
  (900102, 'movie', 'Infantil 2',   120,  true,  false, 'r', 'a'),
  (900103, 'movie', 'Sin duración', null, false, false, 'r', 'a'),
  (900104, 'movie', 'Sin pero',     95,   false, false, 'r', null),
  (900105, 'movie', 'Secuela',      100,  false, true,  'r', 'a'),
  (900106, 'tv',    'Serie',        45,   false, false, 'r', 'a'),
  (900107, 'movie', 'Sin AR',       100,  false, false, 'r', 'a')
on conflict (tmdb_id, media_type) do nothing;

-- Disponibilidad en AR para todo salvo 900107 ("Sin AR").
insert into title_availability (tmdb_id, media_type, region, providers, rent_only, checked_at)
select t.tmdb_id, t.media_type, 'AR',
       case when t.tmdb_id = 900041 then array['MUBI']
            when t.tmdb_id % 3 = 0 then array['Netflix']
            when t.tmdb_id % 3 = 1 then array['Disney Plus']
            else array['HBO Max'] end,
       false, now()
from roulette_titles t
where t.tmdb_id between 900001 and 900106
on conflict (tmdb_id, media_type, region) do update set providers = excluded.providers, checked_at = now();
