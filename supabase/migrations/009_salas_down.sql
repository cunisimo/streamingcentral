-- Reversión completa de 009_salas.sql. NO es una migración que se aplique en
-- orden: es el rollback, y se corre a mano y con autorización. Borra las salas
-- que haya (todas las tablas nacen y mueren con esta feature) y no toca nada
-- preexistente: roulette_titles, title_availability, get_roulette_picks, etc.
--
-- Orden: cron → tablas (hijas antes que padres, con CASCADE: el trigger cae con
-- `rooms` y sala_participante, que devuelve el tipo de fila de
-- room_participants, cae con su tabla) → funciones. Sólo dependen de estas
-- tablas objetos de esta misma feature, así que el CASCADE no alcanza a nada
-- ajeno. Todo con `if exists`: repetirlo es inocuo (probado en local: dos
-- corridas seguidas, la segunda sólo avisa "does not exist, skipping").

select cron.unschedule('sala-barrido') where exists (select 1 from cron.job where jobname = 'sala-barrido');

drop table if exists room_votes cascade;
drop table if exists room_titles cascade;
drop table if exists room_rounds cascade;
drop table if exists room_participants cascade;   -- se lleva sala_participante(uuid, text)
drop table if exists rooms cascade;               -- se lleva el trigger rooms_publicar_cambio
drop table if exists sala_config cascade;

drop function if exists sala_barrido();
drop function if exists sala_abortar_preparacion(uuid, uuid);
drop function if exists sala_publicar_ronda(uuid, uuid, jsonb);
drop function if exists sala_candidatos(text[], text, int[], text, int);
drop function if exists sala_iniciar_preparacion(uuid, uuid, int, text);
drop function if exists sala_cerrar(uuid);
drop function if exists sala_desempatar(uuid);
drop function if exists sala_votar(uuid, text, uuid, int, text);
drop function if exists sala_estado(uuid, text);
drop function if exists sala_reclamar(uuid, text);
drop function if exists sala_reclamar(uuid);                    -- firma previa, sólo en bases locales
drop function if exists sala_unirse(uuid, text, text[], text);
drop function if exists sala_unirse(uuid, text, text[], uuid);  -- firma previa, sólo en bases locales
drop function if exists sala_unirse(uuid, text, text[]);        -- firma previa, sólo en bases locales
drop function if exists sala_crear(text, text[], text);
drop function if exists sala_crear(text, text[], uuid);         -- firma previa, sólo en bases locales
drop function if exists sala_crear(text, text[]);               -- firma previa, sólo en bases locales
drop function if exists sala_aplicar_vencimientos(uuid);
drop function if exists sala_computar(uuid);
drop function if exists sala_limite_seg(int);
drop function if exists sala_participante(uuid, text);
drop function if exists sala_nombre_valido(text);
drop function if exists sala_plataformas_validas(text[]);
drop function if exists sala_credencial_valida(text);
drop function if exists sala_nuevo_token();                     -- función previa, sólo en bases locales
drop function if exists sala_hash(text);
drop function if exists rooms_publicar_cambio();
drop function if exists sala_tocar(uuid);
drop function if exists sala_activas();
drop function if exists sala_codigos_permitidos();
