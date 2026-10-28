// Frenos de los arneses destructivos (auditoría E9a, A2). SÓLO LECTURA.
//
// `up-down-up.mjs` baja 011 (borra el esquema `comunidad` con sus filas) y
// sube hasta 014; `up-down-up-020.mjs` empieza REAPLICANDO 020 (que pisaría
// las redefiniciones de 021) y después la baja (borra lo consolidado). Antes
// de la primera escritura, cada arnés lee el estado de la base con UNA
// consulta de sólo lectura (`ESTADO_SQL`) y decide acá, con funciones puras:
//   - qué objetos admite sale de los ARCHIVOS de migración, no de una lista
//     escrita a mano: cualquier tabla, columna de `config`, función o trigger
//     que no cree una migración admitida (015 sin 016, por ejemplo, o el
//     registro del recorrido) es un estado incompatible;
//   - los datos que la bajada perdería también lo son.
// Para probar una bajada de verdad, usar una base desechable aislada.
import { readdirSync, readFileSync } from "node:fs";

/** Objetos que crea un archivo de migración (tablas, funciones, triggers, columnas de config). */
export function objetosDeMigracion(sql) {
  const sinComentarios = sql.replace(/--[^\n]*/g, "");
  const todos = (re) => [...sinComentarios.matchAll(re)].map((m) => m.slice(1).join(".").toLowerCase());
  return {
    tablas: todos(/create\s+table\s+(?:if\s+not\s+exists\s+)?comunidad\.(\w+)/gi),
    funciones: todos(/create\s+(?:or\s+replace\s+)?(?:function|procedure)\s+(\w+)\.(\w+)\s*\(/gi),
    triggers: todos(/create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+(\w+)/gi),
    columnasConfig: [
      ...[...sinComentarios.matchAll(/alter\s+table\s+comunidad\.config\s([^;]*);/gi)]
        .flatMap((m) => [...m[1].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi)].map((x) => x[1].toLowerCase())),
      ...columnasCreateConfig(sinComentarios),
    ],
  };
}

function columnasCreateConfig(sql) {
  const m = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?comunidad\.config\s*\(([\s\S]*?)\n\);/i);
  if (!m) return [];
  return m[1].split("\n").map((l) => l.trim().match(/^(\w+)\s+(?!check\b|constraint\b)/i)?.[1]?.toLowerCase()).filter((c) => c && c !== "constraint");
}

const unir = (lista) => {
  const r = { tablas: new Set(), funciones: new Set(), triggers: new Set(), columnasConfig: new Set() };
  for (const o of lista) for (const k of Object.keys(r)) for (const x of o[k]) r[k].add(x);
  return r;
};

/** Objetos admitidos de las migraciones `nums` (p. ej. [11, 12, 13, 14]), leídas del repo. */
export function objetosDe(nums, leer = (ruta) => readFileSync(ruta, "utf8"), listar = listarMigraciones) {
  const archivos = listar().filter((f) => nums.includes(Number(f.slice(0, 3))) && !f.endsWith("_down.sql"));
  if (archivos.length !== nums.length) throw new Error(`faltan migraciones: ${nums.join(", ")} → ${archivos.join(", ")}`);
  return unir(archivos.map((f) => objetosDeMigracion(leer(`supabase/migrations/${f}`))));
}

function listarMigraciones() {
  return readdirSync("supabase/migrations").filter((f) => /^\d{3}_.*\.sql$/.test(f));
}

/**
 * UNA consulta de sólo lectura: si existe el esquema, sus tablas con la
 * cantidad de filas, las funciones de `comunidad` y las `public.comunidad_*`,
 * los triggers sobre tablas de `comunidad`, la fila de `config` y los
 * defaults de sus columnas. Funciona también sin el esquema.
 */
export const ESTADO_SQL = `select json_build_object(
  'esquema', exists (select 1 from pg_namespace where nspname = 'comunidad'),
  'tablas', (select coalesce(json_object_agg(c.relname,
      (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from comunidad.%I', c.relname), false, true, '')))[1]::text::bigint), '{}')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'comunidad' and c.relkind in ('r', 'p')),
  'funciones', (select coalesce(json_agg(distinct n.nspname || '.' || p.proname), '[]')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'comunidad' or (n.nspname = 'public' and p.proname like 'comunidad\\_%')),
  'triggers', (select coalesce(json_agg(distinct t.tgname), '[]')
     from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'comunidad' and not t.tgisinternal),
  'config', case when to_regclass('comunidad.config') is null then null
    else (xpath('/row/j/text()', query_to_xml('select row_to_json(c)::text as j from comunidad.config c', false, true, '')))[1]::text end,
  'defaults', (select coalesce(json_object_agg(column_name, column_default), '{}')
     from information_schema.columns where table_schema = 'comunidad' and table_name = 'config'))::text`;

