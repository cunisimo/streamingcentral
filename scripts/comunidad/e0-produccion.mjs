#!/usr/bin/env node
// E0 de reseñas: qué migraciones están REALMENTE en una base, por catálogo.
// No se conecta a nada ni guarda credenciales: genera una consulta de SÓLO
// LECTURA y compara su resultado con lo que crean los archivos de migración.
//
//   node scripts/comunidad/e0-produccion.mjs sql > e0.sql
//     → correr e0.sql en la base (SQL Editor, o `supabase db query --linked
//       -f e0.sql --output-format json`); es UNA transacción `read only` que
//       termina en rollback y devuelve sólo nombres de objetos y conteos.
//   node scripts/comunidad/e0-produccion.mjs comparar resultado.json
//     → por migración: objetos esperados, presentes y faltantes.
//
// Qué se espera de cada migración sale de sus archivos (tablas, columnas
// agregadas, funciones y procedimientos, triggers, políticas, índices). Lo que
// una migración posterior BORRA (drop … / revoke en 022) no se espera. Es una
// comprobación por presencia: no compara cuerpos de funciones ni grants.
import { readdirSync, readFileSync } from "node:fs";

const DIR = "supabase/migrations";
const SCHEMAS = ["public", "comunidad", "cron"];

const nombre = (s, n) => `${(s ?? "public").toLowerCase()}.${n.toLowerCase().replaceAll('"', "")}`;

/** Objetos que crea (y que borra) un archivo de migración. */
export function objetosDe(sql) {
  const t = sql.replace(/--[^\n]*/g, "").replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, " ");
  const todos = (re, f) => [...t.matchAll(re)].map(f);
  const crea = {
    tablas: todos(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?("?\w+"?)/gi, (m) => nombre(m[1], m[2])),
    funciones: todos(/create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+(?:(\w+)\.)?(\w+)\s*\(/gi, (m) => nombre(m[1], m[2])),
    triggers: todos(/create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+(\w+)[\s\S]*?\bon\s+(?:(\w+)\.)?(\w+)/gi, (m) => `${nombre(m[2], m[3])}:${m[1].toLowerCase()}`),
    politicas: todos(/create\s+policy\s+("[^"]+"|\w+)\s+on\s+(?:(\w+)\.)?(\w+)/gi, (m) => `${nombre(m[2], m[3])}:${m[1].replaceAll('"', "").toLowerCase()}`),
    indices: todos(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?(\w+)\s+on\s+(?:only\s+)?(?:(\w+)\.)?\w+/gi, (m) => nombre(m[2], m[1])),
    columnas: [...t.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:(\w+)\.)?(\w+)\s+([^;]*);/gi)]
      .flatMap((m) => [...m[3].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi)].map((c) => `${nombre(m[1], m[2])}.${c[1].toLowerCase()}`)),
  };
  const borra = {
    tablas: todos(/drop\s+table\s+(?:if\s+exists\s+)?(?:(\w+)\.)?(\w+)/gi, (m) => nombre(m[1], m[2])),
    funciones: todos(/drop\s+(?:function|procedure)\s+(?:if\s+exists\s+)?(?:(\w+)\.)?(\w+)/gi, (m) => nombre(m[1], m[2])),
    triggers: todos(/drop\s+trigger\s+(?:if\s+exists\s+)?(\w+)\s+on\s+(?:(\w+)\.)?(\w+)/gi, (m) => `${nombre(m[2], m[3])}:${m[1].toLowerCase()}`),
    politicas: todos(/drop\s+policy\s+(?:if\s+exists\s+)?("[^"]+"|\w+)\s+on\s+(?:(\w+)\.)?(\w+)/gi, (m) => `${nombre(m[2], m[3])}:${m[1].replaceAll('"', "").toLowerCase()}`),
    indices: todos(/drop\s+index\s+(?:if\s+exists\s+)?(?:(\w+)\.)?(\w+)/gi, (m) => nombre(m[1], m[2])),
    columnas: [...t.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:(\w+)\.)?(\w+)\s+([^;]*);/gi)]
      .flatMap((m) => [...m[3].matchAll(/drop\s+column\s+(?:if\s+exists\s+)?(\w+)/gi)].map((c) => `${nombre(m[1], m[2])}.${c[1].toLowerCase()}`)),
  };
  return { crea, borra };
}

const TIPOS = ["tablas", "columnas", "funciones", "triggers", "politicas", "indices"];

