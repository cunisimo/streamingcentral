#!/usr/bin/env node
// E5b: MEDICIONES de "Más útiles" contra `supabase start`. SÓLO LOCAL.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/medicion-utiles.mjs
//
// Qué mide (todo medido, nada estimado):
//   - GENERAR el orden congelado (`comunidad.orden_utiles`) con N = 100, 1.000
//     y 10.000 reseñas sintéticas: tiempo (5 corridas, mediana) y el plan con
//     `EXPLAIN (ANALYZE, BUFFERS)` de la sentencia que lo arma;
//   - LEER UNA PÁGINA con cursor (`comunidad_resenas(…, 'utiles', {o,p})`) al
//     principio, en el medio y al final del orden: el plan con ANALYZE y
//     BUFFERS de la consulta de la página (la que recorre las 50 posiciones),
//     sacado con `auto_explain` (log_nested_statements) sobre la FUNCIÓN REAL,
//     no sobre una copia de la consulta;
//   - la PRIMERA página (orden ya generado), que suma el contador visible
//     (§2.3: se calcula al abrir);
//   - tamaños reales de las tablas del orden: heap, índice y TOAST
//     (pg_relation_size, pg_indexes_size, reltoastrelid) y el tamaño de cada
//     fila de 100 ids (pg_column_size).
// Lector: un uid aleatorio con `role authenticated` y los claims de su JWT
// (sin cuenta ni participante: lee lo visible para cualquiera).
// Datos: SINTÉTICOS (participantes sin cuenta, reseñas publicadas, votos), por
// SQL como postgres, con ids derivados de una marca de corrida para borrarlos
// exactos al final. Se imprime todo; el informe copia los números.
import { randomBytes, randomUUID } from "node:crypto";
import { contenedor, psql, sqlOk, urlLocal } from "./local.mjs";

urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log(`base: ${contenedor()} · ${new Date().toISOString()}\n`);
if (sqlOk("select count(*) from pg_proc where proname = 'orden_utiles'") !== "1") { console.error("Falta 018"); process.exit(2); }
const RUN = `med-${Date.now()}-${randomBytes(3).toString("hex")}`;
const LECTOR = randomUUID();
const BASE_T = 9_800_000 + Math.floor(Math.random() * 1000) * 100;
const TAMANOS = [100, 1000, 10000];
const VOTANTES = 300, MAX_VOTOS = 12;
const titulos = [];

const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

function sinteticas(tmdbId, n, desde) {
  sqlOk(`begin;
    insert into comunidad.participantes (id) select md5('${RUN}-a-' || g)::uuid from generate_series(${desde + 1}, ${desde + n}) g on conflict do nothing;
    insert into comunidad.participantes (id) select md5('${RUN}-v-' || g)::uuid from generate_series(1, ${VOTANTES}) g on conflict do nothing;
    insert into comunidad.resenas (autor_participante, tipo, tmdb_id, primera_publicacion_en)
      select md5('${RUN}-a-' || g)::uuid, 'movie', ${tmdbId}, clock_timestamp() - (g || ' seconds')::interval from generate_series(${desde + 1}, ${desde + n}) g;
    insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento)
      select r.id, r.autor_participante,
             'Reseña sintética número ' || r.id || ' para medir el orden por utilidad de la comunidad; no es contenido real ni de nadie.',
             'publicada', 'sintetica-e5b', gen_random_uuid()
        from comunidad.resenas r where r.tipo = 'movie' and r.tmdb_id = ${tmdbId} and r.version_vigente_id is null;
    update comunidad.resenas r set version_vigente_id = v.id
      from comunidad.versiones v where v.resena_id = r.id and r.tipo = 'movie' and r.tmdb_id = ${tmdbId} and r.version_vigente_id is null;
    insert into comunidad.evaluaciones (version_id, autor_participante, evaluador_participante, util)
      select v.id, v.autor_participante, md5('${RUN}-v-' || j)::uuid, (abs(hashtext(v.id || ':' || j)) % 3) > 0
        from comunidad.resenas r join comunidad.versiones v on v.id = r.version_vigente_id
        cross join lateral generate_series(1, abs(hashtext(v.id::text)) % ${MAX_VOTOS + 1}) j
       where r.tipo = 'movie' and r.tmdb_id = ${tmdbId};
    analyze comunidad.resenas; analyze comunidad.versiones; analyze comunidad.evaluaciones;
    commit;`);
}

