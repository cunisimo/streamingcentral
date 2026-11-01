// Compara etapas del plan de diversidad sobre candidatos CONGELADOS
// (fixture.json): la diferencia entre dos columnas es sólo del algoritmo, salvo
// donde se cambia a propósito la variante del cruce. Sin red.
//
//   node --import ./scripts/cargar-lib.mjs scripts/reco-harness/evaluar.mjs
//
// Corre las funciones REALES de lib/ (reco-armado, reco-seleccion, reco-mezcla);
// lo único simulado es el enriquecido, que sale de la disponibilidad capturada.
import { readFileSync, writeFileSync } from "node:fs";
import {
  OPCIONES_ANTERIORES, OPCIONES_NUEVAS, PISO, juntarCandidatos, seleccionFinal, ventanaDeEnriquecido,
  origenEsInfantil,
} from "../../lib/reco-armado.ts";
import { K_RECENCIA, LAMBDA_MMR, candidatasOrigen, elegirOrigenesMMR, esAnimacion, esInfantil, exclusionesCruce } from "../../lib/reco-seleccion.ts";
import { elegirOrigenes } from "../../lib/reco-mezcla.ts";

const FX = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url), "utf8"));
const k = (t, id) => `${t}:${id}`;

// --- Variantes (etapas del plan) ---
const V = {
  actual: { origenes: "peso", op: OPCIONES_ANTERIORES, cruce: "ant" },
  e2exacta: { origenes: "peso", op: { guardInfantil: true, selector: "mezcla" }, cruce: "exacta" },
  e2: { origenes: "peso", op: { guardInfantil: true, selector: "mezcla" }, cruce: "d2a" },
  e3: { origenes: "peso", op: OPCIONES_NUEVAS, cruce: "d2a" },
  final: { origenes: "mmr", op: OPCIONES_NUEVAS, cruce: "d2a" },
  // El algoritmo nuevo entero sobre el MISMO pool que el actual: aísla el
  // efecto del ordenamiento del cambio de consulta a TMDB.
  finalPoolActual: { origenes: "mmr", op: OPCIONES_NUEVAS, cruce: "ant" },
};

function armar(senales, plats, v, extraExcluir = []) {
  const P = plats.join(",");
  const perfilDe = (s) => FX.fuentes[k(s.tipo, s.id)].perfil;
  const origenes = v.origenes === "peso"
    ? elegirOrigenes([...senales].sort((a, b) => a.rango - b.rango), 6)
    : elegirOrigenesMMR(candidatasOrigen(senales, v.k ?? K_RECENCIA), (s) => ({ tipo: s.tipo, generos: perfilDe(s).generosPropios }), 6,
      { k: v.k ?? K_RECENCIA, lambda: v.lambda ?? LAMBDA_MMR });
  const porOrigen = origenes.map((o) => {
    const f = FX.fuentes[k(o.tipo, o.id)];
    const sin = v.cruce === "ant" ? []
      : exclusionesCruce({ tipo: o.tipo, generos: f.perfil.generosPropios }, v.cruce === "d2a");
    return { origen: { tipo: o.tipo, id: o.id, peso: o.peso }, perfil: f.perfil, mismos: f.mismos, cruzados: f.cruce[`${P}|${sin.join(".")}`] };
  });
  const excluir = [...senales.map((s) => k(s.tipo, s.id)), ...extraExcluir];
  const { vivos } = juntarCandidatos(porOrigen, excluir, senales, v.op);
  const disp = FX.disponibles[P];
  const enriquecidos = ventanaDeEnriquecido(vivos)
    .filter((c) => disp[k(c.tipo, c.raw.id)])
    .map((c) => ({
      type: c.tipo, id: c.raw.id, title: disp[k(c.tipo, c.raw.id)],
      porque: { id: c.respaldo.origenId, tipo: c.respaldo.origenTipo, titulo: c.respaldo.origenTitulo },
      camino: c.respaldo.camino, apoyos: c.apoyos, _cand: c,
    }))
    .sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.id - b.id));
  const meta = new Map(enriquecidos.map((e) => [k(e.type, e.id), e._cand]));
  const r = seleccionFinal(enriquecidos, porOrigen, v.op);
  const items = r.items.length >= PISO ? r.items : [];
  return { items, info: r.info, porOrigen, meta };
}