/** Por migración, lo que debería existir con TODAS aplicadas (sin lo que borran las posteriores). */
export function esperado(archivos) {
  const ms = archivos.map(([f, sql]) => ({ f, ...objetosDe(sql) }));
  return ms.map((m, i) => {
    const despues = ms.slice(i + 1);
    const vigente = {};
    for (const k of TIPOS) {
      // Un drop seguido de create en la MISMA migración posterior es una redefinición: sigue vigente.
      vigente[k] = [...new Set(m.crea[k])].filter((x) => !despues.some((d) => d.borra[k].includes(x) && !d.crea[k].includes(x)));
    }
    return { migracion: m.f, vigente };
  });
}

/** Consulta de sólo lectura: devuelve nombres de objetos (y conteos) de los esquemas relevantes. */
export function consulta() {
  const S = SCHEMAS.map((s) => `'${s}'`).join(", ");
  return `begin transaction read only;
select json_build_object(
  'tablas', (select coalesce(json_agg(n.nspname || '.' || c.relname), '[]') from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where c.relkind in ('r', 'p', 'v', 'm') and n.nspname in (${S})),
  'columnas', (select coalesce(json_agg(table_schema || '.' || table_name || '.' || column_name), '[]') from information_schema.columns where table_schema in (${S})),
  'funciones', (select coalesce(json_agg(distinct n.nspname || '.' || p.proname), '[]') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in (${S})),
  'triggers', (select coalesce(json_agg(n.nspname || '.' || c.relname || ':' || t.tgname), '[]') from pg_trigger t join pg_class c on c.oid = t.tgrelid
                 join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname in (${S}, 'auth')),
  'politicas', (select coalesce(json_agg(schemaname || '.' || tablename || ':' || policyname), '[]') from pg_policies where schemaname in (${S})),
  'indices', (select coalesce(json_agg(schemaname || '.' || indexname), '[]') from pg_indexes where schemaname in (${S}))
)::text as catalogo;
rollback;`;
}

/** Compara el catálogo con lo esperado: por migración, presentes y faltantes. */
export function comparar(esperados, catalogo) {
  const hay = Object.fromEntries(TIPOS.map((k) => [k, new Set(catalogo[k].map((x) => String(x).toLowerCase()))]));
  return esperados.map(({ migracion, vigente }) => {
    let total = 0, presentes = 0;
    const faltan = [];
    for (const k of TIPOS) for (const x of vigente[k]) {
      total++;
      if (hay[k].has(x)) presentes++; else faltan.push(`${k}:${x}`);
    }
    const veredicto = total === 0 ? "sin objetos comprobables" : presentes === total ? "presente" : presentes === 0 ? "AUSENTE" : "PARCIAL";
    return { migracion, total, presentes, veredicto, faltan };
  });
}

const leerMigraciones = () => readdirSync(DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f) && !f.endsWith("_down.sql")).sort()
  .map((f) => [f, readFileSync(`${DIR}/${f}`, "utf8")]);

// ---------------------------------------------------------------------------
// Permisos EFECTIVOS de la comunidad, para DESPUÉS de aplicar 011–022.
// Producción tiene los privilegios por defecto viejos de Supabase (toda
// función nueva en `public` nace con EXECUTE para anon y authenticated); la
// base local de la CLI nueva, no. Por eso la batería local de permisos no
// prueba lo mismo: esto se comprueba en la base real.
// ---------------------------------------------------------------------------
const ROLES = ["anon", "authenticated", "service_role"];

