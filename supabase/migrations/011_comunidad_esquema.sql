-- Reseñas de la comunidad, entrega E2a: esquema, participantes y permisos.
-- Plan: docs/superpowers/plans/2026-10-22-resenas-comunidad.md (E2a).
-- Diseño: docs/superpowers/specs/2026-10-21-resenas-comunidad-revision.md
-- (§2.1, §2.2.1–§2.2.3).
--
-- QUÉ HACE. Crea el esquema `comunidad` con sus once tablas, sus invariantes y
-- los triggers que las sostienen. NO crea funciones de API: las escrituras y
-- lecturas llegan desde E2b/E3 como `public.comunidad_*`, `security definer`,
-- con `set search_path = ''` y EXECUTE sólo para el rol que corresponda.
--
-- 🔴 NADIE DE LA API TOCA ESTAS TABLAS. Ni `anon`, ni `authenticated`, ni
-- `service_role`. Tres barreras independientes, probadas por separado en
-- scripts/comunidad/pruebas-permisos.mjs:
--   1. grants: `revoke all` explícito sobre el esquema, cada tabla, cada
--      secuencia y cada función, para PUBLIC y los tres roles;
--   2. RLS activada en cada tabla, sin ninguna policy;
--   3. el esquema no está en `[api] schemas` (supabase/config.toml), así que
--      PostgREST no lo expone.
-- El único con acceso es el dueño de la migración (`postgres`), que será el
-- dueño de las funciones `security definer`.
--
-- ⚠️ Los privilegios por defecto de Producción no están verificados (E0 Q5).
-- Por eso los `revoke` son explícitos sobre cada objeto y no dependen de
-- `alter default privileges` (ver el final del archivo). Todo objeto que
-- agregue una entrega posterior repite su revoke, y la batería de permisos lo
-- comprueba sobre lo que haya en el esquema.
--
-- 🔴 NO TOCA NADA PREEXISTENTE. Ni `user_reviews` (su cierre es 022, aparte),
-- ni `profiles.display_name`: el nombre comunitario es otra columna, acá.
-- Ninguna tabla referencia `auth.users` salvo `participantes.user_id` (on
-- delete set null) y `bajas_en_curso.user_id` (on delete cascade), §2.2.3.
--
-- Rollback: 011_comunidad_esquema_down.sql (borra sólo lo de esta migración).
--
-- Transacción única: o queda todo o no queda nada. Repetible, como las demás
-- migraciones del repo (db-local.mjs las vuelve a aplicar en cada corrida):
-- `if not exists`, `or replace` y `drop trigger if exists`. Ojo: repetirla NO
-- cambia la definición de una tabla que ya existe.

begin;

create schema if not exists comunidad;
comment on schema comunidad is
  'Reseñas de la comunidad. Privado: sin grants para anon, authenticated ni service_role, RLS sin policies y fuera de PostgREST.';

-- ------------------------------------------------------------------
-- Formas de texto compartidas.
--
-- `char_length` cuenta puntos de código, igual que los largos normalizados de
-- lib/comunidad/reglas. `is nfc normalized` vale en un CHECK (comprobado en
-- la base local, PostgreSQL 17.6): la función guarda el texto ya normalizado
-- y la base rechaza cualquier otra forma.
--
-- "Sin controles": Cc (U+0000–U+001F, U+007F–U+009F) y los de formato que
-- reordenan o esconden texto (U+200B–U+200F, U+202A–U+202E, U+2060–U+2069,
-- U+FEFF). El nombre los rechaza todos; la reseña admite el salto de línea
-- (es fin de oración en las reglas) y nada más de Cc.
-- ------------------------------------------------------------------

-- ------------------------------------------------------------------
-- participantes (§2.2.1): identidad comunitaria separada de la cuenta.
-- Votos, tramos, suspensiones y resultados la referencian; nunca user_id.
-- ------------------------------------------------------------------
create table if not exists comunidad.participantes (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid unique references auth.users (id) on delete set null,
  nombre_comunitario  text,
  nombre_cambiado_en  timestamptz,
  creado_en           timestamptz not null default now(),
  constraint participantes_nombre_forma check (
    nombre_comunitario is null or (
      char_length(nombre_comunitario) between 2 and 24
      and nombre_comunitario is nfc normalized
      and nombre_comunitario = btrim(nombre_comunitario)
      and nombre_comunitario !~ '[\u0001-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]'
    )
  )
);

