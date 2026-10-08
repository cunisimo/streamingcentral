-- ═══════════════════════════════════════════════════════════════════════════
-- PROPUESTA PARA REVISIÓN — NO EJECUTADA. Exclusión editorial de la ruleta
-- para los títulos YA cargados que violan la regla (84 anime, 2 stand-up).
-- Orden: (0) verificar, (1) migración 010, (2) este bloque, (3) verificar.
-- ⚠️ Incluye Studio Ghibli y Your Name (anime por el criterio). Para mantener
-- alguno, sacá su fila del bloque (2) o revertilo después con (4).
-- ═══════════════════════════════════════════════════════════════════════════

-- (0) ANTES: la función en Producción tiene que ser la de 003 (comparar a ojo
--     con supabase/migrations/003_lock_roulette.sql antes de correr la 010):
-- select pg_get_functiondef('public.get_roulette_picks(text[], text, integer[], text, text, integer)'::regprocedure);
-- Y cuántos se sirven hoy de estos 86:
-- select count(*) from roulette_titles where media_type = 'movie' and tmdb_id in (129, 372058, 4935, 128, 8392, 12477, 12429, 10515, 16859, 635302, 378064, 81, 9323, 11621, 149870, 51739, 610150, 508883, 568160, 15370, 37797, 149871, 242828, 83389, 18491, 810693, 916224, 1311031, 315465, 13398, 667520, 592350, 15080, 15283, 900667, 505262, 15137, 1218925, 20982, 22843, 34433, 283566, 75629, 39107, 39108, 413594, 476292, 568012, 378108, 39105, 532067, 28609, 16907, 1244492, 823754, 265712, 572154, 783675, 17581, 533514, 50723, 843241, 36728, 13980, 610892, 445030, 820067, 400608, 632632, 812225, 41498, 761898, 1012201, 728754, 553839, 42360, 51859, 483455, 22611, 22537, 34295, 118301, 34297, 212156, 81850, 22914);

-- (2) Marca:
-- Exclusión editorial de la ruleta — 86 títulos ya cargados (2026-10-07).
-- Requiere supabase/migrations/010_ruleta_exclusiones.sql. Sólo MARCA: no borra filas,
-- no toca textos editoriales ni disponibilidad. Idempotente (no repisa una marca).

begin;

