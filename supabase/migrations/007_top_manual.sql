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
  -- `default auth.uid()` y no un campo que el código complete: los doce
  -- borradores iniciales los crea `obtenerBorradores` con un insert que no lo
  -- mandaba, así que la primera publicación de cada bloque quedaba sin autoría.
  -- Con el default lo registra la base, y lo hace también para un insert
  -- directo contra PostgREST — que es donde un campo opcional siempre se olvida.
  creado_por    uuid        references auth.users(id) on delete set null
                            default auth.uid(),
  revisado_por  uuid        references auth.users(id) on delete set null,

  -- De qué versión publicada salió este borrador. Permite reconstruir la cadena
  -- de correcciones sin tocar las filas viejas.
  copiado_de    uuid        references top_rankings(id) on delete set null,

  -- ¿Está revisado? Derivada, porque es lo ÚNICO que el dashboard necesita
  -- saber: quién revisó es un uuid y no se muestra en ninguna pantalla.
  --
  -- 🔴 EXISTE PARA PODER REVOCAR `creado_por` y `revisado_por`. RLS filtra
  -- FILAS, no columnas: sin esto, `anon` leía los uuid de autoría de cada
  -- publicación con un `select`. Con el booleano, revocar los uuid no rompe ni
  -- el dashboard ni `publicar_top`.
  revisado      boolean generated always as (revisado_por is not null) stored,

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
  -- Cambiar la FECHA DE CAPTURA también desmarca. La fecha es parte de lo que
  -- se revisó: un bloque revisado para la semana del 4 no está revisado para la
  -- del 11 sólo porque los títulos no cambiaron.
  if new.captured_at is distinct from old.captured_at then
    new.revisado_por := null;
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

-- 🔴 LA AUTORÍA LA PONE LA BASE, NO EL QUE ESCRIBE.
--
-- `grant insert on top_rankings` alcanza a TODAS las columnas: un admin que
-- hable directo con PostgREST podía mandar `creado_por` con el uuid de otra
-- persona, o firmar una revisión a nombre ajeno con un `patch`. Revocar el
-- SELECT de esas columnas no lo impide — los privilegios de lectura y escritura
-- son independientes.
--
-- Acá se sobreescriben con `auth.uid()` en vez de rechazar: rechazar obligaría
-- a que todo el mundo mande el campo exacto, y sobreescribir hace que mandar
-- otro valor simplemente no sirva de nada.
--
-- ⚠️ SÓLO SE FUERZA SI HAY SESIÓN. Con `auth.uid()` nulo —el editor SQL, un
-- script con service_role, esta misma migración— no se pisa nada, porque ahí no
-- hay identidad que suplantar y forzar dejaría todo en null.
--
-- ⚠️ Y SÓLO CUANDO `revisado_por` CAMBIA A UN VALOR. Un update que no lo toca
-- no puede reescribirlo: si no, publicar un bloque revisado por otro admin le
-- robaría la firma al que publica. Ponerlo en null (desmarcar) se permite.
create or replace function top_ranking_autoria()
returns trigger as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    if new.revisado_por is not null then
      new.revisado_por := auth.uid();
    end if;
  elsif new.revisado_por is distinct from old.revisado_por
        and new.revisado_por is not null then
    new.revisado_por := auth.uid();
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- El nombre importa: los triggers de un mismo evento corren en orden
-- alfabético, y `autoria` tiene que ir antes que `inmutable` para que la
-- comprobación de inmutabilidad vea el valor ya corregido.
drop trigger if exists top_rankings_autoria on top_rankings;
create trigger top_rankings_autoria
  before insert or update on top_rankings
  for each row execute function top_ranking_autoria();

-- 🔴 TOCAR UNA ENTRADA INVALIDA LA REVISIÓN, Y LO HACE LA BASE.
--
-- `guardarPosicion` cambiaba la entrada y desmarcaba en DOS requests. Si el
-- segundo fallaba —red, 500, token vencido entre uno y otro— el bloque quedaba
-- modificado y marcado como revisado: se podía publicar contenido que nadie
-- revisó. Y una llamada directa a PostgREST se salteaba el segundo paso entero.
--
-- Con el trigger, la marca no puede sobrevivir a un cambio de contenido por
-- ningún camino.
create or replace function top_entry_invalida_revision()
returns trigger as $$
declare r_id uuid;
begin
  -- En un DELETE, `new` no existe. Y si el DELETE viene en CASCADA porque se
  -- borró el borrador, la fila padre ya no está: el update no encuentra nada y
  -- no pasa nada, que es lo correcto.
  r_id := case when tg_op = 'DELETE' then old.ranking_id else new.ranking_id end;
  -- `estado = 'borrador'` no es decorativo: sin él, tocar las entradas de una
  -- publicación intentaría actualizarla, y el trigger de inmutabilidad
  -- rechazaría con un error confuso. En el uso normal no pasa —las entradas de
  -- lo publicado no se tocan— pero sí al limpiar con los triggers de borrado
  -- desactivados, que es lo que hace el verificador.
  update top_rankings set revisado_por = null
   where id = r_id and estado = 'borrador' and revisado_por is not null;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists top_entries_invalidan_revision on top_ranking_entries;