-- ------------------------------------------------------------------
-- resenas: una por autor y título mientras esté viva. Borrar la propia es
-- `borrada_en` (invisible al instante; la purga llega en E8, §5).
-- ------------------------------------------------------------------
create table if not exists comunidad.resenas (
  id                     bigint generated always as identity primary key,
  autor_participante     uuid not null references comunidad.participantes (id),
  tipo                   text not null check (tipo in ('movie', 'tv')),
  tmdb_id                integer not null check (tmdb_id > 0),
  version_vigente_id     bigint,
  creada_en              timestamptz not null default now(),
  primera_publicacion_en timestamptz,
  borrada_en             timestamptz,
  constraint resenas_id_autor_unico unique (id, autor_participante)
);
create unique index if not exists resenas_una_viva_por_autor_y_titulo
  on comunidad.resenas (autor_participante, tipo, tmdb_id)
  where borrada_en is null;

-- ------------------------------------------------------------------
-- versiones: el texto es inmutable; editar crea otra versión (§3.4.1).
-- El autor se repite a propósito: es la mitad de la FK compuesta que hace que
-- el autor de un voto o de una denuncia sea, por construcción, el de la
-- versión (§2.1.3).
-- ------------------------------------------------------------------
create table if not exists comunidad.versiones (
  id                  bigint generated always as identity primary key,
  resena_id           bigint not null,
  autor_participante  uuid not null,
  texto               text not null,
  estado              text not null check (estado in (
                        'publicada', 'retenida', 'revision_solicitada',
                        'oculta', 'rechazada', 'reemplazada')),
  version_reglas      text not null check (char_length(version_reglas) between 1 and 40),
  regla               text check (regla is null or char_length(regla) between 1 and 80),
  id_intento          uuid not null,
  creada_en           timestamptz not null default now(),
  decidida_en         timestamptz,
  constraint versiones_texto_forma check (
    char_length(texto) between 80 and 600
    and texto is nfc normalized
    and texto !~ '[\u0001-\u0009\u000B-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]'
  ),
  constraint versiones_resena_autor_fk foreign key (resena_id, autor_participante)
    references comunidad.resenas (id, autor_participante) on delete cascade,
  constraint versiones_id_autor_unico unique (id, autor_participante),
  constraint versiones_id_resena_unico unique (id, resena_id),
  -- Reintento idempotente (§3.4.1): el mismo intento no crea otra versión.
  constraint versiones_intento_unico unique (resena_id, id_intento)
);

-- La vigente pertenece a SU reseña. Diferida: la reseña nace sin vigente,
-- se inserta la versión y se apunta en la misma transacción.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'resenas_vigente_fk'
                    and conrelid = 'comunidad.resenas'::regclass) then
    alter table comunidad.resenas
      add constraint resenas_vigente_fk foreign key (version_vigente_id, id)
        references comunidad.versiones (id, resena_id)
        deferrable initially deferred;
  end if;
end;
$$;

-- ------------------------------------------------------------------
-- evaluaciones ("me sirvió" / "no me sirvió"): un voto vigente por evaluador
-- y versión. Retirar es `retirada_en` (operación B, idempotente).
-- ------------------------------------------------------------------
create table if not exists comunidad.evaluaciones (
  id                      bigint generated always as identity primary key,
  version_id              bigint not null,
  autor_participante      uuid not null,
  evaluador_participante  uuid not null references comunidad.participantes (id),
  util                    boolean not null,
  creada_en               timestamptz not null default now(),
  actualizada_en          timestamptz not null default now(),
  retirada_en             timestamptz,
  constraint evaluaciones_version_autor_fk foreign key (version_id, autor_participante)
    references comunidad.versiones (id, autor_participante) on delete cascade,
  constraint evaluaciones_no_propia check (evaluador_participante <> autor_participante)
);
create unique index if not exists evaluaciones_una_vigente
  on comunidad.evaluaciones (evaluador_participante, version_id)
  where retirada_en is null;

-- ------------------------------------------------------------------
-- tramos (§2.2.2): validez temporal de cada positivo elegible, intervalos
-- semiabiertos [vigente_desde, vigente_hasta). La versión va SIN FK (el tramo
-- sobrevive al borrado de la reseña); el par autor/versión se verifica al
-- insertar con un trigger. Se cierran, nunca se borran fuera de la purga.
-- ------------------------------------------------------------------
create table if not exists comunidad.tramos (
  id                      bigint generated always as identity primary key,
  evaluador_participante  uuid not null references comunidad.participantes (id),
  autor_participante      uuid not null references comunidad.participantes (id),
  version_id              bigint not null,
  mes_primera_positiva    date not null check (extract(day from mes_primera_positiva) = 1),
  vigente_desde           timestamptz not null,
  vigente_hasta           timestamptz,
  constraint tramos_no_propio check (evaluador_participante <> autor_participante),
  constraint tramos_intervalo check (vigente_hasta is null or vigente_hasta > vigente_desde)
);
create unique index if not exists tramos_uno_abierto
  on comunidad.tramos (evaluador_participante, version_id)
  where vigente_hasta is null;