function metricas(res, descartes = []) {
  const { items, porOrigen, meta, info } = res;
  const g = (t) => meta.get(k(t.type, t.id))?.raw.genre_ids ?? [];
  const anim = (t) => esAnimacion(g(t));
  const inf = (t) => esInfantil(t.type, g(t));
  const porO = new Map();
  for (const t of items) { const o = `${t.porque.titulo}`; porO.set(o, (porO.get(o) ?? 0) + 1); }
  const top6 = items.slice(0, 6);
  const conInfantil = porOrigen.some(origenEsInfantil);
  return {
    n: items.length, elegibles: info.elegibles, completados: info.completados, cupos: info.cupos,
    maxOrigen: Math.max(0, ...porO.values()), maxOrigenDe: [...porO].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-",
    anim: items.filter(anim).length, inf: items.filter(inf).length,
    top6anim: top6.filter(anim).length, top6origenes: new Set(top6.map((t) => t.porque.titulo)).size,
    top6: top6.map((t) => `${anim(t) ? "🎨" : ""}${inf(t) ? "🧸" : ""}${t.title}`),
    descartados: items.filter((t) => descartes.includes(k(t.type, t.id))).length,
    infantilSinOrigen: !conInfantil && items.some(inf),
    origenes: porOrigen.map((o) => FX.fuentes[k(o.origen.tipo, o.origen.id)].perfil.titulo),
  };
}

const out = [];
const log = (s = "") => { out.push(s); console.log(s); };

// --- 1. Antes/después por perfil, con 3 descartes inyectados ---
log("## 1. Antes/después por perfil (candidatos fijos, 3 descartes inyectados por perfil)\n");
const verificacion = { descartados: 0, infantilSinOrigen: 0, corridas: 0 };
const pasada2 = [];
for (const p of FX.perfiles) {
  for (const plats of [["n", "d", "m"], ["n"]]) {
    // Descartes: los 3 primeros que el algoritmo actual mostraría sin descartes.
    const descartes = armar(p.senales, plats, V.actual).items.slice(0, 3).map((t) => k(t.type, t.id));
    log(`### ${p.id} — ${p.nombre} — ${plats.join(",")}\n`);
    log("| variante | tarjetas (elegibles) | máx. por origen | animación | infantil | primeras 6: animación / orígenes | completadas sin cupo |");
    log("|---|---|---|---|---|---|---|");
    const filas = {};
    for (const [nombre, v] of Object.entries(V)) {
      const m = metricas(armar(p.senales, plats, v, descartes), descartes);
      filas[nombre] = m;
      verificacion.corridas++;
      verificacion.descartados += m.descartados;
      if (m.infantilSinOrigen && v.op.guardInfantil) verificacion.infantilSinOrigen++;
      if (m.completados > 0) pasada2.push({ perfil: p.id, plats: plats.join(","), variante: nombre, ...m });
      log(`| ${nombre} | ${m.n} (${m.elegibles}) | ${m.maxOrigen} (${m.maxOrigenDe}) | ${m.anim} | ${m.inf} | ${m.top6anim} / ${m.top6origenes} | ${m.completados} |`);
    }
    log(`\nPrimeras 6 — actual: ${filas.actual.top6.join(" · ") || "(oculto)"}`);
    log(`Primeras 6 — final:  ${filas.final.top6.join(" · ") || "(oculto)"}`);
    log(`Orígenes — actual: ${filas.actual.origenes.join(", ")} · final: ${filas.final.origenes.join(", ")}\n`);
  }
}

log("## 2. Comprobaciones\n");
log(`- Corridas: ${verificacion.corridas}. Descartados presentes: **${verificacion.descartados}**.`);
log(`- Corridas con guard infantil y un infantil sin origen infantil: **${verificacion.infantilSinOrigen}**.\n`);