update roulette_titles rt set excluido_motivo = v.motivo, excluido_at = now()
from (values
  (81, 'anime'),  -- Guerreros del viento
  (128, 'anime'),  -- La princesa Mononoke
  (129, 'anime'),  -- El viaje de Chihiro
  (4935, 'anime'),  -- El castillo ambulante
  (8392, 'anime'),  -- Mi vecino Totoro
  (9323, 'anime'),  -- Ghost in the Shell
  (10515, 'anime'),  -- El castillo en el cielo
  (11621, 'anime'),  -- Porco Rosso
  (12429, 'anime'),  -- Ponyo en el acantilado
  (12477, 'anime'),  -- La tumba de las luciérnagas
  (13398, 'anime'),  -- Tokyo Godfathers
  (13980, 'anime'),  -- El samurái sin nombre (Sword of the Stranger)
  (15080, 'anime'),  -- Recuerdos del ayer
  (15137, 'anime'),  -- Evangelion: 1.0 You Are (Not) Alone
  (15283, 'anime'),  -- Pompoko
  (15370, 'anime'),  -- Haru en el reino de los gatos
  (16859, 'anime'),  -- Nicky, la aprendiz de bruja
  (16907, 'anime'),  -- Naruto: ¡Batalla ninja en la tierra de la nieve!
  (17581, 'anime'),  -- Naruto Shippuden 2: Lazos
  (18491, 'anime'),  -- Neon Genesis Evangelion: The End of Evangelion
  (20982, 'anime'),  -- Naruto Shippuden 1: La Muerte de Naruto
  (22537, 'anime'),  -- Inuyasha, la película 2: El castillo de los sueños en el interior del espejo
  (22611, 'anime'),  -- El pequeño Nemo
  (22843, 'anime'),  -- Evangelion: 2.0 You Can (Not) Advance
  (22914, 'anime'),  -- Mobile Suit Gundam Wing ENDLESS WALTZ
  (28609, 'anime'),  -- Dragon Ball Z꞉ Devolvedme a mi Gohan
  (34295, 'anime'),  -- Inuyasha, la película 3: La espada conquistadora
  (34297, 'anime'),  -- Inuyasha, la película 4: Fuego en la isla mística
  (34433, 'anime'),  -- Dragon Ball Z: ¡Arde! Una ardiente, intensa y super feroz batalla
  (36728, 'anime'),  -- Naruto Shippuden 3: Los Herederos de la Voluntad de Fuego
  (37797, 'anime'),  -- Susurros del corazón
  (39105, 'anime'),  -- Dragon Ball Z: ¡La Vía Láctea al límite! Un tipo super increíble
  (39107, 'anime'),  -- Dragon Ball Z: ¡El renacimiento de la fusión! Goku y Vegeta
  (39108, 'anime'),  -- Dragon Ball Z: ¡La explosión del puño del dragón! Si Goku no puede hacerlo, ¿quién lo hará?
  (41498, 'anime'),  -- One Piece: Strong World
  (42360, 'anime'),  -- Inuyasha, la película: La batalla a través del tiempo
  (50723, 'anime'),  -- Naruto Shippuden 4: La torre perdida
  (51739, 'anime'),  -- Arrietty y el mundo de los diminutos
  (51859, 'anime'),  -- Trigun: Badlands Rumble
  (75629, 'anime'),  -- Evangelion: 3.0 You Can (Not) Redo
  (81850, 'anime'),  -- Super Agente Cobra
  (83389, 'anime'),  -- La colina de las amapolas
  (118301, 'anime'),  -- Inazuma Eleven: La película
  (149870, 'anime'),  -- El viento se levanta
  (149871, 'anime'),  -- El cuento de la princesa Kaguya
  (212156, 'anime'),  -- El Jardín de los Pecadores: Evangelio Futuro
  (242828, 'anime'),  -- El recuerdo de Marnie
  (265712, 'anime'),  -- Stand by Me Doraemon
  (283566, 'anime'),  -- Evangelion: 3.0+1.01 Thrice Upon a Time
  (315465, 'anime'),  -- El niño y la bestia
  (372058, 'anime'),  -- Your Name.
  (378064, 'anime'),  -- A Silent Voice
  (378108, 'anime'),  -- En este rincón del mundo
  (413594, 'anime'),  -- Sword Art Online La película: Ordinal Scale
  (445030, 'anime'),  -- No Game No Life: Zero
  (476292, 'anime'),  -- Maquia, una historia de amor inmortal
  (483455, 'anime'),  -- Bungou Stray Dogs - Dead Apple
  (505262, 'anime'),  -- My Hero Academia: Dos héroes
  (508883, 'anime'),  -- El chico y la garza
  (532067, 'anime'),  -- KonoSuba. La Película. La Leyenda del Carmesí
  (533514, 'anime'),  -- Violet Evergarden: La película
  (553839, 'anime'),  -- Youjo Senki Movie
  (568012, 'anime'),  -- One Piece: Estampida
  (568160, 'anime'),  -- El tiempo contigo
  (572154, 'anime'),  -- Seishun Buta Yarou wa Yumemiru Shoujo no Yume wo Minai
  (592350, 'anime'),  -- My Hero Academia: El despertar de los héroes
  (610150, 'anime'),  -- Dragon Ball Super: Super Hero
  (610892, 'anime'),  -- Violet Evergarden: La eternidad y la muñeca de recuerdos automáticos
  (632632, 'anime'),  -- Given: The Movie
  (635302, 'anime'),  -- Guardianes de la Noche: Tren infinito
  (667520, 'anime'),  -- Amor de gata
  (728754, 'anime'),  -- Stand by Me Doraemon 2
  (761898, 'anime'),  -- Sword Art Online Progressive: Aria de una Noche sin Estrellas
  (783675, 'anime'),  -- THE FIRST SLAM DUNK
  (810693, 'anime'),  -- Jujutsu Kaisen 0
  (812225, 'anime'),  -- Black Clover: La espada del rey mago
  (820067, 'anime'),  -- Las Quintillizas: La Película
  (843241, 'anime'),  -- The Seven Deadly Sins: La maldición de la luz
  (900667, 'anime'),  -- One Piece Film Red
  (916224, 'anime'),  -- Suzume
  (1012201, 'anime'),  -- Haikyu!! La batalla del basurero
  (1218925, 'anime'),  -- Chainsaw Man - La película: El arco de Reze
  (1244492, 'anime'),  -- Look Back: Continúa dibujando
  (1311031, 'anime'),  -- Guardianes de la noche: Kimetsu no Yaiba La fortaleza infinita
  (400608, 'stand-up'),  -- Bo Burnham: Make Happy
  (823754, 'stand-up')  -- Bo Burnham: Inside
) as v(tmdb_id, motivo)
where rt.tmdb_id = v.tmdb_id and rt.media_type = 'movie' and rt.excluido_motivo is null;