-- ------------------------------------------------------------------
-- suspensiones: también intervalos [desde, hasta). Una abierta por vez.
-- ------------------------------------------------------------------
create table if not exists comunidad.suspensiones (
  id               bigint generated always as identity primary key,
  participante_id  uuid not null references comunidad.participantes (id),
  desde            timestamptz not null,
  hasta            timestamptz,
  creada_en        timestamptz not null default now(),
  constraint suspensiones_intervalo check (hasta is null or hasta > desde)
);
create unique index if not exists suspensiones_una_abierta
  on comunidad.suspensiones (participante_id)
  where hasta is null;

-- ------------------------------------------------------------------
-- denuncias: una por denunciante y versión; nunca la propia (FK compuesta +
-- CHECK de la misma fila). El comentario es sólo para el dashboard.
-- ------------------------------------------------------------------
create table if not exists comunidad.denuncias (
  id                        bigint generated always as identity primary key,
  version_id                bigint not null,
  autor_participante        uuid not null,
  denunciante_participante  uuid not null references comunidad.participantes (id),
  categoria                 text not null check (categoria in (
                              'phishing_estafa', 'spam', 'acoso_amenazas', 'odio',
                              'datos_personales', 'sexual_explotacion', 'otro')),
  comentario                text check (comentario is null or (
                              char_length(comentario) between 1 and 300
                              and comentario is nfc normalized)),
  estado                    text not null default 'abierta'
                              check (estado in ('abierta', 'descartada', 'resuelta')),
  creada_en                 timestamptz not null default now(),
  cerrada_en                timestamptz,
  constraint denuncias_version_autor_fk foreign key (version_id, autor_participante)
    references comunidad.versiones (id, autor_participante) on delete cascade,
  constraint denuncias_no_propia check (denunciante_participante <> autor_participante),
  constraint denuncias_una_por_version unique (denunciante_participante, version_id),
  constraint denuncias_cierre check ((estado = 'abierta') = (cerrada_en is null))
);

-- ------------------------------------------------------------------
-- bloqueos: personales; ocultan sólo para quien bloquea (§3.3.4).
-- ------------------------------------------------------------------
create table if not exists comunidad.bloqueos (
  bloqueador_participante  uuid not null references comunidad.participantes (id),
  bloqueado_participante   uuid not null references comunidad.participantes (id),
  creado_en                timestamptz not null default now(),
  primary key (bloqueador_participante, bloqueado_participante),
  constraint bloqueos_no_propio check (bloqueador_participante <> bloqueado_participante)
);

-- ------------------------------------------------------------------
-- contadores de límite por día argentino (§2.1.2). El día lo calcula la
-- función en America/Argentina/Buenos_Aires. Se bloquean al final del orden
-- de locks (§2.2.4).
-- ------------------------------------------------------------------
create table if not exists comunidad.contadores (
  participante_id  uuid not null references comunidad.participantes (id),
  accion           text not null check (accion in (
                     'resena', 'edicion', 'evaluacion', 'denuncia', 'nombre', 'bloqueo')),
  dia              date not null,
  cantidad         integer not null default 0 check (cantidad >= 0),
  primary key (participante_id, accion, dia)
);

-- ------------------------------------------------------------------
-- config: UNA fila. Interruptores T4, todos apagados. Los límites son las
-- HIPÓTESIS de §2.1.2 (no valores aprobados), ajustables sin migración.
-- ------------------------------------------------------------------
create table if not exists comunidad.config (
  id                   boolean primary key default true check (id),
  modulo_activo        boolean not null default false,
  publicacion_activa   boolean not null default false,
  top_yumpers_activo   boolean not null default false,
  limite_resenas       integer not null default 5   check (limite_resenas >= 0),
  limite_ediciones     integer not null default 10  check (limite_ediciones >= 0),
  limite_evaluaciones  integer not null default 100 check (limite_evaluaciones >= 0),
  limite_denuncias     integer not null default 10  check (limite_denuncias >= 0),
  limite_nombres       integer not null default 3   check (limite_nombres >= 0),
  limite_bloqueos      integer not null default 50  check (limite_bloqueos >= 0),
  actualizada_en       timestamptz not null default now()
);
insert into comunidad.config default values on conflict (id) do nothing;

