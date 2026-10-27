// E7: Top Yumpers. Pruebas de lógica, adaptadores y barridos de fuente; el
// cómputo, la consolidación, los permisos efectivos y la concurrencia los
// prueban scripts/comunidad/pruebas-top.mjs y pruebas-top-concurrencia.mjs
// contra Supabase local.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { etiquetaMes, nombreFila, textoPuntos, topValido } from "./top-yumpers-nucleo.ts";
import { pedidoTop } from "./top-yumpers.ts";

const leer = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const funcion = (s: string, nombre: string) => {
  const i = s.indexOf(`create or replace function ${nombre}(`);
  return s.slice(i, s.indexOf("\n$$;", i));
};

// ------------------------------------------------------------ núcleo del cliente

test("respuesta: eliminada y bloqueado no toman id, nombre ni avatar aunque vengan; activo exige id uuid y avatar con forma de catálogo", () => {
  const t = topValido({
    activo: true, mes: "2026-09", autores: 4, mia: { posicion: 2, puntos: 3 },
    items: [
      { posicion: 1, puntos: 5, estado: "activo", id: P1, nombre: "Ana", avatar: "coco", propio: false },
      { posicion: 2, puntos: 3, estado: "eliminada", id: P1, nombre: "Filtrado", avatar: "coco" },
      { posicion: 2, puntos: 3, estado: "bloqueado", id: P1, nombre: "Filtrado" },
      { posicion: 3, puntos: 1, estado: "activo", id: P1, nombre: null, avatar: "../x.png", propio: true },
    ],
  })!;
  assert.deepEqual(t.filas.map((f) => [f.estado, f.id, f.nombre, f.avatar]), [
    ["activo", P1, "Ana", "coco"], ["eliminada", null, null, null], ["bloqueado", null, null, null], ["activo", P1, null, null],
  ]);
  assert.deepEqual(t.filas.map(nombreFila), ["Ana", "Cuenta eliminada", "Usuario bloqueado", "Yumper sin nombre"]);
  assert.deepEqual(t.mia, { posicion: 2, puntos: 3 });
  assert.equal(t.filas[3].propio, true);
  for (const malo of [
    { activo: false }, { activo: true, mes: "2026-9", items: [] }, { activo: true, mes: "2026-09" },
    { activo: true, mes: "2026-09", items: [{ posicion: 0, puntos: 1, estado: "eliminada" }] },
    { activo: true, mes: "2026-09", items: [{ posicion: 1, puntos: 1, estado: "activo", id: "x" }] },
    { activo: true, mes: "2026-09", items: [{ posicion: 1, puntos: 1, estado: "otro" }] },
  ]) assert.equal(topValido(malo), null, JSON.stringify(malo));
});

test("textos: mes en español rioplatense, puntos en singular y plural", () => {
  assert.equal(etiquetaMes("2026-09"), "septiembre de 2026");
  assert.equal(etiquetaMes("2026-01"), "enero de 2026");
  assert.deepEqual([textoPuntos(1), textoPuntos(3)], ["1 punto", "3 puntos"]);
});

test("pedido: sin mes, el último cerrado (lo decide la base); con mes, YYYY-MM válido", () => {
  assert.deepEqual(pedidoTop(new URLSearchParams("")), { mes: null });
  assert.deepEqual(pedidoTop(new URLSearchParams("mes=2026-09")), { mes: "2026-09-01" });
  for (const m of ["2026-13", "2026-9", "x", "2026-09-01"]) assert.ok("invalido" in pedidoTop(new URLSearchParams(`mes=${m}`)), m);
});

// ------------------------------------------------------------ barridos de 020

const sql = () => leer("supabase/migrations/020_comunidad_top.sql");

test("barrido 020: el cómputo es el de §2.2.2 (mes de la primera positiva, tramo y suspensiones con la MISMA condición al corte, pares distintos)", () => {
  const f = funcion(sql(), "comunidad.puntos_al_corte");
  assert.match(f, /select distinct t\.evaluador_participante as evaluador, t\.autor_participante as autor/);
  assert.match(f, /t\.mes_primera_positiva = date_trunc\('month', p_mes\)::date/);
  assert.match(f, /comunidad\.rige_antes_de\(t\.vigente_desde, t\.vigente_hasta, p_corte\)/);
  assert.match(f, /s\.participante_id in \(t\.evaluador_participante, t\.autor_participante\)\s+and comunidad\.rige_antes_de\(s\.desde, s\.hasta, p_corte\)/);
  assert.match(f, /count\(\*\)::integer from pares p group by p\.autor/);
  assert.doesNotMatch(sinComentarios(f), /evaluaciones|util\b/, "no mira votos: sólo tramos (los negativos no restan)");
});