// Supabase no deja cargar auto_explain con `postgres` ("access to library is
// not allowed"): las corridas con planes van como `supabase_admin`, el
// superusuario del contenedor LOCAL, y desde ahí `set local role authenticated`
// con los claims del lector, como siempre. La función medida es la misma.
const SUPER = { usuario: "supabase_admin" };
const AUTO_EXPLAIN = `load 'auto_explain';
set auto_explain.log_min_duration = 0;
set auto_explain.log_analyze = on;
set auto_explain.log_buffers = on;
set auto_explain.log_timing = on;
set auto_explain.log_nested_statements = on;
set client_min_messages = log;`;

/** Los planes que `auto_explain` dejó en stderr: [{duracion, texto, plan}]. */
function planes(stderr) {
  const bloques = stderr.split(/\n(?=LOG:\s+duration:)/).filter((b) => /^LOG:\s+duration:/.test(b.trim()));
  return bloques.map((b) => {
    const dur = Number(b.match(/duration: ([\d.]+) ms/)?.[1]);
    // El bloque entero: trae el "Query Text" y el plan (sin las líneas de contexto).
    return { duracion: dur, texto: b, plan: b.split("\n").filter((l) => !/^(CONTEXT|STATEMENT):/.test(l.trim())).join("\n") };
  });
}
/** Suma de buffers del nodo superior de un plan. */
function buffers(plan) {
  const l = plan.split("\n").find((x) => /Buffers:/.test(x)) ?? "";
  const hit = Number(l.match(/hit=(\d+)/)?.[1] ?? 0), read = Number(l.match(/read=(\d+)/)?.[1] ?? 0), dirt = Number(l.match(/dirtied=(\d+)/)?.[1] ?? 0);
  return { hit, read, dirtied: dirt, linea: l.trim() };
}
function comoLector(sql) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${LECTOR}","role":"authenticated"}', true);
${sql}
commit;`;
}

const previa = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));
/**
 * Tiempo de la llamada SIN auto_explain (que agrega su propio costo): 20
 * llamadas seguidas como el lector, medidas con clock_timestamp dentro de la
 * base; la mediana. La primera página con el orden ya generado no regenera.
 */
function sinInstrumentar(T, cursorSql) {
  const r = psql(`begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${LECTOR}","role":"authenticated"}', true);
do $$ declare t0 timestamptz; x jsonb; begin
  for i in 1..20 loop
    t0 := clock_timestamp();
    x := public.comunidad_resenas('movie', ${T}, 'utiles', ${cursorSql}, 5);
    raise notice 'MS|%', extract(epoch from clock_timestamp() - t0) * 1000;
  end loop;