/** Lo que conceden las migraciones a las funciones public.comunidad_*: nombre → roles. */
export function grantsEsperados(archivos) {
  const g = new Map();
  for (const [, sql] of archivos) {
    const t = sql.replace(/--[^\n]*/g, "");
    for (const m of t.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(comunidad_\w+)\s*\(/gi)) if (!g.has(m[1])) g.set(m[1], new Set());
    for (const m of t.matchAll(/grant\s+execute\s+on\s+function\s+public\.(comunidad_\w+)\s*\([^)]*\)\s+to\s+([^;]+);/gi)) {
      for (const r of m[2].split(",").map((x) => x.trim())) (g.get(m[1]) ?? g.set(m[1], new Set()).get(m[1])).add(r);
    }
    for (const m of t.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.(comunidad_\w+)/gi)) {
      if (!new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${m[1]}\\s*\\(`, "i").test(t.slice(m.index))) g.delete(m[1]);
    }
  }
  return g;
}

export function consultaPermisos() {
  const roles = ROLES.map((r) => `'${r}'`).join(", ");
  return `begin transaction read only;
select json_build_object(
  'funciones_public', (select coalesce(json_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
      (select json_object_agg(r, has_function_privilege(r, p.oid, 'EXECUTE')) from unnest(array[${roles}]) r)), '{}')
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'comunidad\\_%'),
  'uso_esquema', (select json_object_agg(r, has_schema_privilege(r, 'comunidad', 'USAGE')) from unnest(array[${roles}]) r),
  'tablas_comunidad', (select coalesce(json_object_agg(c.relname, (select json_object_agg(r,
      has_table_privilege(r, c.oid, 'SELECT') or has_table_privilege(r, c.oid, 'INSERT') or has_table_privilege(r, c.oid, 'UPDATE')
      or has_table_privilege(r, c.oid, 'DELETE') or has_table_privilege(r, c.oid, 'TRUNCATE')) from unnest(array[${roles}]) r)), '{}')
     from pg_class c where c.relnamespace = 'comunidad'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')),
  'rls_comunidad', (select coalesce(json_object_agg(c.relname, c.relrowsecurity), '{}') from pg_class c where c.relnamespace = 'comunidad'::regnamespace and c.relkind = 'r'),
  'user_reviews', (select json_build_object(
      'politicas', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'user_reviews'),
      'rls', (select relrowsecurity from pg_class where oid = 'public.user_reviews'::regclass),
      'privilegios', (select json_object_agg(r, has_table_privilege(r, 'public.user_reviews', 'SELECT') or has_table_privilege(r, 'public.user_reviews', 'INSERT')
        or has_table_privilege(r, 'public.user_reviews', 'UPDATE') or has_table_privilege(r, 'public.user_reviews', 'DELETE')) from unnest(array['anon', 'authenticated']) r)))
)::text as permisos;
rollback;`;
}

/** Problemas de permisos frente a lo que declaran las migraciones. Vacío = como en el repo. */
export function compararPermisos(esperados, real) {
  const p = [];
  const vistos = new Set();
  for (const [firma, roles] of Object.entries(real.funciones_public)) {
    const nombreF = firma.slice(0, firma.indexOf("("));
    vistos.add(nombreF);
    const esp = esperados.get(nombreF);
    if (!esp) { p.push(`función no declarada en las migraciones: public.${firma}`); continue; }
    for (const r of ROLES) if (roles[r] !== esp.has(r)) p.push(`public.${firma}: ${r} ${roles[r] ? "PUEDE" : "no puede"} ejecutar (migraciones: ${esp.has(r) ? "sí" : "no"})`);
  }
  for (const n of esperados.keys()) if (!vistos.has(n)) p.push(`falta public.${n}`);
  for (const r of ["anon", "authenticated"]) if (real.uso_esquema[r]) p.push(`${r} tiene USAGE sobre el esquema comunidad`);
  for (const [t, roles] of Object.entries(real.tablas_comunidad)) for (const r of ROLES) if (roles[r]) p.push(`comunidad.${t}: ${r} tiene privilegios de tabla`);
  for (const [t, rls] of Object.entries(real.rls_comunidad)) if (!rls) p.push(`comunidad.${t}: sin RLS`);
  const u = real.user_reviews;
  if (u.politicas !== 0) p.push(`user_reviews conserva ${u.politicas} política(s) (022 no aplicada)`);
  for (const r of ["anon", "authenticated"]) if (u.privilegios[r]) p.push(`user_reviews: ${r} conserva privilegios (022 no aplicada)`);
  return p;
}

const filaDe = (archivo, campo) => {
  const crudo = JSON.parse(readFileSync(archivo, "utf8"));
  // Acepta la salida de `supabase db query --output-format json` o el JSON directo.
  const fila = crudo.rows?.[0]?.[campo] ?? crudo[campo] ?? crudo;
  return typeof fila === "string" ? JSON.parse(fila) : fila;
};

if (import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/").replace(/^\//, "")}` || process.argv[1]?.endsWith("e0-produccion.mjs")) {
  const [accion, archivo] = process.argv.slice(2);
  if (accion === "sql") console.log(consulta());
  else if (accion === "permisos-sql") console.log(consultaPermisos());
  else if (accion === "comparar") {
    for (const r of comparar(esperado(leerMigraciones()), filaDe(archivo, "catalogo"))) {
      console.log(`${r.migracion.padEnd(40)} ${String(r.presentes).padStart(3)}/${String(r.total).padEnd(3)} ${r.veredicto}`);
      if (r.veredicto === "PARCIAL") for (const x of r.faltan.slice(0, 12)) console.log(`    falta ${x}`);
    }
  } else if (accion === "comparar-permisos") {
    const p = compararPermisos(grantsEsperados(leerMigraciones()), filaDe(archivo, "permisos"));
    console.log(p.length ? p.map((x) => `✖ ${x}`).join("\n") : "✔ permisos efectivos iguales a los de las migraciones");
    if (p.length) process.exitCode = 1;
  } else { console.log("uso: sql | comparar resultado.json | permisos-sql | comparar-permisos resultado.json"); process.exitCode = 2; }
}