create trigger top_entries_invalidan_revision
  after insert or update or delete on top_ranking_entries
  for each row execute function top_entry_invalida_revision();

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
-- Cuántos factores TOTP **verificados** tiene el usuario actual.
--
-- 🔴 HACE FALTA PORQUE EL `aal` NO ALCANZA. `aal2` dice que la sesión pasó por
-- un segundo factor, no cuántos hay registrados: con UNO alcanza para llegar a
-- `aal2`. El cliente exigía dos y la API y RLS aceptaban uno, así que
-- "obligatorio" lo sostenía sólo el layout — la capa que un `curl` no ve.
--
-- `security definer` porque `auth.mfa_factors` no es legible por `authenticated`.
create or replace function factores_totp_verificados()
returns integer as $$
  select count(*)::integer
    from auth.mfa_factors
   where user_id = auth.uid()
     and factor_type = 'totp'
     and status = 'verified';
$$ language sql stable security definer set search_path = auth, public;

revoke all on function factores_totp_verificados() from public, anon;
grant execute on function factores_totp_verificados() to authenticated;

-- Admin + sesión elevada + factor de respaldo. Las tres, y las tres acá: es la
-- única capa que un pedido directo a PostgREST no puede saltear.
--
-- ⚠️ El segundo factor NO es una formalidad: si se pierde el único, la cuenta
-- queda sin poder escribir nada —ni para arreglarlo— porque esta función
-- devuelve false y no hay forma de saltearla desde la app.
create or replace function is_admin_mfa()
returns boolean as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  ) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    and factores_totp_verificados() >= 2;
$$ language sql stable security definer set search_path = public;

-- 🔴 RLS FILTRA FILAS, NO COLUMNAS. Las policies de abajo dejan que cualquiera
-- lea las publicaciones, y con eso `anon` leía también `creado_por` y
-- `revisado_por`: los uuid de quién armó y quién firmó cada ranking. No los
-- necesita nadie fuera del panel, y el panel usa la columna derivada `revisado`.
--
-- ⚠️ UN `revoke select (columna)` NO ALCANZA, y esto es lo que hacía la versión
-- anterior. Los privilegios de PostgreSQL son **aditivos**: revocar a nivel
-- columna quita el permiso de columna, pero el `grant select` de TABLA que
-- Supabase le da a `anon` y `authenticated` sigue ahí y sigue alcanzando. La
-- columna quedaba visible igual.
--
-- La forma que funciona es al revés: se saca el permiso de tabla y se conceden
-- las columnas públicas una por una.
--
-- Efecto lateral que conviene conocer: **una columna nueva nace invisible**
-- hasta que alguien la agregue a este `grant`. Es incómodo una vez y evita que
-- el próximo campo sensible se publique por olvido.
-- 🔴 SE DECLARAN LOS PERMISOS COMPLETOS, SIN DEPENDER DEL ENTORNO. Antes esto
-- revocaba el SELECT y daba por sentado que el resto venía de las default
-- privileges de Supabase. Medido: en el stack local del CLI esas tablas quedan
-- con `Dxtm` (DELETE, REFERENCES, TRIGGER, MAINTAIN) y **sin INSERT, SELECT ni
-- UPDATE** — igual que todas las demás tablas del proyecto, así que no era un
-- defecto de esta migración, pero sí una dependencia implícita del entorno.
--
-- Ahora se parte de cero y se concede sólo lo que hace falta. `truncate`,
-- `references`, `trigger` y `maintain` NO se conceden: nada de la app los usa y
-- `truncate` saltearía los triggers que protegen las publicaciones.
revoke all on top_rankings from anon, authenticated;
revoke all on top_ranking_entries from anon, authenticated;

-- `anon` es la clave con la que la app lee del lado del servidor. Sólo lectura,
-- y sólo de las columnas que el payload público usa: ni `revisado` ni
-- `copiado_de`, que son del panel.
grant select (id, plataforma, tipo, estado, captured_at, published_at)
  on top_rankings to anon;
grant select on top_ranking_entries to anon;

-- `authenticated` es el admin del panel. Lee además las dos columnas del panel,
-- y escribe. Las policies de RLS son las que deciden QUÉ filas — el grant sólo
-- habilita la operación.
grant select (id, plataforma, tipo, estado, captured_at, published_at, revisado, copiado_de)
  on top_rankings to authenticated;
grant insert, update, delete on top_rankings to authenticated;
grant select, insert, update, delete on top_ranking_entries to authenticated;