commit;

-- (3) DESPUÉS: tienen que dar 84 y 2.
-- select excluido_motivo, count(*) from roulette_titles where excluido_motivo is not null group by 1;

-- (4) Reversión individual (correr sólo la línea del título a recuperar):
-- Guerreros del viento (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 81 and media_type = 'movie';
-- La princesa Mononoke (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 128 and media_type = 'movie';
-- El viaje de Chihiro (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 129 and media_type = 'movie';
-- El castillo ambulante (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 4935 and media_type = 'movie';
-- Mi vecino Totoro (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 8392 and media_type = 'movie';
-- Ghost in the Shell (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 9323 and media_type = 'movie';
-- El castillo en el cielo (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 10515 and media_type = 'movie';
-- Porco Rosso (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 11621 and media_type = 'movie';
-- Ponyo en el acantilado (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 12429 and media_type = 'movie';
-- La tumba de las luciérnagas (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 12477 and media_type = 'movie';
-- Tokyo Godfathers (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 13398 and media_type = 'movie';
-- El samurái sin nombre (Sword of the Stranger) (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 13980 and media_type = 'movie';
-- Recuerdos del ayer (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 15080 and media_type = 'movie';
-- Evangelion: 1.0 You Are (Not) Alone (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 15137 and media_type = 'movie';
-- Pompoko (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 15283 and media_type = 'movie';
-- Haru en el reino de los gatos (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 15370 and media_type = 'movie';
-- Nicky, la aprendiz de bruja (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 16859 and media_type = 'movie';
-- Naruto: ¡Batalla ninja en la tierra de la nieve! (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 16907 and media_type = 'movie';
-- Naruto Shippuden 2: Lazos (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 17581 and media_type = 'movie';
-- Neon Genesis Evangelion: The End of Evangelion (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 18491 and media_type = 'movie';
-- Naruto Shippuden 1: La Muerte de Naruto (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 20982 and media_type = 'movie';
-- Inuyasha, la película 2: El castillo de los sueños en el interior del espejo (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 22537 and media_type = 'movie';
-- El pequeño Nemo (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 22611 and media_type = 'movie';
-- Evangelion: 2.0 You Can (Not) Advance (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 22843 and media_type = 'movie';
-- Mobile Suit Gundam Wing ENDLESS WALTZ (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 22914 and media_type = 'movie';
-- Dragon Ball Z꞉ Devolvedme a mi Gohan (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 28609 and media_type = 'movie';
-- Inuyasha, la película 3: La espada conquistadora (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 34295 and media_type = 'movie';
-- Inuyasha, la película 4: Fuego en la isla mística (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 34297 and media_type = 'movie';
-- Dragon Ball Z: ¡Arde! Una ardiente, intensa y super feroz batalla (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 34433 and media_type = 'movie';
-- Naruto Shippuden 3: Los Herederos de la Voluntad de Fuego (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 36728 and media_type = 'movie';
-- Susurros del corazón (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 37797 and media_type = 'movie';
-- Dragon Ball Z: ¡La Vía Láctea al límite! Un tipo super increíble (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 39105 and media_type = 'movie';
-- Dragon Ball Z: ¡El renacimiento de la fusión! Goku y Vegeta (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 39107 and media_type = 'movie';
-- Dragon Ball Z: ¡La explosión del puño del dragón! Si Goku no puede hacerlo, ¿quién lo hará? (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 39108 and media_type = 'movie';
-- One Piece: Strong World (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 41498 and media_type = 'movie';
-- Inuyasha, la película: La batalla a través del tiempo (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 42360 and media_type = 'movie';
-- Naruto Shippuden 4: La torre perdida (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 50723 and media_type = 'movie';
-- Arrietty y el mundo de los diminutos (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 51739 and media_type = 'movie';
-- Trigun: Badlands Rumble (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 51859 and media_type = 'movie';
-- Evangelion: 3.0 You Can (Not) Redo (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 75629 and media_type = 'movie';
-- Super Agente Cobra (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 81850 and media_type = 'movie';
-- La colina de las amapolas (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 83389 and media_type = 'movie';
-- Inazuma Eleven: La película (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 118301 and media_type = 'movie';
-- El viento se levanta (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 149870 and media_type = 'movie';
-- El cuento de la princesa Kaguya (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 149871 and media_type = 'movie';
-- El Jardín de los Pecadores: Evangelio Futuro (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 212156 and media_type = 'movie';
-- El recuerdo de Marnie (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 242828 and media_type = 'movie';
-- Stand by Me Doraemon (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 265712 and media_type = 'movie';
-- Evangelion: 3.0+1.01 Thrice Upon a Time (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 283566 and media_type = 'movie';
-- El niño y la bestia (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 315465 and media_type = 'movie';
-- Your Name. (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 372058 and media_type = 'movie';
-- A Silent Voice (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 378064 and media_type = 'movie';
-- En este rincón del mundo (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 378108 and media_type = 'movie';
-- Bo Burnham: Make Happy (stand-up)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 400608 and media_type = 'movie';
-- Sword Art Online La película: Ordinal Scale (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 413594 and media_type = 'movie';
-- No Game No Life: Zero (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 445030 and media_type = 'movie';
-- Maquia, una historia de amor inmortal (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 476292 and media_type = 'movie';
-- Bungou Stray Dogs - Dead Apple (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 483455 and media_type = 'movie';
-- My Hero Academia: Dos héroes (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 505262 and media_type = 'movie';
-- El chico y la garza (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 508883 and media_type = 'movie';
-- KonoSuba. La Película. La Leyenda del Carmesí (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 532067 and media_type = 'movie';
-- Violet Evergarden: La película (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 533514 and media_type = 'movie';
-- Youjo Senki Movie (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 553839 and media_type = 'movie';
-- One Piece: Estampida (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 568012 and media_type = 'movie';
-- El tiempo contigo (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 568160 and media_type = 'movie';
-- Seishun Buta Yarou wa Yumemiru Shoujo no Yume wo Minai (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 572154 and media_type = 'movie';
-- My Hero Academia: El despertar de los héroes (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 592350 and media_type = 'movie';
-- Dragon Ball Super: Super Hero (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 610150 and media_type = 'movie';
-- Violet Evergarden: La eternidad y la muñeca de recuerdos automáticos (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 610892 and media_type = 'movie';
-- Given: The Movie (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 632632 and media_type = 'movie';
-- Guardianes de la Noche: Tren infinito (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 635302 and media_type = 'movie';
-- Amor de gata (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 667520 and media_type = 'movie';
-- Stand by Me Doraemon 2 (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 728754 and media_type = 'movie';
-- Sword Art Online Progressive: Aria de una Noche sin Estrellas (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 761898 and media_type = 'movie';
-- THE FIRST SLAM DUNK (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 783675 and media_type = 'movie';
-- Jujutsu Kaisen 0 (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 810693 and media_type = 'movie';
-- Black Clover: La espada del rey mago (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 812225 and media_type = 'movie';
-- Las Quintillizas: La Película (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 820067 and media_type = 'movie';
-- Bo Burnham: Inside (stand-up)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 823754 and media_type = 'movie';
-- The Seven Deadly Sins: La maldición de la luz (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 843241 and media_type = 'movie';
-- One Piece Film Red (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 900667 and media_type = 'movie';
-- Suzume (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 916224 and media_type = 'movie';
-- Haikyu!! La batalla del basurero (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 1012201 and media_type = 'movie';
-- Chainsaw Man - La película: El arco de Reze (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 1218925 and media_type = 'movie';
-- Look Back: Continúa dibujando (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 1244492 and media_type = 'movie';
-- Guardianes de la noche: Kimetsu no Yaiba La fortaleza infinita (anime)
-- update roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = 1311031 and media_type = 'movie';