log("## 3. Casos donde la pasada 2 completó por encima de los cupos\n");
log("| perfil | plat. | variante | elegibles | completadas | cupos (origen/anim/inf) | animación final |");
log("|---|---|---|---|---|---|---|");
for (const c of pasada2) {
  const cu = c.cupos ? `${c.cupos.origen}/${c.cupos.animacion === null ? "-" : c.cupos.animacion}/${c.cupos.infantil}` : "-";
  log(`| ${c.perfil} | ${c.plats} | ${c.variante} | ${c.elegibles} | ${c.completados} | ${cu.replace(/Infinity|null/g, "∞")} | ${c.anim} |`);
}

// --- 4. D2(a): qué pierde ---
log("\n## 4. D2(a): pérdida en el cruce hacia películas de orígenes animados no infantiles\n");
for (const plats of [["n", "d", "m"], ["n"]]) {
  const P = plats.join(",");
  for (const [ko, f] of Object.entries(FX.fuentes)) {
    const tipo = ko.split(":")[0];
    const sinA = exclusionesCruce({ tipo, generos: f.perfil.generosPropios }, true).join(".");
    const sinE = exclusionesCruce({ tipo, generos: f.perfil.generosPropios }, false).join(".");
    if (sinA === sinE) continue;
    const disp = FX.disponibles[P];
    const otro = tipo === "movie" ? "tv" : "movie";
    const enA = new Set(f.cruce[`${P}|${sinA}`].map((r) => r.id));
    const exacta = f.cruce[`${P}|${sinE}`].filter((r) => disp[k(otro, r.id)]);
    const perdidas = exacta.filter((r) => !enA.has(r.id));
    const famSinAnim = perdidas.filter((r) => (r.genre_ids ?? []).includes(10751) && !(r.genre_ids ?? []).includes(16));
    const infantiles = perdidas.filter((r) => esInfantil(otro, r.genre_ids));
    const ganadasA = f.cruce[`${P}|${sinA}`].filter((r) => disp[k(otro, r.id)] && !esInfantil(otro, r.genre_ids));
    log(`- **${f.perfil.titulo}** (${P}): cruce exacto ${exacta.length} disponibles, de los cuales ${infantiles.length} infantiles (los quita el guard igual). ` +
      `Con D2(a): ${ganadasA.length} disponibles no infantiles vs ${exacta.length - infantiles.length} sin D2(a). ` +
      `Familiares SIN animación perdidas: ${famSinAnim.length}${famSinAnim.length ? " — " + famSinAnim.map((r) => disp[k(otro, r.id)]).join(", ") : ""}.`);
  }
}

// --- 5. Desplazamiento por un voto nuevo (P6 → P6b) ---
log("\n## 5. Un voto nuevo de crimen (P6 → P6b), n,d,m\n");
const P6 = FX.perfiles.find((p) => p.id === "P6"), P6b = FX.perfiles.find((p) => p.id === "P6b");
for (const nombre of ["actual", "final"]) {
  const a = armar(P6.senales, ["n", "d", "m"], V[nombre]), b = armar(P6b.senales, ["n", "d", "m"], V[nombre]);
  const oa = metricas(a).origenes, ob = metricas(b).origenes;
  const ka = new Set(a.items.map((t) => k(t.type, t.id)));
  const iguales = b.items.filter((t) => ka.has(k(t.type, t.id))).length;
  log(`- **${nombre}**: orígenes antes [${oa.join(", ")}] → después [${ob.join(", ")}]. ` +
    `Sale: ${oa.filter((o) => !ob.includes(o)).join(", ") || "ninguno"}. Tarjetas que se mantienen: ${iguales}/${b.items.length}.`);
}

// --- 6. Dejar uno afuera ---
log("\n## 6. Dejar uno afuera (pertinencia que el algoritmo no optimiza)\n");
log("Se oculta cada señal de los perfiles con 3 o más y se mira si vuelve en el riel armado con las demás.\n");
for (const nombre of ["actual", "final"]) {
  let aciertos = 0, intentos = 0;
  for (const p of FX.perfiles.filter((p) => p.senales.length >= 3 && p.id !== "P6b")) {
    for (const plats of [["n", "d", "m"], ["n"]]) {
      for (const oculta of p.senales) {
        const resto = p.senales.filter((s) => s !== oculta).map((s, i) => ({ ...s, rango: i }));
        const r = armar(resto, plats, V[nombre]);
        intentos++;
        if (r.items.some((t) => k(t.type, t.id) === k(oculta.tipo, oculta.id))) aciertos++;
      }
    }
  }
  log(`- **${nombre}**: ${aciertos}/${intentos} señales ocultas recuperadas.`);
}

