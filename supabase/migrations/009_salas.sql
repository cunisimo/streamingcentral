-- ═══════════════════════════════════════════════════════════════════════════
-- Salas compartidas (MVP). Ver docs/SALAS.md y
-- docs/superpowers/plans/2026-09-17-salas-compartidas.md.
--
-- Seis tablas CERRADAS: RLS activo sin policies y sin privilegios para
-- anon/authenticated. Toda operación pasa por las RPCs de abajo (security
-- definer, search_path pineado). El participante se identifica por una
-- CREDENCIAL PORTADORA QUE GENERA EL CLIENTE (32 bytes aleatorios, base64url de
-- 43 caracteres) y que la base recibe en cada llamada y guarda SÓLO como
-- sha256; la base nunca genera tokens. El organizador, además, por su JWT.
--
-- IDEMPOTENCIA POR CREDENCIAL: el cliente persiste la credencial ANTES de la
-- primera solicitud y manda siempre la misma. Repetir sala_crear / sala_unirse
-- con la misma credencial devuelve la misma sala / participación sin rotar
-- nada, así que reintentos concurrentes y respuestas desordenadas terminan
-- todos en la misma credencial válida, que el cliente ya tiene.
-- Requiere pgcrypto (gen_random_bytes, digest), pg_cron y realtime.send.
--
-- ⚠️ Postgres concede EXECUTE a PUBLIC en toda función nueva. Por eso CADA
-- función de este archivo lleva su `revoke … from public, anon, authenticated`
-- inmediatamente después de crearse, y sólo las de cara al cliente reciben un
-- `grant` explícito. lib/salas-migracion.test.ts inventaría las dos cosas.
--
-- ORDEN DE BLOQUEO ÚNICO: primero la fila de `rooms`, después la de
-- `room_rounds`. Ninguna función bloquea una ronda sin haber bloqueado antes su
-- sala; las que reciben la sala ya bloqueada lo declaran en el cuerpo con la
-- marca `-- llamador: sala bloqueada` (la lee el test de orden).
--
-- CRITERIO DE TEXTO PRESENTE: `nullif(btrim(x), '') is not null`. La razón es
-- obligatoria con ese criterio; el "pero" (advertencia) es OPCIONAL (decisión
-- del dueño, 2026-09-18): NULL, vacío o sólo espacios se sirve igual y la
-- interfaz no muestra la sección.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Sin sobrecargas ─────────────────────────────────────────────────────────
-- Las firmas previas de estas funciones (sin credencial, o con un p_intento
-- uuid) existieron sólo en bases locales, nunca en Producción. Si quedaran,
-- PostgREST las resolvería para una llamada con otros parámetros y saltearían
-- la idempotencia por credencial. Se borran a propósito; la batería llama con
-- las firmas viejas y exige que ninguna función responda.
drop function if exists sala_crear(text, text[]);
drop function if exists sala_crear(text, text[], uuid);
drop function if exists sala_unirse(uuid, text, text[]);
drop function if exists sala_unirse(uuid, text, text[], uuid);
drop function if exists sala_unirse(uuid, text, text[], text);  -- llevaba plataformas del invitado (ver abajo)
drop function if exists sala_reclamar(uuid);
drop function if exists sala_nuevo_token();

-- ── Tablas ─────────────────────────────────────────────────────────────────