-- ------------------------------------------------------------------
-- bajas_en_curso (§2.2.3): marcador persistente del contrato de baja. Cae con
-- la fila de Auth. La lógica (baja_comunitaria) es de E2b.
-- ------------------------------------------------------------------
create table if not exists comunidad.bajas_en_curso (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  iniciada_en   timestamptz not null default now(),
  intentos      integer not null default 0 check (intentos >= 0),
  ultimo_error  text check (ultimo_error is null or char_length(ultimo_error) <= 500)
);

-- ==================================================================
-- Triggers de invariantes. Viven en `comunidad` (no son API) y son del dueño.
-- ==================================================================

-- Transiciones de versión (§2.1.3). Lo que cambia es el estado y la marca de
-- decisión; texto, autor, reseña, reglas e intento son inmutables.
--   publicada           → retenida | oculta | reemplazada
--   retenida            → publicada | rechazada | reemplazada
--   revision_solicitada → publicada | rechazada | reemplazada
--   oculta              → publicada | reemplazada
--   rechazada, reemplazada: finales.
-- Una versión nace publicada, retenida o con revisión pedida.
create or replace function comunidad.versiones_transicion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.estado not in ('publicada', 'retenida', 'revision_solicitada') then
      raise exception 'una versión no nace en estado %', new.estado
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.resena_id is distinct from old.resena_id
     or new.autor_participante is distinct from old.autor_participante
     or new.texto is distinct from old.texto
     or new.version_reglas is distinct from old.version_reglas
     or new.id_intento is distinct from old.id_intento
     or new.creada_en is distinct from old.creada_en then
    raise exception 'la versión % es inmutable salvo su estado', old.id
      using errcode = '23514';
  end if;

  if new.estado <> old.estado and not (
       (old.estado = 'publicada'           and new.estado in ('retenida', 'oculta', 'reemplazada'))
    or (old.estado = 'retenida'            and new.estado in ('publicada', 'rechazada', 'reemplazada'))
    or (old.estado = 'revision_solicitada' and new.estado in ('publicada', 'rechazada', 'reemplazada'))
    or (old.estado = 'oculta'              and new.estado in ('publicada', 'reemplazada'))
  ) then
    raise exception 'transición no permitida: % → % (versión %)', old.estado, new.estado, old.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists versiones_transicion on comunidad.versiones;
create trigger versiones_transicion
  before insert or update on comunidad.versiones
  for each row execute function comunidad.versiones_transicion();

-- "Toda reseña tiene vigente", "publicada sólo si es la vigente" y "la
-- vigente nunca está reemplazada".
-- Compara con otra tabla, así que es trigger de constraint DIFERIDO: se
-- comprueba al confirmar, cuando la función ya movió la vigente y los estados.
create or replace function comunidad.resena_vigencia_coherente(p_resena bigint)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_vigente bigint;
begin
  select version_vigente_id into v_vigente
    from comunidad.resenas where id = p_resena;
  if not found then
    return;  -- la reseña se borró en la misma transacción
  end if;
  if v_vigente is null then
    raise exception 'la reseña % no tiene versión vigente', p_resena
      using errcode = '23514';
  end if;
  if exists (select 1 from comunidad.versiones v
              where v.resena_id = p_resena and v.estado = 'publicada'
                and v.id is distinct from v_vigente) then
    raise exception 'la reseña % tiene una versión publicada que no es la vigente', p_resena
      using errcode = '23514';
  end if;
  if exists (select 1 from comunidad.versiones v
              where v.id = v_vigente and v.estado = 'reemplazada') then
    raise exception 'la vigente de la reseña % está reemplazada', p_resena
      using errcode = '23514';
  end if;
end;
$$;

create or replace function comunidad.versiones_vigencia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.resena_vigencia_coherente(new.resena_id);
  return null;
end;
$$;

create or replace function comunidad.resenas_vigencia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform comunidad.resena_vigencia_coherente(new.id);
  return null;
end;
$$;

drop trigger if exists versiones_vigencia on comunidad.versiones;
create constraint trigger versiones_vigencia
  after insert or update on comunidad.versiones
  deferrable initially deferred
  for each row execute function comunidad.versiones_vigencia();

