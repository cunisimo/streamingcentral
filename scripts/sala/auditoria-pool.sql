-- Auditoría del pool curado para las salas compartidas. SÓLO LECTURA.
--
-- Se pega en el SQL Editor de Supabase (corre como postgres) y el resultado se
-- copia a docs/medidas/<fecha>-salas-pool.md. No escribe nada.
--
-- Los filtros son EXACTAMENTE los de `sala_candidatos` (plan de salas, Tarea
-- 1.4): película, con "por qué" y "pero", con duración comprobable, no apta
-- para chicos, sin `requiere_contexto`, y con disponibilidad en AR.
--
-- Criterio de go de la Etapa 1 (plan, Tarea 0.2): `cualquiera >= 20` en
-- n,d,m / n,d / n,d,m,p y `>= 10` en n sola.

-- 1. Tamaño del pool servible (sin plataformas)
select
  count(*)                                                                as total_movie,
  count(*) filter (where razon is not null and advertencia is not null)  as con_textos,
  count(*) filter (where razon is not null and advertencia is not null
                   and runtime is not null and runtime > 0)               as con_textos_y_duracion,
  count(*) filter (where razon is not null and advertencia is not null
                   and runtime > 0 and not apto_chicos
                   and not requiere_contexto)                             as servibles_sala,
  count(*) filter (where razon is not null and advertencia is not null
                   and runtime > 0 and not apto_chicos
                   and not requiere_contexto and runtime <= 90)           as cortas,
  count(*) filter (where razon is not null and advertencia is not null
                   and runtime > 0 and not apto_chicos
                   and not requiere_contexto and runtime > 90)            as largas
from roulette_titles
where media_type = 'movie';

-- 2. Antigüedad de la disponibilidad (la RPC filtra por esto; la card la
--    revalida después con cardsByIds, que puede tener hasta 24 h de caché)
select min(checked_at) as mas_vieja, max(checked_at) as mas_nueva, count(*) as filas
from title_availability
where region = 'AR';

-- 3. Servibles por unión de plataformas. Los nombres son los de
--    title_availability (ver lib/roulette-providers.ts), no los códigos.
with u(nombre, plats) as (values
  ('n,d,m',   array['Netflix','Disney Plus','HBO Max']),
  ('n',       array['Netflix']),
  ('n,d',     array['Netflix','Disney Plus']),
  ('n,p',     array['Netflix','Amazon Prime Video']),
  ('n,d,m,p', array['Netflix','Disney Plus','HBO Max','Amazon Prime Video']),
  ('d',       array['Disney Plus']),
  ('m',       array['HBO Max']),
  ('p',       array['Amazon Prime Video']),
  ('mb',      array['MUBI','MUBI Amazon Channel'])
)
select u.nombre,
  count(*)                                 as cualquiera,
  count(*) filter (where rt.runtime <= 90) as corta,
  count(*) filter (where rt.runtime > 90)  as larga
from u
join title_availability ta on ta.region = 'AR' and ta.providers && u.plats
join roulette_titles rt on rt.tmdb_id = ta.tmdb_id and rt.media_type = ta.media_type
where rt.media_type = 'movie'
  and rt.razon is not null and rt.advertencia is not null
  and rt.runtime is not null and rt.runtime > 0
  and not rt.apto_chicos
  and not rt.requiere_contexto
group by u.nombre
order by u.nombre;

-- 4. Nombres de plataforma presentes en AR. Cada uno tiene que estar en el
--    mapa de lib/roulette-providers.ts o en su lista de exclusiones
--    deliberadas (docs/MANTENIMIENTO.md §5). Un nombre nuevo es un título
--    invisible para la ruleta Y para las salas.
select distinct unnest(providers) as nombre
from title_availability
where region = 'AR'
order by 1;

-- 5. Control: qué descarta cada filtro por separado (para leer el resultado de
--    la consulta 1 sin adivinar cuál pesa más)
select
  count(*) filter (where advertencia is null and razon is not null) as con_razon_sin_pero,
  count(*) filter (where runtime is null or runtime <= 0)            as sin_duracion,
  count(*) filter (where apto_chicos)                                as aptas_chicos,
  count(*) filter (where requiere_contexto)                          as con_contexto,
  count(*) filter (where media_type = 'tv')                          as series
from roulette_titles;