end $$;
commit;`);
  const ms = [...r.stderr.matchAll(/MS\|([\d.]+)/g)].map((m) => Number(m[1]));
  if (ms.length !== 20) throw new Error(`sin tiempos: ${r.stderr.slice(0, 300)}`);
  return Math.round(mediana(ms) * 1000) / 1000;
}

const resultados = [];
const PLANES_COMPLETOS = [];
try {
  sqlOk("update comunidad.config set modulo_activo = true where id");
  let desde = 0;
  for (const n of TAMANOS) {
    const T = BASE_T + n;
    titulos.push(T);
    const t0 = Date.now();
    sinteticas(T, n, desde);
    desde += n;
    const preparar = Date.now() - t0;
    const votos = Number(sqlOk(`select count(*) from comunidad.evaluaciones e join comunidad.resenas r on r.version_vigente_id = e.version_id where r.tipo = 'movie' and r.tmdb_id = ${T}`));

    // 1) GENERAR: 5 corridas (cada una borra el orden anterior del título), tiempo dentro de la base.
    const gen = [];
    for (let i = 0; i < 5; i++) {
      sqlOk(`delete from comunidad.ordenes_utiles where tipo = 'movie' and tmdb_id = ${T}`);
      const r = psql(`do $$ declare t0 timestamptz := clock_timestamp(); o bigint; begin
          o := comunidad.orden_utiles('movie', ${T});
          raise notice 'MS|%', extract(epoch from clock_timestamp() - t0) * 1000; end $$;`);
      gen.push(Number(r.stderr.match(/MS\|([\d.]+)/)?.[1]));
    }
    // El plan de la generación (la última vez, ya con estadísticas).
    sqlOk(`delete from comunidad.ordenes_utiles where tipo = 'movie' and tmdb_id = ${T}`);
    const rGen = psql(`${AUTO_EXPLAIN}\nselect comunidad.orden_utiles('movie', ${T});`, SUPER);
    const pGen = planes(rGen.stderr).filter((p) => /insert into comunidad\.ordenes_utiles_tramos/i.test(p.texto));
    const o = Number(sqlOk(`select id from comunidad.ordenes_utiles where tipo = 'movie' and tmdb_id = ${T} order by id desc limit 1`));
    PLANES_COMPLETOS.push({ n, que: "generar (la sentencia que arma las filas de 100 ids)", plan: pGen.at(-1)?.plan ?? "(sin plan)" });

    // 2) PÁGINA con cursor: principio, medio y final; 5 corridas cada una.
    const posiciones = { principio: 0, medio: Math.floor(n / 2), final: Math.max(0, n - 5) };
    const pag = {};
    for (const [nombre, p] of Object.entries(posiciones)) {
      const tiempos = [], bufs = [];
      let planTexto = "";
      for (let i = 0; i < 5; i++) {
        const r = psql(`${AUTO_EXPLAIN}\n${comoLector(`select 'RES|' || jsonb_array_length(public.comunidad_resenas('movie', ${T}, 'utiles', '{"o":${o},"p":${p}}'::jsonb, 5)->'items');`)}`, SUPER);
        const ps = planes(r.stderr);
        const pagina = ps.find((x) => /ordenes_utiles_tramos/.test(x.texto) && /ventana/.test(x.texto));
        const funcion = ps.find((x) => /comunidad_resenas\(/.test(x.texto) && !/ventana/.test(x.texto));
        if (!pagina) throw new Error(`sin plan de página (N=${n}, ${nombre}): ${r.stderr.slice(0, 400)}`);
        tiempos.push({ consulta: pagina.duracion, llamada: funcion?.duracion ?? NaN });
        bufs.push(buffers(pagina.plan));
        planTexto = pagina.plan;
        const items = Number((r.stdout.match(/RES\|(\d+)/) ?? [])[1]);
        if (items !== 5) throw new Error(`página con ${items} reseñas (N=${n}, ${nombre})`);
      }
      pag[nombre] = {
        consulta_ms_con_auto_explain: mediana(tiempos.map((t) => t.consulta)), llamada_ms_con_auto_explain: mediana(tiempos.map((t) => t.llamada)),
        llamada_ms_sin_instrumentar: sinInstrumentar(T, `'{"o":${o},"p":${p}}'::jsonb`),
        buffers: bufs.at(-1), buffers_hit_todas: bufs.map((b) => b.hit + b.read),
      };
      if (nombre === "medio") PLANES_COMPLETOS.push({ n, que: `página con cursor (posición ${p})`, plan: planTexto });
    }

    // 3) PRIMERA página (orden ya generado, reutilizado): suma el contador visible.
    const primera = [];
    let planTotal = "";
    for (let i = 0; i < 5; i++) {
      const r = psql(`${AUTO_EXPLAIN}\n${comoLector(`select 'RES|' || (public.comunidad_resenas('movie', ${T}, 'utiles', null, 5)->>'total');`)}`, SUPER);
      const ps = planes(r.stderr);
      const funcion = ps.find((x) => /comunidad_resenas\(/.test(x.texto) && !/ventana/.test(x.texto));
      // La sentencia de la cabecera (la única con 'publicacion_activa'): trae la propia y el contador visible.
      const total = ps.find((x) => /'publicacion_activa'/.test(x.texto) && /'total'/.test(x.texto));
      primera.push({ llamada: funcion?.duracion ?? NaN, contador: total?.duracion ?? NaN, bufs: total ? buffers(total.plan) : null });
      planTotal = total?.plan ?? planTotal;
    }
    if (n === 10000) PLANES_COMPLETOS.push({ n, que: "primera página: el bloque de cabecera con el contador visible", plan: planTotal });

    // 4) TAMAÑOS de lo que ocupa ESTE orden.
    const filas = sqlOk(`select count(*) || '|' || coalesce(sum(pg_column_size(t.*)), 0) || '|' || coalesce(min(pg_column_size(t.ids)), 0) || '|' || coalesce(max(pg_column_size(t.ids)), 0)
      from comunidad.ordenes_utiles_tramos t where orden_id = ${o}`).split("|").map(Number);

    resultados.push({
      n, votos, preparar_ms: preparar,
      generar_ms_mediana: mediana(gen), generar_ms_todas: gen.map((x) => Math.round(x * 10) / 10),
      generar_plan_buffers: pGen.length ? buffers(pGen.at(-1).plan) : null,
      pagina: pag,
      primera: { llamada_ms_con_auto_explain: mediana(primera.map((x) => x.llamada)), cabecera_ms_con_auto_explain: mediana(primera.map((x) => x.contador)),
        cabecera_buffers: primera.at(-1).bufs, llamada_ms_sin_instrumentar: sinInstrumentar(T, "null") },
      orden: { filas_de_ids: filas[0], bytes_filas: filas[1], bytes_ids_min: filas[2], bytes_ids_max: filas[3] },
    });
    console.log(`N=${n}: preparado en ${preparar} ms (${votos} votos); generar ${mediana(gen).toFixed(1)} ms; página medio ${pag.medio.llamada_ms_sin_instrumentar} ms sin instrumentar`);
  }

  // Tamaños de las TABLAS con los tres órdenes (uno por N) y nada más de esta corrida.
  const tablas = sqlOk(`select c.relname || '|' || pg_relation_size(c.oid) || '|' || pg_indexes_size(c.oid) || '|'
      || coalesce(pg_relation_size(c.reltoastrelid), 0) || '|' || coalesce((select pg_indexes_size(c.reltoastrelid) where c.reltoastrelid <> 0), 0)
      || '|' || pg_total_relation_size(c.oid)
    from pg_class c where c.relnamespace = 'comunidad'::regnamespace and c.relname in ('ordenes_utiles', 'ordenes_utiles_tramos') order by c.relname`)
    .split("\n").map((l) => { const [t, heap, idx, toast, toastIdx, total] = l.split("|"); return { tabla: t, heap: +heap, indices: +idx, toast: +toast, toast_indice: +toastIdx, total: +total }; });
  // Las 5 generaciones por título dejan tuplas muertas hasta que pasa (auto)vacuum: se mide antes y después de un VACUUM.
  const muertas = () => sqlOk(`select coalesce(sum(n_dead_tup), 0) || '|' || coalesce(sum(n_live_tup), 0) from pg_stat_user_tables
    where schemaname = 'comunidad' and relname in ('ordenes_utiles', 'ordenes_utiles_tramos')`);
  const antesVacuum = muertas();
  sqlOk("vacuum comunidad.ordenes_utiles_tramos; vacuum comunidad.ordenes_utiles;");
  const tablasTrasVacuum = sqlOk(`select c.relname || '|' || pg_relation_size(c.oid) || '|' || pg_indexes_size(c.oid) || '|' || pg_total_relation_size(c.oid)
    from pg_class c where c.relnamespace = 'comunidad'::regnamespace and c.relname in ('ordenes_utiles', 'ordenes_utiles_tramos') order by c.relname`);
  const ordenesEnTabla = sqlOk("select count(*) || '|' || coalesce(sum(total), 0) from comunidad.ordenes_utiles").split("|").map(Number);
  const toastUsado = sqlOk(`select count(*) from comunidad.ordenes_utiles_tramos t where pg_column_size(t.ids) > 2000`);

  console.log("\n===== RESULTADOS (JSON) =====");
  console.log(JSON.stringify({ corrida: RUN, lector: "uid aleatorio, role authenticated", tamanos: TAMANOS, votantes: VOTANTES, resultados, tablas,
    ordenes_en_tabla: { ordenes: ordenesEnTabla[0], ids: ordenesEnTabla[1] }, filas_mayores_a_2000_bytes: Number(toastUsado),
    tuplas_muertas_y_vivas_antes_de_vacuum: antesVacuum, tablas_tras_vacuum: tablasTrasVacuum.split("\n") }, null, 2));
  console.log("\n===== PLANES (auto_explain: EXPLAIN ANALYZE, BUFFERS de la función real) =====");
  for (const p of PLANES_COMPLETOS) console.log(`\n--- N=${p.n} · ${p.que} ---\n${p.plan}`);
} finally {
  console.log("\n===== LIMPIEZA =====");
  try {
    sqlOk(`delete from comunidad.ordenes_utiles where tipo = 'movie' and tmdb_id in (${titulos.join(",") || "0"})`);
    const parts = `select md5('${RUN}-a-' || g)::uuid from generate_series(1, 11100) g union all select md5('${RUN}-v-' || g)::uuid from generate_series(1, ${VOTANTES}) g`;
    sqlOk(`begin;
      delete from comunidad.evaluaciones where evaluador_participante in (${parts}) or autor_participante in (${parts});
      delete from comunidad.resenas where autor_participante in (${parts});
      delete from comunidad.participantes where id in (${parts});
      update comunidad.config set modulo_activo = ${previa.modulo_activo} where id;
      commit;`);
    console.log("restos (participantes|reseñas|órdenes|interruptores):", sqlOk(`select (select count(*) from comunidad.participantes where id in (${parts})) || '|' ||
      (select count(*) from comunidad.resenas where tipo = 'movie' and tmdb_id in (${titulos.join(",") || "0"})) || '|' ||
      (select count(*) from comunidad.ordenes_utiles where tipo = 'movie' and tmdb_id in (${titulos.join(",") || "0"})) || '|' ||
      (select (modulo_activo or publicacion_activa or top_yumpers_activo or muestreo_activo)::text from comunidad.config)`));
  } catch (e) {
    console.error("⚠️ la limpieza falló:", e.message);
    process.exitCode = 1;
  }
}