drop trigger if exists resenas_vigencia on comunidad.resenas;
create constraint trigger resenas_vigencia
  after insert or update of version_vigente_id on comunidad.resenas
  deferrable initially deferred
  for each row execute function comunidad.resenas_vigencia();

-- Reseñas: el autor y el título no cambian.
create or replace function comunidad.resenas_inmutables()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.autor_participante is distinct from old.autor_participante
     or new.tipo is distinct from old.tipo
     or new.tmdb_id is distinct from old.tmdb_id
     or new.creada_en is distinct from old.creada_en then
    raise exception 'la reseña % no cambia de autor ni de título', old.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists resenas_inmutables on comunidad.resenas;
create trigger resenas_inmutables
  before update on comunidad.resenas
  for each row execute function comunidad.resenas_inmutables();

-- Tramos: el par autor/versión se verifica al insertar (la versión no tiene
-- FK, §2.2.2), y después sólo se puede CERRAR una vez.
create or replace function comunidad.tramos_integridad()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from comunidad.versiones v
                    where v.id = new.version_id
                      and v.autor_participante = new.autor_participante) then
      raise exception 'tramo: la versión % no es del autor indicado', new.version_id
        using errcode = '23503';
    end if;
    if new.vigente_hasta is not null then
      raise exception 'un tramo nace abierto' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.evaluador_participante is distinct from old.evaluador_participante
     or new.autor_participante is distinct from old.autor_participante
     or new.version_id is distinct from old.version_id
     or new.mes_primera_positiva is distinct from old.mes_primera_positiva
     or new.vigente_desde is distinct from old.vigente_desde
     or old.vigente_hasta is not null then
    raise exception 'un tramo sólo se cierra, y una sola vez (tramo %)', old.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tramos_integridad on comunidad.tramos;
create trigger tramos_integridad
  before insert or update on comunidad.tramos
  for each row execute function comunidad.tramos_integridad();

-- Suspensiones: mismo criterio que los tramos.
create or replace function comunidad.suspensiones_integridad()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.participante_id is distinct from old.participante_id
     or new.desde is distinct from old.desde
     or new.creada_en is distinct from old.creada_en
     or old.hasta is not null then
    raise exception 'una suspensión sólo se cierra, y una sola vez (suspensión %)', old.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists suspensiones_integridad on comunidad.suspensiones;
create trigger suspensiones_integridad
  before update on comunidad.suspensiones
  for each row execute function comunidad.suspensiones_integridad();

-- ==================================================================
-- Índices de apoyo para las FK (borrados en cascada y bajas).
-- ==================================================================
create index if not exists versiones_por_resena    on comunidad.versiones (resena_id);
create index if not exists evaluaciones_por_version on comunidad.evaluaciones (version_id);
create index if not exists denuncias_por_version    on comunidad.denuncias (version_id);
create index if not exists tramos_por_autor         on comunidad.tramos (autor_participante);
create index if not exists bloqueos_por_bloqueado   on comunidad.bloqueos (bloqueado_participante);

-- ==================================================================
-- Permisos. RLS sin policies y revoke explícito de TODO.
-- ==================================================================
alter table comunidad.participantes  enable row level security;
alter table comunidad.resenas        enable row level security;
alter table comunidad.versiones      enable row level security;
alter table comunidad.evaluaciones   enable row level security;
alter table comunidad.tramos         enable row level security;
alter table comunidad.suspensiones   enable row level security;
alter table comunidad.denuncias      enable row level security;
alter table comunidad.bloqueos       enable row level security;
alter table comunidad.contadores     enable row level security;
alter table comunidad.config         enable row level security;
alter table comunidad.bajas_en_curso enable row level security;

revoke all on schema comunidad from public, anon, authenticated, service_role;
revoke all on all tables    in schema comunidad from public, anon, authenticated, service_role;
revoke all on all sequences in schema comunidad from public, anon, authenticated, service_role;
revoke all on all functions in schema comunidad from public, anon, authenticated, service_role;

-- ⚠️ SIN `alter default privileges … in schema comunidad revoke`: no hace nada.
-- Un default por esquema sólo puede AGREGAR a los globales, y el EXECUTE de
-- PUBLIC sobre funciones es el default de PostgreSQL. Comprobado en la base
-- local: con esas líneas, una función creada después en `comunidad` seguía
-- ejecutable por PUBLIC (la frenaba sólo el USAGE del esquema). Por eso cada
-- entrega que cree un objeto acá repite su `revoke`, y pruebas-permisos.mjs
-- revisa TODO lo que haya en el esquema, no una lista fija.

commit;
