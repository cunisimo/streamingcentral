// E8: retención y purga. Barridos de fuente de 021, su rollback y el archivo
// de programación; el comportamiento real (cada categoría antes, en y
// después de su plazo, protecciones, lotes, interrupciones, concurrencia y
// permisos) lo prueba scripts/comunidad/pruebas-purga.mjs contra Supabase
// local, y up-down-up-021.mjs la migración.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const leer = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const sinComentarios = (s: string) => s.replace(/^\s*--.*$/gm, "").replace(/\s--\s.*$/gm, "");
const sql = () => leer("supabase/migrations/021_comunidad_purga.sql");
const bajada = () => leer("supabase/migrations/021_comunidad_purga_down.sql");
const cron = () => leer("supabase/cron-comunidad.sql");
const funcion = (s: string, nombre: string) => {
  const i = s.indexOf(`create or replace function ${nombre}(`);
  assert.ok(i >= 0, nombre);
  return s.slice(i, s.indexOf("\n$$;", i));
};
const tabla = (s: string, nombre: string) => {
  const i = s.indexOf(`create table if not exists ${nombre} (`);
  return s.slice(i, s.indexOf("\n);", i));
};

test("barrido 021: interruptor propio APAGADO; plazos del dueño cargados; huellas sin configurar; la excepción de la baja identificada y bloqueada", () => {
  const t = tabla(sinComentarios(sql()), "comunidad.purga_config");
  assert.match(t, /purga_activa\s+boolean not null default false,/);
  const plazos: Record<string, string> = {
    plazo_intentos: "7 days", plazo_reemplazadas: "30 days", plazo_retiradas: "30 days", plazo_borradas: "30 days",
    plazo_denuncias_cerradas: "30 days", plazo_decisiones: "12 months", plazo_rankings: "12 months", margen_historial_puntos: "30 days",
  };
  for (const [c, v] of Object.entries(plazos)) assert.match(t, new RegExp(`${c}\\s+interval default interval '${v}',`), c);
  assert.match(t, /plazo_huellas\s+interval,/, "huellas: sin valor (no definido)");
  assert.match(t, /conservar_texto_denunciado_baja boolean not null default false,/);
  assert.match(t, /check \(not conservar_texto_denunciado_baja\)/);
  // Nada de la configuración de la comunidad (módulo, publicación, Top, muestreo) se toca.
  assert.doesNotMatch(sinComentarios(sql()), /update comunidad\.config|alter table comunidad\.config/);
});

test("barrido 021: retenidos, denuncias abiertas y rechazadas no tienen plazo (no hay columna) y nada los borra por antigüedad", () => {
  const t = tabla(sinComentarios(sql()), "comunidad.purga_config");
  assert.doesNotMatch(t, /retenid|revision|rechazad|abierta/);
  const lote = sinComentarios(funcion(sql(), "comunidad.purga_lote"));
  // Denuncias: sólo cerradas.
  assert.match(lote, /where d\.estado <> 'abierta'/);
  // Reseñas: el predicado lista los estados que SÍ se borran.
  const r = sinComentarios(funcion(sql(), "comunidad.resena_purgable"));
  assert.match(r, /v\.estado not in \('oculta', 'reemplazada'\)/);
  assert.match(r, /v\.estado not in \('publicada', 'oculta', 'reemplazada'\)/);
  assert.match(r, /comunidad\.version_protegida\(v\.id, p_ahora\)/);
  assert.match(lote, /v\.estado = 'reemplazada'/);
});

test("barrido 021: el procedimiento confirma cada lote, no tiene SET, no avanza el reloj, y registra sólo cantidades y SQLSTATE", () => {
  const s = sql();
  const i = s.indexOf("create or replace procedure comunidad.purgar(");
  const p = sinComentarios(s.slice(i, s.indexOf("\n$$;", i)));
  assert.match(p, /^create or replace procedure comunidad\.purgar\(p_alcance text, p_ahora timestamptz default null\)\nlanguage plpgsql\nas \$\$/);
  assert.match(p, /if v_ahora > pg_catalog\.clock_timestamp\(\) then\s+raise exception 'ahora_futuro'/);
  assert.match(p, /if v_activa is not true then return; end if;/);
  assert.match(p, /pg_catalog\.pg_try_advisory_lock\(7320, 0\)/);
  assert.match(p, /commit;\s+exit when v_err is not null/, "commit por lote");
  assert.match(p, /v_err := sqlstate;/);
  assert.doesNotMatch(p, /sqlerrm|message_text|pg_exception_detail/i, "sin mensajes en el registro");
  const reg = tabla(sinComentarios(s), "comunidad.purga_ejecuciones");
  assert.doesNotMatch(reg, /texto|nombre|correo|email|token|participante|user_id/);
  assert.match(p, /'borrados', v_borrados, 'omitidos', v_omitidos, 'lotes', v_lotes, 'error', v_err/);
});