-- Y se comprueba acá mismo. Si algún día alguien vuelve a conceder la tabla
-- entera, la migración falla al aplicarse en vez de dejar la fuga andando.
do $$
declare rol text; col text; t text; priv text;
begin
  -- 1. La autoría, oculta para los dos roles.
  foreach rol in array array['anon', 'authenticated'] loop
    foreach col in array array['creado_por', 'revisado_por'] loop
      if has_column_privilege(rol, 'public.top_rankings', col, 'select') then
        raise exception '% todavía puede leer top_rankings.%', rol, col;
      end if;
    end loop;
  end loop;

  -- 2. Lo que la app necesita leer, legible. Sin esto, un revoke de más
  --    rompería la app en silencio hasta que alguien abriera /top.
  foreach col in array array['id', 'plataforma', 'tipo', 'estado',
                             'captured_at', 'published_at'] loop
    foreach rol in array array['anon', 'authenticated'] loop
      if not has_column_privilege(rol, 'public.top_rankings', col, 'select') then
        raise exception '% perdió el acceso a top_rankings.%', rol, col;
      end if;
    end loop;
  end loop;
  foreach col in array array['revisado', 'copiado_de'] loop
    if not has_column_privilege('authenticated', 'public.top_rankings', col, 'select') then
      raise exception 'el panel perdió el acceso a top_rankings.%', col;
    end if;
    if has_column_privilege('anon', 'public.top_rankings', col, 'select') then
      raise exception 'anon puede leer top_rankings.%, que es del panel', col;
    end if;
  end loop;

  -- 3. Escritura: sólo `authenticated`, y sólo las tres operaciones.
  foreach t in array array['public.top_rankings', 'public.top_ranking_entries'] loop
    foreach priv in array array['insert', 'update', 'delete'] loop
      if has_table_privilege('anon', t, priv) then
        raise exception 'anon puede % en %', priv, t;
      end if;
      if not has_table_privilege('authenticated', t, priv) then
        raise exception 'el panel no puede % en %', priv, t;
      end if;
    end loop;
    -- 4. Nada de lo que no se pidió. `truncate` es el que más importa:
    --    saltearía los triggers que protegen las publicaciones.
    foreach priv in array array['truncate', 'references', 'trigger', 'maintain'] loop
      foreach rol in array array['anon', 'authenticated'] loop
        if has_table_privilege(rol, t, priv) then
          raise exception '% tiene % sobre %, que no se concedió', rol, priv, t;
        end if;
      end loop;
    end loop;
  end loop;

  -- 5. `anon` lee las entradas (las policies filtran a lo publicado) pero no
  --    escribe: eso ya quedó cubierto arriba.
  if not has_table_privilege('anon', 'public.top_ranking_entries', 'select') then
    raise exception 'anon no puede leer las entradas publicadas';
  end if;
end $$;

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
    -- Columnas EXPLÍCITAS, no `select *`: `creado_por` y `revisado_por` están
    -- revocadas y esta función corre como el admin (`security invoker`), así
    -- que un `*` fallaría al publicar. Se usa el booleano derivado.
    -- ⚠️ ALIAS OBLIGATORIO. `plataforma` y `tipo` son parámetros de SALIDA de
    -- esta función, así que sin calificar quedan ambiguos contra las columnas
    -- de la tabla y Postgres rechaza la consulta en tiempo de ejecución. El
    -- `select *` original no lo sufría; apareció al pasar a columnas
    -- explícitas, y sólo se ve corriendo la función.
    select t.id, t.plataforma, t.tipo, t.estado, t.revisado
      into r
      from top_rankings t where t.id = nuevo;

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
    -- arrastre un bloque a medio cargar. `revisado` es la columna derivada: el
    -- uuid está revocado.
    if not r.revisado then
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

-- ============================================================
-- 6. Qué bloques tienen publicación (el contador del panel)
-- ============================================================
-- 🔴 EL `DISTINCT` LO HACE POSTGRES, NO JAVASCRIPT, y ésa es toda la razón de
-- que esto sea una función.
--
-- La versión anterior hacía `select plataforma, tipo where estado='publicado'`
-- y deduplicaba en el cliente: eso transfiere el HISTORIAL ENTERO, que crece una
-- fila por publicación para siempre, cada vez que el editor guarda, reordena o
-- publica. A las diez semanas son 120 filas para calcular un número que nunca
-- pasa de 12.
--
-- Acá el tope es estructural: seis plataformas por dos tipos, **12 filas como
-- máximo**, sin importar cuánto historial haya debajo.
--
-- ⚠️ ALIAS OBLIGATORIO en el `select`. `plataforma` y `tipo` son parámetros de
-- SALIDA de esta función y sin calificar quedan ambiguos contra las columnas de
-- la tabla — es exactamente el error que ya tuvo `publicar_top`, y sólo se ve
-- ejecutándola.
create or replace function bloques_publicados()
returns table (plataforma text, tipo text) as $$
begin
  -- Rechaza en vez de devolver vacío: un contador en cero y un "no tenés
  -- permiso" son cosas distintas, y el panel tiene que poder distinguirlas.
  if not is_admin_mfa() then
    raise exception 'no autorizado';
  end if;
  return query
    select distinct r.plataforma, r.tipo
      from top_rankings r
     where r.estado = 'publicado';
end;
$$ language plpgsql stable security invoker set search_path = public;

revoke all on function bloques_publicados() from public, anon;
grant execute on function bloques_publicados() to authenticated;