create table if not exists rooms (
  id               uuid primary key default gen_random_uuid(),
  host_user_id     uuid not null references auth.users (id) on delete cascade,
  estado           text not null default 'lobby'
                   check (estado in ('lobby','preparando','votando','empate','resultado','vencida')),
  estado_previo    text,
  seed             text not null,
  version          bigint not null default 0,
  lobby_expires_at timestamptz not null,
  expires_at       timestamptz not null,
  platforms_frozen text[],
  round_actual     uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists rooms_expires_idx on rooms (expires_at);
-- Índice de APOYO (no único) para el conteo de "una sola sala activa". La regla
-- la garantiza sala_crear con un bloqueo consultivo por usuario, y el predicado
-- del conteo es EXACTAMENTE este (estado <> 'vencida') después de aplicar los
-- vencimientos por reloj de las salas del organizador.
create index if not exists rooms_host_activa_idx on rooms (host_user_id) where estado <> 'vencida';

create table if not exists room_participants (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references rooms (id) on delete cascade,
  -- sha256 de la credencial que generó el cliente. Es a la vez la identidad del
  -- participante y la clave de idempotencia de sala_crear / sala_unirse: la
  -- misma credencial no puede crear dos participaciones.
  token_hash   bytea not null unique,
  user_id      uuid references auth.users (id) on delete set null,
  nombre       text not null check (char_length(nombre) between 1 and 24),
  platforms    text[] not null check (cardinality(platforms) between 1 and 14),
  es_host      boolean not null default false,
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create unique index if not exists room_participants_un_usuario on room_participants (room_id, user_id) where user_id is not null;
create unique index if not exists room_participants_un_host on room_participants (room_id) where es_host;
create index if not exists room_participants_room_idx on room_participants (room_id);

create table if not exists room_rounds (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references rooms (id) on delete cascade,
  numero         int not null,
  estado         text not null default 'preparando' check (estado in ('preparando','votando','cerrada')),
  size           int not null check (size in (5,10,20)),
  duracion       text not null check (duracion in ('cualquiera','corta','larga')),
  limite_seg     int not null,
  prep_token     uuid not null default gen_random_uuid(),
  started_at     timestamptz,
  deadline_at    timestamptz,
  closed_at      timestamptz,
  resultado      text check (resultado in ('match','ganador','empate','sin_coincidencias','vencida')),
  ganador_pos    int,
  empatadas      int[],
  desempatado_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (room_id, numero)
);
create index if not exists room_rounds_room_estado_idx on room_rounds (room_id, estado);

create table if not exists room_titles (
  round_id    uuid not null references room_rounds (id) on delete cascade,
  pos         int not null check (pos >= 0),
  tmdb_id     int not null,
  titulo      text not null,
  anio        int,
  runtime     int not null check (runtime > 0),
  poster      text,
  generos     text[] not null default '{}',
  platforms   text[] not null default '{}',
  razon       text not null,
  advertencia text,             -- NULL = sin "Pero"; la card no muestra la sección
  primary key (round_id, pos),
  unique (round_id, tmdb_id)
);

create table if not exists room_votes (
  round_id       uuid not null,
  participant_id uuid not null references room_participants (id) on delete cascade,
  pos            int not null,
  voto           text not null check (voto in ('yes','no','pass')),
  at             timestamptz not null default now(),
  primary key (round_id, participant_id, pos),
  foreign key (round_id, pos) references room_titles (round_id, pos) on delete cascade
);
create index if not exists room_votes_round_pos_idx on room_votes (round_id, pos) where voto = 'yes';

-- Kill switch EN LA BASE: `activas = 'false'` impide crear salas y unirse sin
-- deploy (las variables de Vercel se aplican recién con el siguiente
-- deployment). Se cambia con SQL desde el panel. Tabla cerrada como las demás.
create table if not exists sala_config (
  clave text primary key,
  valor text not null
);
-- Nace APAGADO: en Producción se enciende a mano después del deploy.
-- En local, scripts/sala/fixtures-local.sql lo pone en 'true'.
insert into sala_config (clave, valor) values ('activas', 'false') on conflict (clave) do nothing;

-- Cierre total: sin policies, sin privilegios directos.
alter table rooms enable row level security;
alter table room_participants enable row level security;
alter table room_rounds enable row level security;
alter table room_titles enable row level security;
alter table room_votes enable row level security;
alter table sala_config enable row level security;
revoke all on rooms from anon, authenticated;
revoke all on room_participants from anon, authenticated;
revoke all on room_rounds from anon, authenticated;
revoke all on room_titles from anon, authenticated;
revoke all on room_votes from anon, authenticated;
revoke all on sala_config from anon, authenticated;
-- El servidor (service_role, sólo desde lib/supabase-admin.ts) sí tiene
-- privilegios explícitos: no se depende de los default privileges del proyecto,
-- que difieren entre el stack local (sin SELECT para service_role) y Producción.
-- service_role bypassa RLS, pero sin GRANT no puede ni leer.
grant all on rooms to service_role;
grant all on room_participants to service_role;
grant all on room_rounds to service_role;
grant all on room_titles to service_role;
grant all on room_votes to service_role;
grant all on sala_config to service_role;

-- ── Helpers internos ───────────────────────────────────────────────────────

-- Códigos de plataforma permitidos. TIENE que coincidir con ALL_CODES de
-- lib/providers-ar.ts: lib/salas-migracion.test.ts lo compara textualmente.
create or replace function sala_codigos_permitidos() returns text[]
language sql immutable as $$
  select array['n','d','m','at','p','cr','pp','mb','un','mv','cv','vx','dg','ok']
$$;
revoke execute on function sala_codigos_permitidos() from public, anon, authenticated;

create or replace function sala_activas() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce((select valor = 'true' from sala_config where clave = 'activas'), false)
$$;
revoke execute on function sala_activas() from public, anon, authenticated;

-- Bump de versión + señal. Cualquier cambio visible pasa por acá.
create or replace function sala_tocar(p_room uuid) returns void
language sql security definer set search_path = public, extensions, pg_temp as $$
  update rooms set version = version + 1, updated_at = now() where id = p_room;
$$;
revoke execute on function sala_tocar(uuid) from public, anon, authenticated;

create or replace function rooms_publicar_cambio() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if new.version <> old.version then
    -- Señal mínima y pública: sólo la versión. Sin nombres, votos ni resultado.
    perform realtime.send(jsonb_build_object('v', new.version), 'cambio', 'sala:' || new.id::text, false);
  end if;
  return new;
end;
$$;
revoke execute on function rooms_publicar_cambio() from public, anon, authenticated;
drop trigger if exists rooms_publicar_cambio on rooms;
create trigger rooms_publicar_cambio after update on rooms
  for each row execute function rooms_publicar_cambio();

create or replace function sala_hash(p_token text) returns bytea
language sql immutable set search_path = public, extensions, pg_temp as $$
  select extensions.digest(p_token, 'sha256')
$$;
revoke execute on function sala_hash(text) from public, anon, authenticated;

-- La credencial que manda el cliente: 32 bytes en base64url sin relleno, o sea
-- exactamente 43 caracteres de [A-Za-z0-9_-]. La base no la genera ni la
-- guarda: sólo comprueba la forma y usa su sha256. Una credencial predecible
-- perjudica únicamente a quien la eligió.
create or replace function sala_credencial_valida(p text) returns text
language plpgsql immutable set search_path = public, extensions, pg_temp as $$
begin
  if p is null or p !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'sala_credencial_invalida' using errcode = '22023'; end if;
  return p;
end;
$$;
revoke execute on function sala_credencial_valida(text) from public, anon, authenticated;

-- Deduplica y ordena, pero RECHAZA el array entero si trae un código
-- desconocido: ["n","zz","d"] no se convierte en silencio en ["n","d"].
create or replace function sala_plataformas_validas(p text[]) returns text[]
language plpgsql immutable set search_path = public, extensions, pg_temp as $$
declare v text[]; desconocidos text[];
begin
  if p is null or cardinality(p) < 1 then raise exception 'sala_sin_plataformas' using errcode = '22023'; end if;
  if cardinality(p) > 14 then raise exception 'sala_demasiadas_plataformas' using errcode = '22023'; end if;
  select array_agg(c) into desconocidos from unnest(p) c where c is null or not (c = any (sala_codigos_permitidos()));
  if desconocidos is not null then raise exception 'sala_plataforma_desconocida: %', array_to_string(desconocidos, ',') using errcode = '22023'; end if;
  select array_agg(distinct c order by c) into v from unnest(p) c;
  return v;
end;
$$;
revoke execute on function sala_plataformas_validas(text[]) from public, anon, authenticated;

-- Normaliza y valida el nombre en el servidor: sin controles, espacios
-- colapsados, 1..24 caracteres.
create or replace function sala_nombre_valido(p text) returns text
language plpgsql immutable set search_path = public, extensions, pg_temp as $$
declare v text;
begin
  v := btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[\x00-\x1F\x7F]', '', 'g'), '\s+', ' ', 'g'));
  if char_length(v) < 1 or char_length(v) > 24 then raise exception 'sala_nombre_invalido' using errcode = '22023'; end if;
  return v;
end;
$$;
revoke execute on function sala_nombre_valido(text) from public, anon, authenticated;

-- El participante detrás de un token, EN ESA sala. El id siempre sale de acá.
create or replace function sala_participante(p_room uuid, p_token text) returns room_participants
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare p room_participants;
begin
  select * into p from room_participants where room_id = p_room and token_hash = sala_hash(p_token);
  if not found then raise exception 'sala_token_invalido' using errcode = '28000'; end if;
  return p;
end;
$$;
revoke execute on function sala_participante(uuid, text) from public, anon, authenticated;

create or replace function sala_limite_seg(p_size int) returns int
language sql immutable as $$
  select case p_size when 5 then 120 when 10 then 180 when 20 then 300 end
$$;
revoke execute on function sala_limite_seg(int) from public, anon, authenticated;

-- Cómputo AUTORITATIVO del resultado de una ronda. N = participantes de la sala.
-- ORDEN DE BLOQUEO: la llama sala_votar o sala_aplicar_vencimientos, que ya
-- tienen bloqueada la fila de rooms; acá se bloquea la ronda DESPUÉS. La marca
-- `-- llamador: sala bloqueada` DENTRO del cuerpo es lo que lee el test de orden.
create or replace function sala_computar(p_round uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  r room_rounds; n int; maximo int; ganadores int[];
begin
  -- llamador: sala bloqueada
  select * into r from room_rounds where id = p_round for update;
  if r.estado <> 'votando' then return; end if;
  select count(*) into n from room_participants where room_id = r.room_id;

  with c as (
    select pos, count(*) as sies from room_votes where round_id = p_round and voto = 'yes' group by pos
  )
  select coalesce(max(sies), 0), coalesce(array_agg(pos order by pos) filter (where sies = (select max(sies) from c)), '{}')
  into maximo, ganadores from c;

  if maximo < 2 then
    update room_rounds set estado = 'cerrada', closed_at = now(), resultado = 'sin_coincidencias' where id = p_round;
    update rooms set estado = 'resultado', expires_at = now() + interval '5 minutes' where id = r.room_id;
  elsif cardinality(ganadores) = 1 then
    update room_rounds set estado = 'cerrada', closed_at = now(),
      resultado = case when n = 2 then 'match' else 'ganador' end, ganador_pos = ganadores[1] where id = p_round;
    update rooms set estado = 'resultado', expires_at = now() + interval '5 minutes' where id = r.room_id;
  else
    update room_rounds set estado = 'cerrada', closed_at = now(), resultado = 'empate', empatadas = ganadores where id = p_round;
    update rooms set estado = 'empate', expires_at = now() + interval '5 minutes' where id = r.room_id;
  end if;
  perform sala_tocar(r.room_id);
end;
$$;
revoke execute on function sala_computar(uuid) from public, anon, authenticated;

-- Vencimientos por reloj de la base, aplicados de forma perezosa por
-- sala_estado y por el barrido. Idempotente. Bloquea la fila de la sala
-- PRIMERO; la ronda, si hace falta, después (sala_computar).
create or replace function sala_aplicar_vencimientos(p_room uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s rooms; r room_rounds;
begin
  select * into s from rooms where id = p_room for update;
  if not found then return; end if;

  if s.estado = 'lobby' and now() > s.lobby_expires_at then
    update rooms set estado = 'vencida', expires_at = least(expires_at, now() + interval '5 minutes') where id = p_room;
    perform sala_tocar(p_room); return;
  end if;

  if s.estado = 'preparando' then
    select * into r from room_rounds where room_id = p_room and estado = 'preparando' order by numero desc limit 1;
    if found and r.created_at < now() - interval '90 seconds' then
      delete from room_rounds where id = r.id;
      -- Misma regla que sala_abortar_preparacion: al volver al lobby se renueva
      -- también lobby_expires_at por 5 min, acotado.
      update rooms set estado = coalesce(estado_previo, 'lobby'), estado_previo = null,
        round_actual = (select id from room_rounds where room_id = p_room order by numero desc limit 1),
        expires_at = greatest(expires_at, now() + interval '5 minutes'),
        lobby_expires_at = case when coalesce(estado_previo, 'lobby') = 'lobby'
                                then greatest(lobby_expires_at, now() + interval '5 minutes') else lobby_expires_at end
      where id = p_room;
      perform sala_tocar(p_room);
    end if;
    -- Una sala en `preparando` NUNCA se marca vencida ni se borra desde acá.
    return;
  end if;

  if s.estado = 'votando' then
    select * into r from room_rounds where id = s.round_actual;
    if found and r.estado = 'votando' and now() > r.deadline_at then perform sala_computar(r.id); end if;
    return;
  end if;

  if s.estado in ('empate', 'resultado') and now() > s.expires_at then
    update rooms set estado = 'vencida' where id = p_room;
    update room_rounds set resultado = 'vencida' where id = s.round_actual and resultado = 'empate';
    perform sala_tocar(p_room);
  end if;
end;
$$;
revoke execute on function sala_aplicar_vencimientos(uuid) from public, anon, authenticated;

-- ── RPCs de participante y de cuenta ───────────────────────────────────────

create or replace function sala_crear(p_nombre text, p_platforms text[], p_credencial text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare uid uuid := auth.uid(); rid uuid; h bytea; activas int; previa rooms; r_id uuid;
begin
  if uid is null then raise exception 'sala_sin_sesion' using errcode = '28000'; end if;
  h := sala_hash(sala_credencial_valida(p_credencial));
  -- Serializa la creación POR USUARIO hasta el fin de la transacción: dos
  -- llamadas concurrentes de la misma cuenta se ejecutan una detrás de otra y
  -- la segunda ve la sala que insertó la primera. Sin esto, count + insert
  -- es una carrera y las dos pasan. También serializa dos reintentos de la
  -- MISMA credencial: el segundo encuentra la sala del primero.
  perform pg_advisory_xact_lock(hashtext('sala_crear:' || uid::text));

  -- 1. Misma credencial → misma sala. VA ANTES DEL KILL SWITCH: recuperar una
  --    respuesta perdida no es una creación nueva. No se rota nada: la
  --    credencial válida es la que el cliente ya tiene.
  select r.* into previa from rooms r join room_participants p on p.room_id = r.id and p.es_host
  where r.host_user_id = uid and p.token_hash = h;
  if found then
    return jsonb_build_object('room_id', previa.id, 'repetido', true, 'estado', previa.estado);
  end if;

  if not sala_activas() then raise exception 'sala_desactivadas' using errcode = '55000'; end if;

  -- 2. Una sola sala activa. Primero se aplican los vencimientos por reloj de
  --    las salas del organizador que el barrido todavía no procesó (un lobby
  --    con los 15 min pasados, una ventana de resultado agotada): así una sala
  --    vencida de hecho no bloquea la creación, y el conteo usa EXACTAMENTE el
  --    predicado del índice rooms_host_activa_idx (estado <> 'vencida').
  for r_id in select id from rooms where host_user_id = uid and estado <> 'vencida' loop
    perform sala_aplicar_vencimientos(r_id);
  end loop;
  select count(*) into activas from rooms where host_user_id = uid and estado <> 'vencida';
  if activas >= 1 then raise exception 'sala_ya_tiene_activa' using errcode = '23505'; end if;

  -- La misma credencial no puede ser de otro participante (índice único global).
  if exists (select 1 from room_participants where token_hash = h) then raise exception 'sala_credencial_en_uso' using errcode = '23505'; end if;

  insert into rooms (host_user_id, seed, lobby_expires_at, expires_at)
  values (uid, encode(extensions.gen_random_bytes(16), 'hex'), now() + interval '15 minutes', now() + interval '20 minutes')
  returning id into rid;
  insert into room_participants (room_id, token_hash, user_id, nombre, platforms, es_host)
  values (rid, h, uid, sala_nombre_valido(p_nombre), sala_plataformas_validas(p_platforms), true);
  perform sala_tocar(rid);
  return jsonb_build_object('room_id', rid, 'repetido', false, 'estado', 'lobby');
end;
$$;
revoke execute on function sala_crear(text, text[], text) from public, anon, authenticated;
grant execute on function sala_crear(text, text[], text) to authenticated;

-- 🔴 EL INVITADO NO ELIGE PLATAFORMAS (decisión del dueño, 23/09): las de la
-- sala las pone SÓLO quien la crea, y el invitado hereda esas. Por eso la
-- función ya no recibe `p_platforms` — no alcanzaba con sacar el selector de
-- la pantalla: mientras el parámetro existiera, una llamada directa seguía
-- pudiendo ampliar la unión de la sala, que es lo que decide qué películas
-- entran. La firma anterior se borra arriba, así que tampoco responde.
create or replace function sala_unirse(p_room uuid, p_nombre text, p_credencial text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s rooms; uid uuid := auth.uid(); h bytea; n int; existente room_participants; plats text[];
begin
  h := sala_hash(sala_credencial_valida(p_credencial));
  perform sala_aplicar_vencimientos(p_room);
  select * into s from rooms where id = p_room for update;   -- serializa TODOS los ingresos a la sala
  if not found then raise exception 'sala_inexistente' using errcode = 'P0002'; end if;

  -- 1. Misma credencial → misma participación. VA ANTES del kill switch y del
  --    estado: recuperar una respuesta perdida no es un ingreso nuevo, y si la
  --    sala ya empezó el participante existe igual. No se rota nada.
  select * into existente from room_participants where room_id = p_room and token_hash = h;
  if found then return jsonb_build_object('repetido', true); end if;

  if not sala_activas() then raise exception 'sala_desactivadas' using errcode = '55000'; end if;
  if s.estado <> 'lobby' then raise exception 'sala_no_admite_ingresos' using errcode = '55000'; end if;
  if exists (select 1 from room_participants where token_hash = h) then raise exception 'sala_credencial_en_uso' using errcode = '23505'; end if;

  -- 2. Una cuenta autenticada no ocupa dos lugares: su participación pasa a la
  --    credencial nueva (la anterior deja de servir). Repetir esta misma
  --    credencial después —aun con la sala empezada— cae en el paso 1.
  if uid is not null then
    select * into existente from room_participants where room_id = p_room and user_id = uid;
    if found then
      update room_participants set token_hash = h, last_seen_at = now() where id = existente.id;
      return jsonb_build_object('repetido', true);
    end if;
  end if;
  select count(*) into n from room_participants where room_id = p_room;
  if n >= 6 then raise exception 'sala_llena' using errcode = '54000'; end if;
  -- Hereda las del organizador: la columna sigue diciendo con qué plataformas
  -- entró este participante, y la unión de la sala no se mueve por quién entra.
  select platforms into plats from room_participants where room_id = p_room and es_host;
  if plats is null then raise exception 'sala_inexistente' using errcode = 'P0002'; end if;
  insert into room_participants (room_id, token_hash, user_id, nombre, platforms)
  values (p_room, h, uid, sala_nombre_valido(p_nombre), plats);
  perform sala_tocar(p_room);
  return jsonb_build_object('repetido', false);
end;
$$;
revoke execute on function sala_unirse(uuid, text, text) from public, anon, authenticated;
grant execute on function sala_unirse(uuid, text, text) to anon, authenticated;

-- Recuperar la participación (organizador u invitado con cuenta) desde otro
-- navegador: la participación pasa a la credencial NUEVA que generó ese
-- navegador; la anterior deja de servir. Repetirla es idempotente (mismo hash).
create or replace function sala_reclamar(p_room uuid, p_credencial text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare uid uuid := auth.uid(); p room_participants; h bytea;
begin
  if uid is null then raise exception 'sala_sin_sesion' using errcode = '28000'; end if;
  h := sala_hash(sala_credencial_valida(p_credencial));
  perform 1 from rooms where id = p_room for update;
  select * into p from room_participants where room_id = p_room and user_id = uid;
  if not found then raise exception 'sala_no_participa' using errcode = 'P0002'; end if;
  if p.token_hash = h then return jsonb_build_object('ok', true, 'repetido', true); end if;
  if exists (select 1 from room_participants where token_hash = h) then raise exception 'sala_credencial_en_uso' using errcode = '23505'; end if;
  update room_participants set token_hash = h, last_seen_at = now() where id = p.id;
  return jsonb_build_object('ok', true, 'repetido', false);
end;
$$;
revoke execute on function sala_reclamar(uuid, text) from public, anon, authenticated;
grant execute on function sala_reclamar(uuid, text) to authenticated;

-- Lo que ESTE participante puede ver. Aplica vencimientos antes de leer.
create or replace function sala_estado(p_room uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  s rooms; yo room_participants; r room_rounds; n int; k int; mi_sig int; res jsonb;
begin
  perform sala_aplicar_vencimientos(p_room);
  select * into s from rooms where id = p_room;
  if not found then return jsonb_build_object('estado', 'inexistente'); end if;
  yo := sala_participante(p_room, p_token);
  update room_participants set last_seen_at = now() where id = yo.id;
  select count(*) into n from room_participants where room_id = p_room;

  res := jsonb_build_object(
    'estado', s.estado, 'version', s.version, 'ahora', now(), 'expires_at', s.expires_at,
    'lobby_expires_at', s.lobby_expires_at,
    'soy', jsonb_build_object('id', yo.id, 'nombre', yo.nombre, 'platforms', to_jsonb(yo.platforms), 'es_host', yo.es_host),
    'participantes', (
      select coalesce(jsonb_agg(jsonb_build_object('nombre', p.nombre, 'es_host', p.es_host, 'soy', p.id = yo.id) order by p.joined_at), '[]')
      from room_participants p where p.room_id = p_room),
    'union', to_jsonb(coalesce(s.platforms_frozen, (select array_agg(distinct c) from room_participants p, unnest(p.platforms) c where p.room_id = p_room))),
    'n', n, 'config_default', jsonb_build_object('size', 10, 'duracion', 'cualquiera')
  );

  if s.round_actual is not null then
    select * into r from room_rounds where id = s.round_actual;
    select count(*) into k from room_participants p where p.room_id = p_room
      and (select count(*) from room_votes v where v.round_id = r.id and v.participant_id = p.id) >= r.size;
    select count(*) into mi_sig from room_votes v where v.round_id = r.id and v.participant_id = yo.id;

    res := res || jsonb_build_object('ronda', jsonb_build_object(
      'id', r.id, 'numero', r.numero, 'size', r.size, 'duracion', r.duracion, 'limite_seg', r.limite_seg,
      'estado', r.estado, 'started_at', r.started_at, 'deadline_at', r.deadline_at,
      'terminaron', k, 'mi_siguiente_pos', mi_sig,
      'mis_votos', (select coalesce(jsonb_object_agg(v.pos, v.voto), '{}') from room_votes v where v.round_id = r.id and v.participant_id = yo.id),
      'titulos', case when r.estado in ('votando','cerrada') then (
        select coalesce(jsonb_agg(jsonb_build_object('pos', t.pos, 'tmdb_id', t.tmdb_id, 'titulo', t.titulo, 'anio', t.anio,
          'runtime', t.runtime, 'poster', t.poster, 'generos', to_jsonb(t.generos), 'platforms', to_jsonb(t.platforms),
          'razon', t.razon, 'advertencia', t.advertencia) order by t.pos), '[]')
        from room_titles t where t.round_id = r.id) else '[]'::jsonb end
    ));

    if r.estado = 'cerrada' then
      res := res || jsonb_build_object('resultado', jsonb_build_object(
        'tipo', r.resultado, 'ganador_pos', r.ganador_pos, 'empatadas', to_jsonb(r.empatadas),
        'desempatado', r.desempatado_at is not null,
        'puede_desempatar', yo.es_host and s.estado = 'empate',
        -- CON GANADORA NO HAY OTRA TANDA (decision del dueno, 23/09): si el
        -- grupo ya tiene pelicula -por match directo, por ser la mas votada o
        -- despues de desempatar- la sala se termino y para otra ronda se arma
        -- una nueva. `ganador_pos is null` cubre los tres casos de una: el
        -- desempate NO cambia `resultado` (sigue en 'empate'), solo llena
        -- `ganador_pos`, asi que mirar el tipo no alcanzaria. La unica pantalla
        -- que la conserva es 'sin_coincidencias', que es la que no tiene
        -- ganadora. El empate sin resolver ya quedaba afuera por `s.estado`.
        'puede_otra_tanda', yo.es_host and s.estado = 'resultado' and r.ganador_pos is null
      ));
    end if;
  end if;
  return res;
end;
$$;
revoke execute on function sala_estado(uuid, text) from public, anon, authenticated;
grant execute on function sala_estado(uuid, text) to anon, authenticated;

create or replace function sala_votar(p_room uuid, p_token text, p_round uuid, p_pos int, p_voto text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  s rooms; yo room_participants; r room_rounds; n int; mios int; previo text; otro int; terminaron int;
begin
  if p_voto not in ('yes','no','pass') then raise exception 'sala_voto_invalido' using errcode = '22023'; end if;
  perform sala_aplicar_vencimientos(p_room);
  select * into s from rooms where id = p_room for update;        -- serializa por sala
  if not found then return jsonb_build_object('ok', false, 'motivo', 'inexistente'); end if;
  yo := sala_participante(p_room, p_token);                       -- el id sale del token, nunca del cuerpo
  select * into r from room_rounds where id = p_round and room_id = p_room;
  if not found or r.estado <> 'votando' or s.round_actual is distinct from r.id or now() > r.deadline_at then
    return jsonb_build_object('ok', false, 'motivo', 'ronda_cerrada', 'estado', s.estado);
  end if;

  select count(*) into mios from room_votes where round_id = r.id and participant_id = yo.id;
  if p_pos < mios then
    select voto into previo from room_votes where round_id = r.id and participant_id = yo.id and pos = p_pos;
    if previo = p_voto then return jsonb_build_object('ok', true, 'idempotente', true, 'termine', mios >= r.size, 'estado', s.estado); end if;
    return jsonb_build_object('ok', false, 'motivo', 'ya_votado', 'siguiente', mios);
  end if;
  if p_pos > mios or p_pos >= r.size then return jsonb_build_object('ok', false, 'motivo', 'fuera_de_orden', 'siguiente', mios); end if;

  insert into room_votes (round_id, participant_id, pos, voto) values (r.id, yo.id, p_pos, p_voto);
  mios := mios + 1;
  select count(*) into n from room_participants where room_id = p_room;

  -- Dos personas: el primer segundo Sí confirmado en esta transacción es el match.
  if n = 2 and p_voto = 'yes' then
    select count(*) into otro from room_votes v where v.round_id = r.id and v.pos = p_pos and v.voto = 'yes' and v.participant_id <> yo.id;
    if otro = 1 then
      update room_rounds set estado = 'cerrada', closed_at = now(), resultado = 'match', ganador_pos = p_pos where id = r.id;
      update rooms set estado = 'resultado', expires_at = now() + interval '5 minutes' where id = p_room;
      perform sala_tocar(p_room);
      return jsonb_build_object('ok', true, 'termine', true, 'estado', 'resultado');
    end if;
  end if;

  if mios >= r.size then
    perform sala_tocar(p_room);  -- "terminaron k de N" cambió
    select count(*) into terminaron from room_participants p where p.room_id = p_room
      and (select count(*) from room_votes v where v.round_id = r.id and v.participant_id = p.id) >= r.size;
    if terminaron >= n then perform sala_computar(r.id); end if;
  end if;
  return jsonb_build_object('ok', true, 'termine', mios >= r.size, 'estado', (select estado from rooms where id = p_room));
end;
$$;
revoke execute on function sala_votar(uuid, text, uuid, int, text) from public, anon, authenticated;
grant execute on function sala_votar(uuid, text, uuid, int, text) to anon, authenticated;

create or replace function sala_desempatar(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s rooms; r room_rounds; g int;
begin
  perform sala_aplicar_vencimientos(p_room);
  select * into s from rooms where id = p_room for update;
  if not found or s.host_user_id <> auth.uid() then raise exception 'sala_no_es_host' using errcode = '42501'; end if;
  select * into r from room_rounds where id = s.round_actual;
  if r.resultado <> 'empate' then raise exception 'sala_sin_empate' using errcode = '55000'; end if;
  if r.desempatado_at is not null then return jsonb_build_object('ganador_pos', r.ganador_pos); end if;  -- idempotente
  -- Determinístico por semilla de sala, sólo entre las empatadas, sin popularidad ni nota.
  select t.pos into g from room_titles t where t.round_id = r.id and t.pos = any (r.empatadas)
  order by md5(s.seed || t.tmdb_id::text) limit 1;
  update room_rounds set ganador_pos = g, desempatado_at = now() where id = r.id;
  update rooms set estado = 'resultado', expires_at = now() + interval '5 minutes' where id = p_room;
  perform sala_tocar(p_room);
  return jsonb_build_object('ganador_pos', g);
end;
$$;
revoke execute on function sala_desempatar(uuid) from public, anon, authenticated;
grant execute on function sala_desempatar(uuid) to authenticated;

create or replace function sala_cerrar(p_room uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s rooms;
begin
  select * into s from rooms where id = p_room for update;
  if not found or s.host_user_id <> auth.uid() then raise exception 'sala_no_es_host' using errcode = '42501'; end if;
  if s.estado = 'preparando' then raise exception 'sala_preparando' using errcode = '55000'; end if;  -- primero termina o aborta la preparación
  -- Cerrar NO borra en el acto: la sala queda `vencida` y conserva los 5 min
  -- para que los participantes vean "el organizador cerró la sala".
  update rooms set estado = 'vencida', expires_at = now() + interval '5 minutes' where id = p_room;
  perform sala_tocar(p_room);
end;
$$;
revoke execute on function sala_cerrar(uuid) from public, anon, authenticated;
grant execute on function sala_cerrar(uuid) to authenticated;

-- ── Preparación: sólo service_role (la llama Vercel tras verificar el JWT) ──

create or replace function sala_iniciar_preparacion(p_room uuid, p_host uuid, p_size int, p_duracion text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s rooms; n int; rid uuid; ptok uuid; num int; u text[];
begin
  perform sala_aplicar_vencimientos(p_room);
  select * into s from rooms where id = p_room for update;
  if not found or s.host_user_id <> p_host then raise exception 'sala_no_es_host' using errcode = '42501'; end if;
  if s.estado not in ('lobby', 'resultado') then raise exception 'sala_estado_no_permite' using errcode = '55000'; end if;
  if p_size not in (5,10,20) or p_duracion not in ('cualquiera','corta','larga') then raise exception 'sala_config_invalida' using errcode = '22023'; end if;
  select count(*) into n from room_participants where room_id = p_room;
  if n < 2 then raise exception 'sala_sin_quorum' using errcode = '55000'; end if;
  u := coalesce(s.platforms_frozen, (select array_agg(distinct c order by c) from room_participants p, unnest(p.platforms) c where p.room_id = p_room));
  select coalesce(max(numero), 0) + 1 into num from room_rounds where room_id = p_room;
  insert into room_rounds (room_id, numero, size, duracion, limite_seg)
  values (p_room, num, p_size, p_duracion, sala_limite_seg(p_size)) returning id, prep_token into rid, ptok;
  -- "Otra tanda" cancela y reemplaza el vencimiento anterior: una sala en
  -- `preparando` nunca puede quedar con `expires_at` en el pasado.
  update rooms set estado = 'preparando', estado_previo = s.estado, platforms_frozen = u, round_actual = rid,
    expires_at = greatest(s.expires_at, now() + interval '5 minutes') where id = p_room;
  perform sala_tocar(p_room);
  return jsonb_build_object('round_id', rid, 'prep_token', ptok, 'numero', num, 'union', to_jsonb(u),
    'excluir', (select coalesce(jsonb_agg(distinct t.tmdb_id), '[]') from room_titles t join room_rounds rr on rr.id = t.round_id where rr.room_id = p_room));
end;
$$;
revoke execute on function sala_iniciar_preparacion(uuid, uuid, int, text) from public, anon, authenticated;
grant execute on function sala_iniciar_preparacion(uuid, uuid, int, text) to service_role;

-- Candidatas del pool curado. Cualquiera = corta ∪ larga, estrictamente. Nunca
-- apto_chicos, nunca sin duración, nunca sin "por qué" (razon con texto real
-- tras btrim). El "pero" (advertencia) es OPCIONAL: NULL, vacío o sólo espacios
-- se sirven igual. Orden por semilla de sala: sin popularidad ni nota.
create or replace function sala_candidatos(p_providers text[], p_duracion text, p_excluir int[], p_seed text, p_limit int)
returns table (tmdb_id int, runtime int, razon text, advertencia text, year int, genres text[])
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select rt.tmdb_id, rt.runtime, rt.razon, nullif(btrim(rt.advertencia), ''), rt.year, rt.genres
  from roulette_titles rt
  join title_availability ta on ta.tmdb_id = rt.tmdb_id and ta.media_type = rt.media_type and ta.region = 'AR'
  where rt.media_type = 'movie'
    and nullif(btrim(rt.razon), '') is not null   -- razón con texto real: ni NULL, ni '', ni espacios
    and rt.runtime is not null and rt.runtime > 0
    and not rt.apto_chicos
    and not rt.requiere_contexto
    and ta.providers && p_providers
    and not (rt.tmdb_id = any (coalesce(p_excluir, '{}')))
    and case p_duracion when 'corta' then rt.runtime <= 90 when 'larga' then rt.runtime > 90 else true end
  order by md5(p_seed || rt.tmdb_id::text)
  limit least(greatest(coalesce(p_limit, 40), 1), 80)
$$;
revoke execute on function sala_candidatos(text[], text, int[], text, int) from public, anon, authenticated;
grant execute on function sala_candidatos(text[], text, int[], text, int) to service_role;

-- Publica la ronda de forma atómica: valida TODO el lote, inserta TODAS las
-- cards y recién ahí fija started_at/deadline_at. Si algo falla, no publica nada.
-- ORDEN DE BLOQUEO: la sala (leyendo primero el room_id de la ronda SIN
-- bloquear) y después la ronda.
create or replace function sala_publicar_ronda(p_round uuid, p_prep_token uuid, p_titulos jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  r room_rounds; s rooms; rid uuid; cant int; t0 timestamptz := now(); permitidos text[] := sala_codigos_permitidos();
begin
  select room_id into rid from room_rounds where id = p_round;
  if rid is null then raise exception 'sala_prep_invalida' using errcode = '55000'; end if;
  select * into s from rooms where id = rid for update;
  select * into r from room_rounds where id = p_round for update;
  if not found or r.prep_token <> p_prep_token or r.estado <> 'preparando' or s.estado <> 'preparando' or s.round_actual is distinct from r.id then
    raise exception 'sala_prep_invalida' using errcode = '55000';
  end if;

  -- 1. Forma: un array con EXACTAMENTE size elementos.
  if jsonb_typeof(p_titulos) <> 'array' or jsonb_array_length(p_titulos) <> r.size then
    raise exception 'sala_tanda_incompleta' using errcode = '23514';
  end if;
  -- 2. Posiciones exactas 0..size-1, sin huecos ni repetidos.
  if (select array_agg((x->>'pos')::int order by (x->>'pos')::int) from jsonb_array_elements(p_titulos) x)
     is distinct from (select array_agg(g) from generate_series(0, r.size - 1) g) then
    raise exception 'sala_posiciones_invalidas' using errcode = '23514';
  end if;
  -- 3. Campos obligatorios, duración coherente con la ronda, plataformas válidas
  --    Y compatibles con la unión congelada de la sala, tmdb_id no repetido en
  --    rondas anteriores de esta sala. 'advertencia' puede venir NULL o vacía:
  --    es opcional y NO se rechaza.
  if exists (
    select 1 from jsonb_array_elements(p_titulos) x
    left join lateral (select coalesce(array(select jsonb_array_elements_text(x->'platforms')), '{}') as plats) pl on true
    where nullif(btrim(x->>'titulo'), '') is null
       or nullif(btrim(x->>'razon'), '') is null
       or (x->>'tmdb_id') !~ '^\d+$'
       or coalesce((x->>'runtime')::int, 0) <= 0
       or (r.duracion = 'corta' and (x->>'runtime')::int > 90)
       or (r.duracion = 'larga' and (x->>'runtime')::int <= 90)
       or cardinality(pl.plats) = 0
       or not (pl.plats <@ permitidos)
       or not (pl.plats && s.platforms_frozen)
       or exists (select 1 from room_titles t join room_rounds rr on rr.id = t.round_id
                  where rr.room_id = rid and rr.id <> r.id and t.tmdb_id = (x->>'tmdb_id')::int)
  ) then
    raise exception 'sala_card_invalida' using errcode = '23514';
  end if;

  insert into room_titles (round_id, pos, tmdb_id, titulo, anio, runtime, poster, generos, platforms, razon, advertencia)
  select p_round, (x->>'pos')::int, (x->>'tmdb_id')::int, btrim(x->>'titulo'), (x->>'anio')::int, (x->>'runtime')::int, x->>'poster',
         coalesce(array(select jsonb_array_elements_text(x->'generos')), '{}'),
         coalesce(array(select jsonb_array_elements_text(x->'platforms')), '{}'),
         x->>'razon', nullif(btrim(x->>'advertencia'), '')   -- vacía → NULL: sin "Pero"
  from jsonb_array_elements(p_titulos) x;
  select count(*) into cant from room_titles where round_id = p_round;
  if cant <> r.size then raise exception 'sala_tanda_incompleta' using errcode = '23514'; end if;

  update room_rounds set estado = 'votando', started_at = t0, deadline_at = t0 + make_interval(secs => r.limite_seg) where id = p_round;
  update rooms set estado = 'votando', estado_previo = null, expires_at = t0 + make_interval(secs => r.limite_seg) + interval '5 minutes' where id = rid;
  perform sala_tocar(rid);
  return jsonb_build_object('ok', true, 'started_at', t0, 'deadline_at', t0 + make_interval(secs => r.limite_seg));
end;
$$;
revoke execute on function sala_publicar_ronda(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function sala_publicar_ronda(uuid, uuid, jsonb) to service_role;

-- Idempotente. Mismo orden de bloqueo: sala y después ronda.
create or replace function sala_abortar_preparacion(p_round uuid, p_prep_token uuid) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare r room_rounds; rid uuid;
begin
  select room_id into rid from room_rounds where id = p_round;
  if rid is null then return; end if;
  perform 1 from rooms where id = rid for update;
  select * into r from room_rounds where id = p_round for update;
  if not found or r.prep_token <> p_prep_token or r.estado <> 'preparando' then return; end if;
  delete from room_rounds where id = p_round;
  -- Vuelve al estado anterior con una ventana fresca de 5 min: el organizador
  -- tiene que poder leer el motivo y reintentar. round_actual apunta a la
  -- ronda cerrada anterior si la hubo (para seguir mostrando su resultado).
  -- Si vuelve al LOBBY, también se renueva `lobby_expires_at` por 5 min: si
  -- los 15 originales ya pasaron, la siguiente sala_estado la vencería en el
  -- acto y el reintentar que se promete no existiría.
  update rooms set estado = coalesce(estado_previo, 'lobby'), estado_previo = null,
    round_actual = (select id from room_rounds where room_id = rid order by numero desc limit 1),
    expires_at = greatest(expires_at, now() + interval '5 minutes'),
    lobby_expires_at = case when coalesce(estado_previo, 'lobby') = 'lobby'
                            then greatest(lobby_expires_at, now() + interval '5 minutes') else lobby_expires_at end
  where id = rid;
  perform sala_tocar(rid);
end;
$$;
revoke execute on function sala_abortar_preparacion(uuid, uuid) from public, anon, authenticated;
grant execute on function sala_abortar_preparacion(uuid, uuid) to service_role;

-- ── Barrido periódico, idempotente y autoritativo ──────────────────────────

create or replace function sala_barrido() returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare tocadas int := 0; borradas int; rid uuid;
begin
  for rid in select id from rooms where (estado = 'lobby' and now() > lobby_expires_at)
                                    or estado = 'preparando'
                                    or (estado = 'votando' and round_actual is not null)
                                    or (estado in ('empate','resultado') and now() > expires_at) loop
    perform sala_aplicar_vencimientos(rid); tocadas := tocadas + 1;
  end loop;
  -- El borrado físico es SÓLO para el estado terminal `vencida`. Todo lo demás
  -- llega a `vencida` por sala_aplicar_vencimientos (lobby vencido, ventana de
  -- resultado/empate agotada, cierre manual) y recién ahí, 5 min después, se
  -- borra. Una sala en `preparando` o `votando` jamás se borra por acá.
  delete from rooms where estado = 'vencida' and expires_at < now();
  get diagnostics borradas = row_count;
  return jsonb_build_object('revisadas', tocadas, 'borradas', borradas);
end;
$$;
revoke execute on function sala_barrido() from public, anon, authenticated;
-- La corre pg_cron como postgres (owner). service_role también puede: es el
-- rol del servidor y de la batería local, que fuerza relojes y barre a mano.
grant execute on function sala_barrido() to service_role;

-- Cron: cada minuto (pg_cron). Con Postgres >= 15.1.1.61 se podría bajar a
-- '30 seconds'; no hace falta para una ventana de 5 minutos.
select cron.unschedule('sala-barrido') where exists (select 1 from cron.job where jobname = 'sala-barrido');
select cron.schedule('sala-barrido', '* * * * *', $$ select public.sala_barrido(); $$);