test("barrido 020: consolidar_mes = comprobación rápida SIN lock → exclusivo real → nueva comprobación → UNA sentencia; huérfanos sin id", () => {
  const f = sinComentarios(funcion(sql(), "comunidad.consolidar_mes"));
  const rapida = f.indexOf("if exists (select 1 from comunidad.top_meses where mes = v_mes) then return false; end if;");
  const exclusivo = f.indexOf("perform comunidad.proto_corte_exclusivo();");
  const segunda = f.indexOf("if exists (select 1 from comunidad.top_meses where mes = v_mes) then return false; end if;", rapida + 1);
  const insercion = f.indexOf("insert into comunidad.top_resultados");
  assert.ok(rapida > 0 && rapida < exclusivo && exclusivo < segunda && segunda < insercion, "orden del protocolo");
  assert.match(f, /comunidad\.corte_de_mes\(v_mes\)/);
  assert.match(f, /clock_timestamp\(\) < v_corte then\s+raise exception 'mes_abierto'/);
  assert.match(f, /with puntos as \([\s\S]*\), mes as \([\s\S]*insert into comunidad\.top_meses[\s\S]*\)\s+insert into comunidad\.top_resultados/,
    "mes y resultados en UNA sentencia");
  assert.match(f, /dense_rank\(\) over \(order by p\.puntos desc\)/);
  assert.match(f, /case when pa\.user_id is null then null else pa\.id end/);
  assert.doesNotMatch(f, /for update|pg_advisory|repeatable read|serializable/i, "ningún otro lock ni otro aislamiento");
  // Bloqueo implícito: sin FK de top_resultados a participantes (el INSERT tomaría KEY SHARE sobre cada autor).
  const tabla = sinComentarios(sql().slice(sql().indexOf("create table if not exists comunidad.top_resultados"), sql().indexOf("create unique index if not exists top_resultados_uno_por_autor")));
  assert.match(tabla, /participante_id\s+uuid\s*\n\);/);
  assert.doesNotMatch(tabla, /references comunidad\.participantes/);
});

test("barrido 020: la lectura exige sesión (auth.uid), consolida antes de leer y proyecta sin user_id, correo ni semilla; permisos explícitos", () => {
  const s = sql();
  const f = funcion(s, "public.comunidad_top_yumpers");
  assert.match(f, /v_uid uuid := auth\.uid\(\);/);
  assert.doesNotMatch(f.split("\n")[0], /p_uid/);
  assert.match(f, /perform comunidad\.consolidar_mes\(v_mes\);/);
  assert.match(f, /when x\.eliminada then jsonb_build_object\('posicion', x\.posicion, 'puntos', x\.puntos, 'estado', 'eliminada'\)/);
  assert.match(f, /when x\.bloqueado then jsonb_build_object\('posicion', x\.posicion, 'puntos', x\.puntos, 'estado', 'bloqueado'\)/);
  const salida = f.slice(f.indexOf("jsonb_agg("));
  for (const p of ["email", "display_name", "'user_id'", "avatar_seed'"]) assert.ok(!salida.includes(p), p);
  assert.match(f, /'avatar', comunidad\.avatar_publico\(x\.seed\)/);
  assert.match(s, /grant execute on function public\.comunidad_top_yumpers\(date\) to authenticated;/);
  assert.match(s, /grant execute on function public\.comunidad_top_yumpers_activo\(\) to service_role;/);
  assert.doesNotMatch(s, /grant execute on function (comunidad\.|public\.comunidad_top_yumpers\(date\) to (anon|service_role))/);
  assert.match(s, /revoke all on comunidad\.top_meses, comunidad\.top_resultados from public, anon, authenticated, service_role;/);
  assert.doesNotMatch(s, /cron\.schedule|pg_cron/, "sin jobs (E8)");
  assert.doesNotMatch(sinComentarios(s), /solo_local/);
});

test("barrido 020: el down no toca tramos, votos, suspensiones ni participantes", () => {
  const d = sinComentarios(leer("supabase/migrations/020_comunidad_top_down.sql"));
  assert.doesNotMatch(d, /tramos\b(?!_por_mes)|evaluaciones|suspensiones|participantes/);
  assert.match(d, /drop table if exists comunidad\.top_resultados;/);
});

// ------------------------------------------------------------ separación del Top manual

test("el Top Yumpers no comparte fuente, caché ni sessionStorage con el Top de plataformas", () => {
  const vista = sinComentarios(leer("components/comunidad/TopYumpers.tsx"));
  for (const p of [/sessionStorage/, /guardarVista|decidirRestauracionVista|consumirVuelta/, /useApi\b/, /\/api\/top\b/, /lib\/top["']/]) {
    assert.doesNotMatch(vista, p, String(p));
  }
  assert.match(vista, /pedirComo\(uid, "\/api\/comunidad\/top-yumpers"\)/);
  assert.match(vista, /<TopConSesion key=\{user\.id\} uid=\{user\.id\} \/>/);
  assert.match(vista, /crearFrontera\(uid\)/);
  for (const f of ["lib/top.ts", "lib/top-composer.ts", "app/api/top/route.ts"]) {
    assert.doesNotMatch(leer(f), /comunidad|top-yumpers|top_yumpers/, `${f} no sabe nada del Top Yumpers`);
  }
  const ruta = leer("app/api/comunidad/top-yumpers/route.ts");
  assert.match(ruta, /"Cache-Control": "private, no-store"/);
  assert.doesNotMatch(ruta, /cached|redis|cache\.ts/i);
});

test("el selector: Top semanal plataformas (público, con su toggle Películas/Series) y Top Yumpers (sin toggle); aparece sólo con el interruptor", () => {
  const v = sinComentarios(leer("components/TopView.tsx"));
  assert.match(v, /\{ id: "plataformas", titulo: "Top semanal plataformas" \}/);
  assert.match(v, /\{ id: "yumpers", titulo: "Top Yumpers" \}/);
  const yumpers = v.slice(v.indexOf('if (hayYumpers && seccion === "yumpers")'), v.indexOf("return <TopPlataformas selector={selector} />;"));
  assert.match(yumpers, /<TopYumpers \/>/);
  assert.doesNotMatch(yumpers, /ShelfTypeToggle|useShelfType/, "sin toggle Películas/Series en Top Yumpers");
  assert.match(v, /const selector = hayYumpers \?/);
  assert.match(v, /fetch\(apiUrl\("\/api\/comunidad\/top-yumpers"\), \{ cache: "no-store" \}\)/, "el sondeo va sin token");
  assert.doesNotMatch(v.slice(v.indexOf("export default function TopView")), /sessionStorage|guardarVista|useApi/, "la sección elegida no se persiste");
});