test("barrido 021: la purga no espera locks de filas (nowait / skip locked); los únicos que espera son K_CORTE compartido y nada más", () => {
  const lote = sinComentarios(funcion(sql(), "comunidad.purga_lote"));
  const tomar = sinComentarios(funcion(sql(), "comunidad.purga_tomar"));
  for (const l of tomar.split("\n").filter((x) => /for update/.test(x))) assert.match(l, /for update nowait;/, l);
  for (const l of lote.split("\n").filter((x) => /for update/.test(x))) assert.match(l, /for update skip locked\)/, l);
  assert.match(lote, /exception when lock_not_available then/);
  assert.match(lote, /pg_try_advisory_xact_lock\(7311, hashtext\(v_titulo\.tipo \|\| ':' \|\| v_titulo\.tmdb_id\)\)/, "el lock del generador de 018, en modo try");
  // Una variable plpgsql llamada como un alias (`t`) se come las referencias `t.x` de las consultas
  // (pasó: tramos, rankings y participantes fallaban con «record "t" is not assigned yet»).
  const decl = lote.slice(lote.indexOf("declare"), lote.indexOf("begin"));
  for (const alias of ["t", "x", "r", "m", "p", "s", "d", "v", "o", "i", "h", "y", "z", "e", "k", "a", "b", "g"]) {
    assert.doesNotMatch(decl, new RegExp(`^\\s+${alias}\\s`, "m"), `variable con nombre de alias: ${alias}`);
  }
  assert.deepEqual(lote.match(/pg_advisory_xact_lock\w*\([^)]*\)/g), ["pg_advisory_xact_lock_shared(7301, 0)"]);
  assert.match(lote, /set lock_timeout = '5s'/);
});