/** Valor de un default simple de Postgres, o `undefined` si no es un literal. */
export function literalDefault(d) {
  if (d == null) return undefined;
  if (/^now\(\)$|^clock_timestamp\(\)$|^CURRENT_TIMESTAMP$/i.test(d)) return Symbol.for("marca-de-tiempo");
  if (d === "true" || d === "false") return d === "true";
  if (/^-?\d+$/.test(d)) return Number(d);
  const t = d.match(/^'((?:[^']|'')*)'::(?:text|character varying)$/);
  if (t) return t[1].replaceAll("''", "'");
  return undefined;
}

function ajenos(presentes, admitidos) {
  return [...presentes].filter((x) => !admitidos.has(x)).sort();
}

/** Qué impide correr un arnés: objetos no admitidos y datos que la bajada perdería. */
function motivosComunes(estado, admitidos) {
  const m = [];
  const tablas = Object.keys(estado.tablas ?? {});
  const t = ajenos(tablas, admitidos.tablas);
  if (t.length) m.push(`tablas de migraciones no admitidas: ${t.join(", ")}`);
  const f = ajenos(estado.funciones ?? [], admitidos.funciones);
  if (f.length) m.push(`funciones de migraciones no admitidas: ${f.slice(0, 8).join(", ")}${f.length > 8 ? ` (+${f.length - 8})` : ""}`);
  const g = ajenos(estado.triggers ?? [], admitidos.triggers);
  if (g.length) m.push(`triggers no admitidos sobre comunidad: ${g.join(", ")}`);
  const c = ajenos(Object.keys(estado.defaults ?? {}), admitidos.columnasConfig);
  if (c.length) m.push(`columnas de config de migraciones no admitidas: ${c.join(", ")}`);
  return m;
}

/** Filas que la bajada de 011 perdería: todas, salvo una `config` con sus valores por defecto. */
function datosDe011(estado) {
  const m = [];
  const conFilas = Object.entries(estado.tablas ?? {}).filter(([t, n]) => t !== "config" && Number(n) > 0);
  if (conFilas.length) m.push(`la bajada de 011 borraría filas: ${conFilas.map(([t, n]) => `${t} ${n}`).join(", ")}`);
  if ((estado.tablas ?? {}).config !== undefined) {
    const fila = estado.config ? JSON.parse(estado.config) : null;
    if (Number(estado.tablas.config) > 1) m.push(`config tiene ${estado.tablas.config} filas`);
    if (fila) {
      const distintas = Object.entries(estado.defaults ?? {}).filter(([col, d]) => {
        const v = literalDefault(d);
        if (v === Symbol.for("marca-de-tiempo")) return false;
        if (v === undefined) return col !== "id";
        return fila[col] !== v;
      }).map(([col]) => col);
      if (distintas.length) m.push(`config tiene valores que la bajada perdería: ${distintas.join(", ")}`);
    }
  }
  return m;
}

/**
 * up-down-up.mjs (011–014). Admite: sin esquema, o sólo objetos de 011–014
 * y vacíos. Rechaza 015 sin 016, el estado actual, filas y `config` cambiada.
 */
export function frenoUpDownUp(estado, admitidos) {
  if (!estado.esquema) return [];
  return [...motivosComunes(estado, admitidos), ...datosDe011(estado)];
}

/**
 * up-down-up-020.mjs. Admite objetos de 011–020 (con o sin 020) y nada de
 * 021 en adelante; rechaza meses consolidados (la bajada de 020 los borra).
 */
export function frenoUpDownUp020(estado, admitidos) {
  if (!estado.esquema) return ["no hay esquema comunidad: este arnés necesita 011–019 aplicadas"];
  const m = motivosComunes(estado, admitidos);
  for (const t of ["top_meses", "top_resultados"]) {
    if (Number(estado.tablas?.[t] ?? 0) > 0) m.push(`la bajada de 020 borraría ${estado.tablas[t]} fila(s) de ${t}`);
  }
  return m;
}

/**
 * Lo llama cada arnés ANTES de su primera escritura. Lee el estado con
 * `sqlOk(ESTADO_SQL)` y, si hay motivos, los imprime y termina con 2.
 */
export function exigirFreno(nombre, sqlOk, decidir, admitidos) {
  const estado = JSON.parse(sqlOk(ESTADO_SQL));
  const motivos = decidir(estado, admitidos);
  if (motivos.length) {
    console.error(`${nombre}: la base no es compatible; no corre (nada se escribió).`);
    for (const x of motivos) console.error(`  - ${x}`);
    console.error("  Para probar una bajada, usá una base desechable aislada, no la compartida.");
    process.exit(2);
  }
}
