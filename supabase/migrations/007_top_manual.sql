-- Top semanal manual: el ranking lo carga el dueño, no un algoritmo.
--
-- ============================================================================
-- QUÉ RESUELVE
-- ============================================================================
-- `/top` mezclaba dos fuentes que no son comparables: el TSV oficial de Netflix
-- (dato de consumo real, una sola plataforma) y popularidad de TMDB para las
-- otras cinco. La popularidad no es "lo más visto": es un score de TMDB sesgado
-- por idioma y por actividad en su propio sitio. Y el bloque de Netflix vencía
-- solo cuando el cron atrasaba (issue #13).
--
-- Ahora las seis plataformas se cargan a mano, se revisan bloque por bloque y se
-- publican cuando están listas.
--
-- ============================================================================
-- DOS TABLAS, Y POR QUÉ NO UNA
-- ============================================================================
-- `top_rankings` es la VERSIÓN de un bloque (plataforma + tipo); las diez
-- posiciones viven en `top_ranking_entries`. Separarlas es lo que hace que una
-- publicación anterior no se pueda pisar: publicar crea una fila nueva en
-- `top_rankings`, nunca actualiza la anterior. El historial es el conjunto de
-- filas publicadas, y se conserva entero.
--
-- 🔴 NADA SE SOBREESCRIBE AL PUBLICAR. Es el requisito que ordena todo el
-- diseño: se puede corregir una publicación vigente, y la corrección es una
-- versión NUEVA que apunta a la anterior con `copiado_de`.

-- ============================================================
-- 1. Rankings (la versión de un bloque)
-- ============================================================
create table if not exists top_rankings (
  id            uuid primary key default gen_random_uuid(),
  plataforma    text        not null check (plataforma in ('n','d','m','p','at','cr')),
  tipo          text        not null check (tipo in ('movie','tv')),
  estado        text        not null default 'borrador' check (estado in ('borrador','publicado')),

  -- La fecha que el dueño dice que corresponde al ranking, no la de escritura.
  -- Es un `date` y no un `timestamptz` a propósito: es un día, no un instante.
  captured_at   date        not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  published_at  timestamptz,

  -- Quién lo armó y quién lo revisó. `revisado_por` nulo = todavía sin revisar,
  -- y es lo que decide qué bloques entran en "Publicar revisados".
  creado_por    uuid        references auth.users(id) on delete set null,
  revisado_por  uuid        references auth.users(id) on delete set null,

  -- De qué versión publicada salió este borrador. Permite reconstruir la cadena
  -- de correcciones sin tocar las filas viejas.
  copiado_de    uuid        references top_rankings(id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Un publicado siempre tiene fecha de publicación; un borrador nunca.
  constraint top_rankings_publicado_coherente check (
    (estado = 'publicado' and published_at is not null)
    or (estado = 'borrador' and published_at is null)
  )
);

-- 🔴 UN SOLO BORRADOR ACTIVO POR BLOQUE. Índice PARCIAL: la unicidad aplica a
-- los borradores y deja pasar todas las publicaciones que haga falta, que es
-- justamente el historial. Un `unique (plataforma, tipo)` a secas habría
-- impedido publicar dos veces el mismo bloque.
create unique index if not exists top_rankings_un_borrador
  on top_rankings (plataforma, tipo) where estado = 'borrador';

-- Lectura pública: la última publicación de cada bloque. Es la consulta que
-- hace `/api/top` en cada request.
create index if not exists top_rankings_publicados
  on top_rankings (plataforma, tipo, published_at desc) where estado = 'publicado';

-- ============================================================
-- 2. Entradas (las posiciones 1..10)
-- ============================================================
create table if not exists top_ranking_entries (
  id          uuid primary key default gen_random_uuid(),
  ranking_id  uuid    not null references top_rankings(id) on delete cascade,
  posicion    smallint not null check (posicion between 1 and 10),
  tmdb_id     integer not null,
  tipo        text    not null check (tipo in ('movie','tv')),

  -- El título tal como se eligió, para poder renderizar la posición aunque TMDB
  -- no resuelva la ficha. Es el mismo criterio que ya tenía `TopSlot.rawTitle`:
  -- un top de 9 se lee como un bug.
  titulo      text    not null,

  created_at  timestamptz not null default now(),

  -- Una posición por número, y un título una sola vez por bloque.
  unique (ranking_id, posicion),
  unique (ranking_id, tipo, tmdb_id)
);

create index if not exists top_ranking_entries_por_ranking
  on top_ranking_entries (ranking_id, posicion);

-- El tipo de la entrada tiene que ser el del ranking. Es redundante por diseño:
-- `top_ranking_entries.tipo` existe para que la clave `tipo:id` se pueda leer
-- sin join, y este trigger impide que las dos copias se separen.
create or replace function top_entry_tipo_coherente()
returns trigger as $$
declare r_tipo text; r_estado text;
begin
  select tipo, estado into r_tipo, r_estado from top_rankings where id = new.ranking_id;
  if r_tipo is null then
    raise exception 'ranking inexistente';
  end if;
  if new.tipo <> r_tipo then
    raise exception 'la entrada es % y el ranking es %', new.tipo, r_tipo;
  end if;
  -- 🔴 UNA PUBLICACIÓN NO SE TOCA MÁS. Sin esto, "no se sobrescribe" dependería
  -- de que ningún código se equivoque; acá lo impide la base.
  if r_estado = 'publicado' then
    raise exception 'no se pueden modificar las entradas de un ranking publicado';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists top_entries_coherentes on top_ranking_entries;
create trigger top_entries_coherentes
  before insert or update on top_ranking_entries
  for each row execute function top_entry_tipo_coherente();

-- Lo mismo del lado del ranking: una fila publicada es inmutable salvo para
-- volverse el `copiado_de` de otra. Se permite cambiar SOLO `updated_at`, que
-- es lo que toca el propio trigger de abajo.
create or replace function top_ranking_publicado_inmutable()
returns trigger as $$
begin
  if old.estado = 'publicado' then
    -- `creado_por` y `revisado_por` entran acá porque son el RASTRO de quién
    -- firmó la publicación. Quedaban fuera, así que se podían reescribir
    -- después: una publicación inmutable con autoría editable no sirve de nada
    -- como historial.
    if new.estado is distinct from old.estado
       or new.plataforma is distinct from old.plataforma
       or new.tipo is distinct from old.tipo
       or new.captured_at is distinct from old.captured_at
       or new.published_at is distinct from old.published_at
       or new.copiado_de is distinct from old.copiado_de
       or new.creado_por is distinct from old.creado_por
       or new.revisado_por is distinct from old.revisado_por then
      raise exception 'una publicación no se modifica: creá una corrección nueva';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists top_rankings_inmutable on top_rankings;
create trigger top_rankings_inmutable
  before update on top_rankings
  for each row execute function top_ranking_publicado_inmutable();

-- 🔴 Y TAMPOCO SE BORRA. Los dos triggers de arriba cubren INSERT y UPDATE, y
-- el borrado quedaba abierto: la policy de escritura es `for all`, así que un
-- admin con MFA podía borrar una publicación entera —y con ella el historial
-- que todo este diseño existe para conservar—. "No se sobrescribe" no vale de
-- nada si se puede borrar.
--
-- Un BORRADOR sí se borra: es lo que hace `reemplazar_entradas` al limpiar las
-- diez posiciones antes de volver a escribirlas.
create or replace function top_rankings_no_borrar()
returns trigger as $$
begin
  if old.estado = 'publicado' then
    raise exception 'una publicación no se borra: el historial no se toca';
  end if;
  return old;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists top_rankings_sin_delete on top_rankings;
create trigger top_rankings_sin_delete
  before delete on top_rankings
  for each row execute function top_rankings_no_borrar();

-- Lo mismo para las entradas. Sin esto se podía vaciar una publicación posición
-- por posición sin tocar su fila: quedaba "publicada" con cero títulos.
--
-- ⚠️ El borrado en CASCADA de un borrador pasa igual: la cascada dispara este
-- trigger con el ranking padre ya evaluado, y un borrador no se rechaza.
create or replace function top_entry_no_borrar()
returns trigger as $$
declare r_estado text;
begin
  select estado into r_estado from top_rankings where id = old.ranking_id;
  -- Si el ranking ya no está, esto es la cascada de un borrador que se borró:
  -- no hay nada que proteger.
  if r_estado = 'publicado' then
    raise exception 'no se pueden borrar las entradas de un ranking publicado';
  end if;
  return old;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists top_entries_sin_delete on top_ranking_entries;
create trigger top_entries_sin_delete
  before delete on top_ranking_entries
  for each row execute function top_entry_no_borrar();

-- ============================================================
-- 3. RLS
-- ============================================================
-- Lectura: cualquiera puede leer lo PUBLICADO (es lo que sirve `/api/top` con
-- la anon key). Los borradores son del dashboard y no salen de ahí.
-- Escritura: sólo admin CON MFA. Ver `is_admin_mfa()`.
alter table top_rankings        enable row level security;
alter table top_ranking_entries enable row level security;

-- 🔴 EL SEGUNDO FACTOR SE COMPRUEBA EN LA BASE, NO SÓLO EN LA API.
-- `aal2` significa que la sesión pasó por el TOTP. Si sólo lo validara la API,
-- un token de admin robado escribiría directo contra PostgREST y la API no se
-- enteraría. Con esto, la clave anon + un JWT de admin sin MFA no alcanzan.
create or replace function is_admin_mfa()
returns boolean as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  ) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$ language sql stable security definer set search_path = public;

drop policy if exists "top_rankings publicados son publicos" on top_rankings;
create policy "top_rankings publicados son publicos" on top_rankings
  for select using (estado = 'publicado' or is_admin_mfa());

drop policy if exists "top_rankings los escribe el admin con MFA" on top_rankings;
create policy "top_rankings los escribe el admin con MFA" on top_rankings
  for all using (is_admin_mfa()) with check (is_admin_mfa());

drop policy if exists "top_entries de publicados son publicas" on top_ranking_entries;
create policy "top_entries de publicados son publicas" on top_ranking_entries
  for select using (
    is_admin_mfa()
    or exists (
      select 1 from top_rankings r
      where r.id = ranking_id and r.estado = 'publicado'
    )
  );

drop policy if exists "top_entries las escribe el admin con MFA" on top_ranking_entries;
create policy "top_entries las escribe el admin con MFA" on top_ranking_entries
  for all using (is_admin_mfa()) with check (is_admin_mfa());

-- ============================================================
-- 4. Reemplazo transaccional de las diez posiciones
-- ============================================================
-- 🔴 ESTO ERA DELETE Y DESPUÉS INSERT, EN DOS REQUESTS A PostgREST. Si el
-- segundo fallaba —red, 500, token vencido entre uno y otro— el borrador
-- quedaba VACÍO y lo cargado se perdía. Y no era un caso raro: reordenar pasa
-- por ese camino en cada flecha.
--
-- Acá es una transacción: o quedan las diez nuevas, o quedan las diez viejas.
--
-- El borrado y la escritura tienen que ir juntos por otro motivo además:
-- `unique (ranking_id, posicion)` rechaza cualquier estado intermedio con dos
-- títulos en la misma posición, que es exactamente lo que produce un reordenamiento.
create or replace function reemplazar_entradas(p_ranking uuid, p_entradas jsonb)
returns void as $$
declare r_tipo text; r_estado text;
begin
  if not is_admin_mfa() then
    raise exception 'no autorizado';
  end if;

  select tipo, estado into r_tipo, r_estado from top_rankings where id = p_ranking;
  if r_tipo is null then
    raise exception 'ranking inexistente';
  end if;
  if r_estado <> 'borrador' then
    raise exception 'sólo se editan borradores';
  end if;

  delete from top_ranking_entries where ranking_id = p_ranking;

  if jsonb_array_length(coalesce(p_entradas, '[]'::jsonb)) > 0 then
    insert into top_ranking_entries (ranking_id, posicion, tipo, tmdb_id, titulo)
    select p_ranking,
           (e ->> 'posicion')::smallint,
           coalesce(e ->> 'tipo', r_tipo),
           (e ->> 'tmdb_id')::integer,
           e ->> 'titulo'
      from jsonb_array_elements(p_entradas) e;
  end if;

  -- Cualquier cambio desmarca la revisión: la marca vale para el contenido que
  -- había cuando se puso. Va acá y no en la API para que una llamada directa a
  -- PostgREST tampoco pueda saltearlo.
  update top_rankings set revisado_por = null where id = p_ranking;
end;
$$ language plpgsql security invoker set search_path = public;

revoke all on function reemplazar_entradas(uuid, jsonb) from public, anon;
grant execute on function reemplazar_entradas(uuid, jsonb) to authenticated;

-- ============================================================
-- 5. Publicación transaccional
-- ============================================================
-- 🔴 POR QUÉ ES UNA FUNCIÓN Y NO TRES LLAMADAS DESDE LA API. Publicar es
-- validar diez posiciones y cambiar un estado; si eso se hace desde el cliente,
-- entre la validación y la escritura cabe cualquier cosa. Acá es una
-- transacción: o el bloque queda publicado con sus diez posiciones, o no cambia
-- nada.
--
-- `security invoker`, NO `definer`: el que la llama es el admin con su propia
-- sesión, y las policies de arriba ya le dan permiso. `definer` sería privilegio
-- regalado — una función que corre como su dueño y que cualquiera que
-- consiguiera invocarla usaría con permisos que no tiene. Es el mismo criterio
-- que la 006.
--
-- Devuelve qué se publicó y qué se rechazó, por bloque. La API no vuelve a
-- consultar para saberlo.
create or replace function publicar_top(p_ids uuid[])
returns table (ranking_id uuid, plataforma text, tipo text, publicado boolean, motivo text)
as $$
declare
  r               record;
  n               integer;
  nuevo           uuid;
  nuevo_borrador  uuid;
begin
  if not is_admin_mfa() then
    raise exception 'no autorizado';
  end if;

  foreach nuevo in array coalesce(p_ids, '{}'::uuid[]) loop
    select * into r from top_rankings where id = nuevo;

    if r.id is null then
      ranking_id := nuevo; plataforma := null; tipo := null;
      publicado := false; motivo := 'no existe';
      return next; continue;
    end if;

    ranking_id := r.id; plataforma := r.plataforma; tipo := r.tipo;

    if r.estado <> 'borrador' then
      publicado := false; motivo := 'no es un borrador';
      return next; continue;
    end if;

    -- Sólo entran los revisados. Es lo que hace que "Publicar revisados" no
    -- arrastre un bloque a medio cargar.
    if r.revisado_por is null then
      publicado := false; motivo := 'sin revisar';
      return next; continue;
    end if;

    select count(*) into n from top_ranking_entries where top_ranking_entries.ranking_id = r.id;
    if n <> 10 then
      publicado := false; motivo := format('tiene %s posiciones, faltan %s', n, 10 - n);
      return next; continue;
    end if;

    -- Las diez posiciones exactas, sin huecos. Los `unique` ya impiden repetir
    -- una posición o un título; esto verifica que estén las diez que van.
    select count(*) into n
    from generate_series(1, 10) g
    where not exists (
      select 1 from top_ranking_entries e
      where e.ranking_id = r.id and e.posicion = g
    );
    if n > 0 then
      publicado := false; motivo := format('faltan %s posiciones del 1 al 10', n);
      return next; continue;
    end if;

    -- Publicar es cambiar el estado de ESTA fila. La publicación anterior del
    -- mismo bloque queda intacta: es otra fila, y la lectura pública se queda
    -- con la de `published_at` más reciente.
    update top_rankings
       set estado = 'publicado', published_at = now()
     where id = r.id;

    -- 🔴 Y SE CREA EL BORRADOR SIGUIENTE, YA CARGADO.
    --
    -- Publicar convierte el borrador EN la publicación, así que el bloque se
    -- quedaba sin borrador y la próxima vez que entrabas al dashboard
    -- `obtenerBorradores` te creaba uno vacío: la semana siguiente arrancaba de
    -- cero en vez de arrancar de lo que ya estaba al aire. En un top que cambia
    -- dos o tres puestos por semana, eso es volver a cargar diez títulos para
    -- mover uno.
    --
    -- `captured_at` es HOY en hora argentina, no la fecha de la publicación:
    -- heredarla haría nacer el bloque con la fecha de la semana pasada, y habría
    -- que acordarse de corregirla siempre. Es editable desde el dashboard.
    insert into top_rankings (plataforma, tipo, estado, captured_at, creado_por, copiado_de)
    values (
      r.plataforma, r.tipo, 'borrador',
      (now() at time zone 'America/Argentina/Buenos_Aires')::date,
      auth.uid(), r.id
    )
    returning id into nuevo_borrador;

    insert into top_ranking_entries (ranking_id, posicion, tipo, tmdb_id, titulo)
    select nuevo_borrador, e.posicion, e.tipo, e.tmdb_id, e.titulo
      from top_ranking_entries e
     where e.ranking_id = r.id;

    publicado := true; motivo := null;
    return next;
  end loop;
end;
$$ language plpgsql security invoker set search_path = public;

revoke all on function publicar_top(uuid[]) from public, anon;
grant execute on function publicar_top(uuid[]) to authenticated;
