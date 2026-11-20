-- «¿Sabías que…?»: curiosidades editoriales por título (película o serie).
--
-- 🔴 NO APLICAR EN PRODUCCIÓN SIN AUTORIZACIÓN DEL DUEÑO. Va ANTES del deploy
-- que incluya `/api/curiosidad` y la sección del dashboard: sin la función
-- `curiosidad_publicada` la ficha no rompe (la sección no aparece), pero el
-- panel no puede guardar nada.
--
-- Numeración: 023 y 024 los usa la rama de música (`feat/su-musica-*`), que
-- todavía no está en `main`; por eso esta es 025.
--
-- ============================================================================
-- EL MODELO: UNA FILA, DOS VERSIONES
-- ============================================================================
-- Cada fila tiene el BORRADOR (`texto`, `fuente_nombre`, `fuente_url`,
-- `spoiler`) y la versión PUBLICADA (`pub_*`). Guardar un borrador sólo toca las
-- primeras; publicar copia el borrador a las `pub_*`; retirar apaga `publicada`
-- y CONSERVA las `pub_*` y el borrador, para volver a publicar después.
--
-- Por eso "editar como borrador una curiosidad publicada no cambia lo que ven
-- los usuarios" no depende de que el panel se porte bien: la lectura pública
-- sólo mira las `pub_*`.
--
-- Una curiosidad por título en esta primera versión: `unique (tipo, tmdb_id)`.
-- La lectura pública ya devuelve un CONJUNTO (`returns table`) para que sumar
-- más de una por título sea quitar el `unique`, sin cambiar el contrato.
--
-- La futura automatización podrá crear BORRADORES (filas sin `pub_*`): nada de
-- lo de abajo lo impide, y nada la construye todavía.

create table if not exists curiosidades (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('movie', 'tv')),
  tmdb_id integer not null check (tmdb_id > 0),
  -- Identificación para el panel (búsqueda y listado). No es una copia del
  -- catálogo: la ficha pública no lo usa.
  titulo text not null check (char_length(btrim(titulo)) between 1 and 300),
  anio smallint check (anio is null or anio between 1870 and 2200),
  poster text check (poster is null or (char_length(poster) <= 300
                     and poster ~ '^https://image\.tmdb\.org/t/p/[A-Za-z0-9_]+/[A-Za-z0-9_.-]+$')),

  -- BORRADOR. Puede estar incompleto: se exige todo recién al publicar.
  texto text not null default '' check (char_length(texto) <= 700),
  fuente_nombre text not null default '' check (char_length(fuente_nombre) <= 120),
  fuente_url text not null default '' check (char_length(fuente_url) <= 500),
  spoiler boolean not null default false,

  -- PUBLICADA. Todas null hasta la primera publicación.
  pub_texto text,
  pub_fuente_nombre text,
  pub_fuente_url text,
  pub_spoiler boolean,
  publicada boolean not null default false,
  publicada_en timestamptz,

  creado_por uuid default auth.uid() references auth.users(id) on delete set null,
  actualizado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Estado derivado, para filtrar en el panel sin repetir la regla en el código.
  estado text generated always as (
    case
      when publicada and (texto, fuente_nombre, fuente_url, spoiler)
             is distinct from (pub_texto, pub_fuente_nombre, pub_fuente_url, pub_spoiler)
        then 'cambios'
      when publicada then 'publicada'
      when pub_texto is not null then 'retirada'
      else 'borrador'
    end
  ) stored,

  constraint curiosidades_titulo_unico unique (tipo, tmdb_id),

  -- 🔴 LA VALIDACIÓN DE LO PUBLICADO VIVE ACÁ, no sólo en la API: una escritura
  -- directa contra PostgREST (con un token de admin+MFA) tampoco puede dejar
  -- publicada una curiosidad sin texto, sin fuente o con una URL que no sea
  -- http/https. La URL exige host con punto y SIN credenciales (`@` no entra en
  -- la clase del host): `javascript:`, `data:`, `https://a@b` y `http://x` no pasan.
  constraint curiosidades_publicacion_valida check (
    (pub_texto is null and pub_fuente_nombre is null and pub_fuente_url is null
       and pub_spoiler is null and not publicada and publicada_en is null)
    or (
      pub_texto is not null and pub_fuente_nombre is not null
      and pub_fuente_url is not null and pub_spoiler is not null
      and char_length(btrim(pub_texto)) between 1 and 700
      and pub_texto !~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]'
      and char_length(btrim(pub_fuente_nombre)) between 1 and 120
      and pub_fuente_nombre !~ '[[:cntrl:]]'
      and char_length(pub_fuente_url) <= 500
      and pub_fuente_url ~ '^https?://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$'
      and publicada_en is not null
    )
  )
);

