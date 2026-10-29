// E0 de reseñas: inventario por catálogo y permisos efectivos (sin base).
//   node --test scripts/comunidad/e0-produccion.test.mjs
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { comparar, compararPermisos, consulta, consultaPermisos, esperado, grantsEsperados, objetosDe } from "./e0-produccion.mjs";

const migraciones = () => readdirSync("supabase/migrations").filter((f) => /^\d{3}_.*\.sql$/.test(f) && !f.endsWith("_down.sql")).sort()
  .map((f) => [f, readFileSync(`supabase/migrations/${f}`, "utf8")]);

test("el parser ve tablas, columnas, funciones, triggers, políticas e índices, y no mira dentro de los cuerpos", () => {
  const o = objetosDe(`create table if not exists comunidad.a (id int);
alter table public.b add column if not exists c1 int, add column c2 text;
create or replace function public.f(x int) returns int language plpgsql as $$ begin create table nada(x int); return 1; end $$;
create constraint trigger t1 after insert on comunidad.a for each row execute function public.f();
create policy "Lee Todo" on public.b for select using (true);
create unique index if not exists i1 on comunidad.a (id);
drop policy if exists "vieja" on public.b;`);
  assert.deepEqual(o.crea.tablas, ["comunidad.a"]);
  assert.deepEqual(o.crea.columnas, ["public.b.c1", "public.b.c2"]);
  assert.deepEqual(o.crea.funciones, ["public.f"]);
  assert.deepEqual(o.crea.triggers, ["comunidad.a:t1"]);
  assert.deepEqual(o.crea.politicas, ["public.b:lee todo"]);
  assert.deepEqual(o.crea.indices, ["comunidad.i1"]);
  assert.deepEqual(o.borra.politicas, ["public.b:vieja"]);
});

test("lo que una migración posterior borra no se espera; una redefinición sí", () => {
  const e = esperado([
    ["001.sql", "create or replace function public.f() returns int as $$ select 1 $$ language sql; create table public.t (id int);"],
    ["002.sql", "drop function if exists public.f(); drop table if exists public.t; create table public.t (id int);"],
  ]);
  assert.deepEqual(e[0].vigente.funciones, []);
  assert.deepEqual(e[0].vigente.tablas, ["public.t"]);
  const r = comparar(e, { tablas: ["public.t"], columnas: [], funciones: [], triggers: [], politicas: [], indices: [] });
  assert.equal(r[0].veredicto, "presente");
});

test("las consultas son de sólo lectura y terminan en rollback", () => {
  for (const q of [consulta(), consultaPermisos()]) {
    assert.match(q, /^begin transaction read only;/);
    assert.match(q, /rollback;$/);
    assert.doesNotMatch(q, /\b(insert|update|delete|alter|create|drop|grant|revoke)\b\s/i);
  }
});

test("las migraciones 011–022 declaran los grants de las 35 funciones public.comunidad_* vigentes", () => {
  const g = grantsEsperados(migraciones());
  assert.equal(g.size, 35, "comunidad_leer_titulo la borra 017");
  assert.ok(!g.has("comunidad_leer_titulo"));
  assert.deepEqual([...g.get("comunidad_resenas")], ["authenticated"]);
  assert.deepEqual([...g.get("comunidad_publicar")], ["service_role"]);
});

test("la comparación de permisos detecta lo que Producción daría por defecto", () => {
  const g = new Map([["comunidad_publicar", new Set(["service_role"])], ["comunidad_resenas", new Set(["authenticated"])]]);
  const bien = {
    funciones_public: {
      "comunidad_publicar(p uuid)": { anon: false, authenticated: false, service_role: true },
      "comunidad_resenas(t text)": { anon: false, authenticated: true, service_role: false },
    },
    uso_esquema: { anon: false, authenticated: false, service_role: true },
    tablas_comunidad: { resenas: { anon: false, authenticated: false, service_role: false } },
    rls_comunidad: { resenas: true },
    user_reviews: { politicas: 0, rls: true, privilegios: { anon: false, authenticated: false } },
  };
  assert.deepEqual(compararPermisos(g, bien), []);
  const mal = structuredClone(bien);
  mal.funciones_public["comunidad_publicar(p uuid)"].anon = true;
  mal.tablas_comunidad.resenas.authenticated = true;
  mal.rls_comunidad.resenas = false;
  mal.user_reviews = { politicas: 2, rls: true, privilegios: { anon: true, authenticated: true } };
  delete mal.funciones_public["comunidad_resenas(t text)"];
  const p = compararPermisos(g, mal);
  assert.deepEqual(p, [
    "public.comunidad_publicar(p uuid): anon PUEDE ejecutar (migraciones: no)",
    "falta public.comunidad_resenas",
    "comunidad.resenas: authenticated tiene privilegios de tabla",
    "comunidad.resenas: sin RLS",
    "user_reviews conserva 2 política(s) (022 no aplicada)",
    "user_reviews: anon conserva privilegios (022 no aplicada)",
    "user_reviews: authenticated conserva privilegios (022 no aplicada)",
  ]);
});