test("barrido 021: tramos conservan UN tramo por par mientras la versión pueda volver a votarse o restaurarse; sólo de meses liberados", () => {
  const lote = sinComentarios(funcion(sql(), "comunidad.purga_lote"));
  const tramos = lote.slice(lote.indexOf("p_categoria = 'tramos'"), lote.indexOf("p_categoria = 'suspensiones'"));
  assert.match(tramos, /t\.vigente_hasta is not null/, "nunca un tramo abierto");
  assert.match(tramos, /comunidad\.historial_libre\(t\.mes_primera_positiva, p_ahora\)/);
  assert.match(tramos, /t\.id = \(select max\(z\.id\) from comunidad\.tramos z/);
  assert.match(tramos, /comunidad\.par_con_memoria\(t\.evaluador_participante, t\.version_id\)/);
  const memoria = sinComentarios(funcion(sql(), "comunidad.par_con_memoria"));
  assert.match(memoria, /v\.estado in \('publicada', 'retenida', 'revision_solicitada', 'oculta'\)/);
  assert.match(memoria, /r\.borrada_en is null/);
  assert.match(memoria, /p\.user_id is not null/);
  const libre = sinComentarios(funcion(sql(), "comunidad.historial_libre"));
  assert.match(libre, /comunidad\.vencido\(m\.consolidado_en,/);
  assert.match(libre, /or not comunidad\.mes_conservado\(p_mes, p_ahora\)/);
  const susp = lote.slice(lote.indexOf("p_categoria = 'suspensiones'"), lote.indexOf("p_categoria = 'participantes'"));
  assert.match(susp, /s\.hasta is not null and s\.hasta <= p_ahora/);
  assert.match(susp, /comunidad\.corte_de_mes\(g\.m::date\) > s\.desde\s+and comunidad\.corte_de_mes\(g\.m::date\) <= s\.hasta\s+and not comunidad\.historial_libre/);
});

test("barrido 021: el Top Yumpers no lee ni reconstruye un mes fuera de la conservación (lectura y consolidación, antes y después del exclusivo)", () => {
  const leerTop = sinComentarios(funcion(sql(), "public.comunidad_top_yumpers"));
  assert.match(leerTop, /if not comunidad\.mes_conservado\(v_mes, clock_timestamp\(\)\) then\s+raise exception 'mes_invalido' using errcode = '22023'/);
  assert.ok(leerTop.indexOf("mes_conservado") < leerTop.indexOf("perform comunidad.consolidar_mes(v_mes);"));
  const c = sinComentarios(funcion(sql(), "comunidad.consolidar_mes"));
  const exclusivo = c.indexOf("perform comunidad.proto_corte_exclusivo();");
  const primera = c.indexOf("comunidad.mes_conservado(v_mes, clock_timestamp())");
  const segunda = c.indexOf("comunidad.mes_conservado(v_mes, clock_timestamp())", primera + 1);
  assert.ok(primera > 0 && primera < exclusivo && exclusivo < segunda && segunda < c.indexOf("insert into comunidad.top_resultados"));
  assert.doesNotMatch(c, /for update|pg_advisory|repeatable read|serializable/i, "la consolidación sigue sin otro lock");
  const conservado = sinComentarios(funcion(sql(), "comunidad.mes_conservado"));
  assert.match(conservado, /comunidad\.vencido\(comunidad\.corte_de_mes\(p_mes\),\s+\(select c\.plazo_rankings from comunidad\.purga_config c\), p_ahora\)/);
  // La ruta ya traduce 22023 a 400 (E7): no hace falta tocarla.
  assert.match(leer("lib/comunidad/top-yumpers.ts"), /if \(e\.code === "22023"\) return \{ resultado: "invalido" \};/);
});

test("barrido 021: permisos cerrados (nada nuevo ejecutable por la API) y sin cron ni solo_local", () => {
  const s = sinComentarios(sql());
  const nuevos = [...s.matchAll(/create or replace (?:function|procedure) (comunidad\.\w+)\(/g)].map((m) => m[1]);
  assert.ok(nuevos.length >= 10);
  for (const f of nuevos) assert.match(s, new RegExp(`revoke all on (?:function|procedure) ${f.replace(".", "\\.")}\\(`), f);
  const grants = [...s.matchAll(/grant [^;]+;/g)].map((m) => m[0]);
  assert.deepEqual(grants, ["grant execute on function public.comunidad_top_yumpers(date) to authenticated;"], "sólo el grant que ya tenía la lectura (020)");
  assert.match(s, /revoke all on comunidad\.purga_config, comunidad\.purga_ejecuciones from public, anon, authenticated, service_role;/);
  assert.match(s, /alter table comunidad\.purga_config\s+enable row level security;/);
  assert.match(s, /alter table comunidad\.purga_ejecuciones enable row level security;/);
  assert.doesNotMatch(s, /cron\.|pg_cron|net\.http|solo_local/);
});

test("barrido 021_down: restaura consolidar_mes y la lectura EXACTAMENTE como en 020, borra sólo lo de 021 y avisa que lo purgado no vuelve", () => {
  const d = bajada();
  const v020 = leer("supabase/migrations/020_comunidad_top.sql");
  for (const f of ["comunidad.consolidar_mes", "public.comunidad_top_yumpers"]) assert.equal(funcion(d, f), funcion(v020, f), f);
  assert.match(d, /LO PURGADO NO VUELVE/);
  const sc = sinComentarios(d);
  assert.doesNotMatch(sc, /drop table if exists comunidad\.(?!purga_)/, "no borra tablas de otras entregas");
  assert.doesNotMatch(sc, /\b(delete|truncate|update)\b/i);
});

test("cron-comunidad.sql: unschedule idempotente; cada hora las órdenes, una vez al día el resto; SQL puro en Supabase; no enciende nada ni toca otros jobs", () => {
  const c = sinComentarios(cron());
  assert.match(c, /select cron\.unschedule\('comunidad-purga-hora'\)\s+where exists \(select 1 from cron\.job where jobname = 'comunidad-purga-hora'\);/);
  assert.match(c, /select cron\.unschedule\('comunidad-purga-dia'\)\s+where exists \(select 1 from cron\.job where jobname = 'comunidad-purga-dia'\);/);
  assert.match(c, /select cron\.schedule\('comunidad-purga-hora', '17 \* \* \* \*', \$\$ call comunidad\.purgar\('hora'\); \$\$\);/);
  assert.match(c, /select cron\.schedule\('comunidad-purga-dia', '40 6 \* \* \*', \$\$ call comunidad\.purgar\('dia'\); \$\$\);/);
  assert.equal([...c.matchAll(/cron\.(?:un)?schedule\('([^']+)'/g)].filter((m) => !m[1].startsWith("comunidad-purga-")).length, 0, "no toca sala-barrido, tmdb-sync ni otros");
  assert.doesNotMatch(c, /net\.http|vercel|https?:\/\/|purga_activa\s*=\s*true|update /i, "sin Vercel ni servicios; no enciende la purga");
  assert.match(cron(), /NO EJECUTAR SIN\s+-- AUTORIZACIÓN/);
  // No se aplica solo: no es una migración ni está en la lista local.
  assert.ok(!readdirSync(new URL("../../supabase/migrations/", import.meta.url)).some((f) => /cron/.test(f)));
  assert.doesNotMatch(leer("scripts/sala/db-local.mjs"), /cron-comunidad/);
});