// --- 7. Calibración de K y λ (sólo cambian algo con más de 6 señales) ---
log("\n## 7. Calibración de K (recencia) y λ (MMR) — perfiles P6/P6b, n,d,m\n");
log("| K | λ | orígenes P6 | sale con el voto nuevo | tarjetas que se mantienen | temas en los orígenes | dejar uno afuera (P6) |");
log("|---|---|---|---|---|---|---|");
const temaDe = (o) => {
  const g = FX.fuentes[k(o.origen.tipo, o.origen.id)].perfil.generosPropios;
  return g.includes(16) ? "anim" : g.includes(80) ? "crimen" : "otro";
};
for (const K of [4, 6, 10]) for (const lambda of [0.5, 1, 2]) {
  const v = { ...V.final, k: K, lambda };
  const a = armar(P6.senales, ["n", "d", "m"], v), b = armar(P6b.senales, ["n", "d", "m"], v);
  const oa = metricas(a).origenes, ob = metricas(b).origenes;
  const ka = new Set(a.items.map((t) => k(t.type, t.id)));
  let hits = 0;
  for (const oculta of P6.senales) {
    const resto = P6.senales.filter((s) => s !== oculta).map((s, i) => ({ ...s, rango: i }));
    if (armar(resto, ["n", "d", "m"], v).items.some((t) => k(t.type, t.id) === k(oculta.tipo, oculta.id))) hits++;
  }
  log(`| ${K} | ${lambda} | ${oa.join(", ")} | ${oa.filter((o) => !ob.includes(o)).join(", ") || "-"} | ` +
    `${b.items.filter((t) => ka.has(k(t.type, t.id))).length}/20 | ${[...new Set(a.porOrigen.map(temaDe))].join("+")} | ${hits}/${P6.senales.length} |`);
}

writeFileSync(new URL("./resultados.md", import.meta.url), out.join("\n") + "\n");

// --- 7. A/B a ciegas ---
// mulberry32: el LCG anterior daba 5 de 6 del mismo lado, y eso delata cuál es cuál.
let seed = 20261031;
const azar = () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ab = ["# Evaluación a ciegas — Elegidas para vos\n",
  "Para cada perfil, dos rieles (n,d,m). Marcá cuál te parece más pertinente para esos gustos, o \"iguales\".",
  "La llave está aparte (`ab-llave.md`): no la abras antes de evaluar.\n"];
const llave = ["# Llave del A/B (abrir DESPUÉS de evaluar)\n"];
for (const id of ["P1", "P3", "P4", "P6", "P8", "P9"]) {
  const p = FX.perfiles.find((x) => x.id === id);
  const act = armar(p.senales, ["n", "d", "m"], V.actual).items;
  const fin = armar(p.senales, ["n", "d", "m"], V.final).items;
  const nuevoEsA = azar() < 0.5;
  const [A, B] = nuevoEsA ? [fin, act] : [act, fin];
  const lista = (xs) => xs.length ? xs.map((t, i) => `${i + 1}. ${t.title}`).join("\n") : "(el riel no se muestra)";
  ab.push(`## ${id} — gustos: ${p.senales.map((s) => `${s.q}${s.peso === 3 ? " (Petacular)" : ""}`).join(", ")}\n`,
    `### A\n${lista(A)}\n`, `### B\n${lista(B)}\n`, "Más pertinente: ☐ A ☐ B ☐ iguales\n");
  llave.push(`- ${id}: nuevo = ${nuevoEsA ? "A" : "B"}`);
}
writeFileSync(new URL("./ab.md", import.meta.url), ab.join("\n"));
writeFileSync(new URL("./ab-llave.md", import.meta.url), llave.join("\n") + "\n");