create index if not exists curiosidades_estado on curiosidades (estado, updated_at desc);

-- ============================================================================
-- Trigger: identidad inmutable, autoría y fechas
-- ============================================================================
-- El título (tipo + id de TMDB) no se cambia: corregirlo sería otra fila. La
-- autoría y las fechas las pone la base, no el cliente.
create or replace function curiosidades_antes_de_escribir()
returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    if new.tipo is distinct from old.tipo or new.tmdb_id is distinct from old.tmdb_id then
      raise exception 'el título de una curiosidad no se cambia' using errcode = '22023';
    end if;
    new.creado_por := old.creado_por;
    new.created_at := old.created_at;
  else
    new.creado_por := auth.uid();
    new.created_at := now();
  end if;
  new.actualizado_por := auth.uid();
  new.updated_at := now();
  -- La fecha de publicación cambia cuando cambia lo que ven los usuarios.
  if new.publicada and (
       tg_op = 'INSERT' or not old.publicada
       or (new.pub_texto, new.pub_fuente_nombre, new.pub_fuente_url, new.pub_spoiler)
          is distinct from (old.pub_texto, old.pub_fuente_nombre, old.pub_fuente_url, old.pub_spoiler)
     ) then
    new.publicada_en := now();
  elsif new.pub_texto is null then
    new.publicada_en := null;
  elsif tg_op = 'UPDATE' then
    new.publicada_en := coalesce(old.publicada_en, now());
  else
    new.publicada_en := now();
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists curiosidades_antes_de_escribir on curiosidades;
create trigger curiosidades_antes_de_escribir
  before insert or update on curiosidades
  for each row execute function curiosidades_antes_de_escribir();

-- ============================================================================
-- Permisos: el panel escribe con la sesión del admin, bajo RLS
-- ============================================================================
-- Mismo criterio que el Top (007): se parte de cero y se concede sólo lo
-- necesario. `anon` NO tiene ningún permiso sobre la tabla: la lectura pública
-- es la función de abajo, que devuelve sólo lo publicado y sólo los campos de
-- la tarjeta. Sin `delete`: retirar conserva el contenido y el panel no borra.
alter table curiosidades enable row level security;
revoke all on curiosidades from anon, authenticated;
grant select, insert, update on curiosidades to authenticated;

drop policy if exists "curiosidades las lee el admin con MFA" on curiosidades;
create policy "curiosidades las lee el admin con MFA" on curiosidades
  for select using (is_admin_mfa());

drop policy if exists "curiosidades las crea el admin con MFA" on curiosidades;
create policy "curiosidades las crea el admin con MFA" on curiosidades
  for insert with check (is_admin_mfa());

drop policy if exists "curiosidades las edita el admin con MFA" on curiosidades;
create policy "curiosidades las edita el admin con MFA" on curiosidades
  for update using (is_admin_mfa()) with check (is_admin_mfa());

-- ============================================================================
-- Lectura pública: sólo lo publicado, sólo los campos de la tarjeta
-- ============================================================================
-- `security definer` porque `anon` no puede leer la tabla. No expone borradores,
-- ids internos, autoría ni fechas: texto, fuente y la marca de spoiler.
create or replace function curiosidad_publicada(p_tipo text, p_tmdb_id integer)
returns table (texto text, fuente_nombre text, fuente_url text, spoiler boolean)
as $$
  select c.pub_texto, c.pub_fuente_nombre, c.pub_fuente_url, c.pub_spoiler
    from public.curiosidades c
   where c.tipo = p_tipo and c.tmdb_id = p_tmdb_id and c.publicada
   order by c.publicada_en desc
   limit 3;
$$ language sql stable security definer set search_path = public;

revoke all on function curiosidad_publicada(text, integer) from public;
grant execute on function curiosidad_publicada(text, integer) to anon, authenticated;
revoke all on function curiosidades_antes_de_escribir() from public, anon, authenticated;

-- Comprobación al aplicar: si alguien vuelve a conceder la tabla a `anon`, la
-- migración falla en vez de dejar los borradores legibles.
do $$
begin
  if has_table_privilege('anon', 'public.curiosidades', 'select')
     or has_table_privilege('anon', 'public.curiosidades', 'insert')
     or has_table_privilege('anon', 'public.curiosidades', 'update') then
    raise exception 'anon tiene permisos sobre curiosidades';
  end if;
  if has_table_privilege('authenticated', 'public.curiosidades', 'delete') then
    raise exception 'authenticated puede borrar curiosidades';
  end if;
  if not has_function_privilege('anon', 'public.curiosidad_publicada(text, integer)', 'execute') then
    raise exception 'anon no puede leer las curiosidades publicadas';
  end if;
end $$;
