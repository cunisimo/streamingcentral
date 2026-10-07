// Selección estratificada y determinística de títulos NUEVOS para la ruleta.
//
// El objetivo no es "procesar N candidatos" sino conseguir N títulos FINALES
// que se puedan servir: que no estén en el pool, que tengan flatrate vigente en
// Argentina en una plataforma de Yump, que tengan los datos que la ruleta usa,
// y que respeten la distribución acordada con el dueño (2026-10-07):
//
//   - priorizar las CORTAS (escenario `corta`, el más débil): se mide con la
//     duración REAL ≤ 90 min. La familia de discover de 60–100 min sólo sirve
//     para encontrar candidatos: una de 91–100 min NO cuenta como corta.
//   - proteger las ANTIGUAS: cupo por década, así lo reciente no domina.
//   - mezclar POPULARES y MENOS CONOCIDAS: dentro de cada década, ronda entre
//     terciles de votos; el orden dentro de cada tercil es un hash del id, no la
//     popularidad.
//   - SÓLO plataformas de Yump.
//
// Dos piezas:
//   construirCola()  → orden de consulta de TODOS los candidatos nuevos (los
//                      primeros son los elegidos, los siguientes los suplentes).
//                      Pura y sin red: se puede armar y revisar antes de gastar.
//   decidir()        → con el detalle real de un título, si entra, va a reserva
//                      (sirve pero su cupo está lleno) o se descarta, y por qué.
// Recorrer la cola en orden y aplicar `decidir` hasta llenar el objetivo da
// siempre el mismo resultado: una corrida cortada y retomada elige lo mismo.

// Nombres de `watch/providers` de las plataformas de Yump: los de
// lib/roulette-providers.ts. Hay un test que falla si divergen.
export const NOMBRES_YUMP = [
  "Netflix", "Disney Plus", "HBO Max", "Amazon Prime Video",
  "Apple TV", "Apple TV Amazon Channel",
  "Paramount Plus", "Paramount+ Amazon Channel",
  "MUBI", "MUBI Amazon Channel",
  "Universal+ Amazon Channel", "MovistarTV", "Claro video",
  "VIX ", "ViX Premium Amazon Channel", "DIRECTV GO",
  "Crunchyroll", "Crunchyroll Amazon Channel", "OnDemandKorea",
];
const YUMP = new Set(NOMBRES_YUMP);

export const DECADAS = ["<1980", "1980s", "1990s", "2000s", "2010s", "2020s"];
export const CORTA_MAX_MIN = 90;

/** Objetivo aprobado: 500 finales. `reserva` cubre los que el LLM no conozca. */
export const OBJETIVO_500 = {
  total: 500,
  reservaPct: 0.15,
  cortaMin: 200,
  decadas: { "<1980": 90, "1980s": 60, "1990s": 85, "2000s": 85, "2010s": 90, "2020s": 90 },
};

export const decadaDe = (year) =>
  year == null ? null : year < 1980 ? "<1980" : year < 1990 ? "1980s" : year < 2000 ? "1990s"
    : year < 2010 ? "2000s" : year < 2020 ? "2010s" : "2020s";

// Década PREVISTA desde la ventana de discover (antes del detalle). La real la
// decide el año del detalle; si no coincide, el título cuenta en la real.
const PREVISTA = {
  "1920-1979": "<1980", "1980-1989": "1980s", "1990-1999": "1990s",
  "2000-2009": "2000s", "2010-2019": "2010s", "2020-2029": "2020s",
  "1920-1969": "<1980", "1970-1989": "<1980", "1990-2004": "1990s",
  "2005-2014": "2000s", "2015-2029": "2010s",
};

/** FNV-1a: orden estable y reproducible, sin relación con la popularidad. */
export function hashId(id, semilla = "ruleta") {
  let h = 2166136261;
  for (const ch of `${semilla}:${id}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Los pisos de cada familia, re-verificados: TMDB deja pasar alguno (1 de 5072). */
export function cumpleFiltros(c) {
  if (c.fams.includes("principal") && c.vc >= 300 && c.va >= 6.0) return true;
  if (c.fams.includes("cortas") && c.vc >= 50 && c.va >= 6.0) return true;
  return false;
}

/** Cupos escalados al objetivo + reserva (redondeo hacia arriba). */
export function cuotasConReserva(obj) {
  const f = 1 + obj.reservaPct;
  const decadas = Object.fromEntries(Object.entries(obj.decadas).map(([d, n]) => [d, Math.ceil(n * f)]));
  return {
    total: Math.ceil(obj.total * f),
    cortaMin: Math.ceil(obj.cortaMin * f),
    decadas,
  };
}

/**
 * Cola de consulta. Por década prevista: los candidatos se reparten en
 * "probables cortas" (aparecieron en la familia de 60–100 min) y "resto", cada
 * grupo en terciles de votos, y se intercalan `ritmoCortas` cortas por cada
 * otra. Las décadas se intercalan en proporción a su cupo (round-robin
 * ponderado y determinístico).
 */
export function construirCola(inventario, estado, obj = OBJETIVO_500, { semilla = "ruleta", ritmoCortas = 3, ahoraMs = Date.now(), ttlDescartesDias = 90 } = {}) {
  const enPool = (id) => !!estado.titulos[id] || !!estado.reserva?.[id];
  const descartado = (id) => {
    const d = estado.descartados?.[id];
    return d?.at && ahoraMs - Date.parse(d.at) <= ttlDescartesDias * 86_400_000;
  };
  const porDecada = Object.fromEntries(DECADAS.map((d) => [d, []]));
  for (const [idTxt, c] of Object.entries(inventario.candidatos)) {
    const id = Number(idTxt);
    if (enPool(id) || descartado(id) || !cumpleFiltros(c)) continue;
    const prev = PREVISTA[c.wp ?? c.wc];
    if (!prev) continue;
    porDecada[prev].push({ id, prev, corta: c.fams.includes("cortas"), vc: c.vc });
  }

  const ordenDecada = {};
  for (const [d, lista] of Object.entries(porDecada)) {
    const terciles = (grupo) => {
      const s = [...grupo].sort((a, b) => a.vc - b.vc || a.id - b.id);
      const t = [[], [], []];
      s.forEach((x, i) => { x.tercil = Math.min(2, Math.floor((3 * i) / s.length)); t[x.tercil].push(x); });
      for (const a of t) a.sort((x, y) => hashId(x.id, semilla) - hashId(y.id, semilla) || x.id - y.id);
      const out = [];
      for (let k = 0; t.some((a) => a.length); k++) { const a = t[k % 3]; if (a.length) out.push(a.shift()); }
      return out;
    };
    const cortas = terciles(lista.filter((x) => x.corta));
    const resto = terciles(lista.filter((x) => !x.corta));
    const out = [];
    while (cortas.length || resto.length) {
      for (let i = 0; i < ritmoCortas && cortas.length; i++) out.push(cortas.shift());
      if (resto.length) out.push(resto.shift());
    }
    ordenDecada[d] = out;
  }

  // Round-robin ponderado por cupo (smooth weighted round-robin).
  const pesos = obj.decadas;
  const totalPeso = Object.values(pesos).reduce((a, b) => a + b, 0);
  const credito = Object.fromEntries(DECADAS.map((d) => [d, 0]));
  const cola = [];
  while (DECADAS.some((d) => ordenDecada[d].length)) {
    const vivas = DECADAS.filter((d) => ordenDecada[d].length);
    for (const d of vivas) credito[d] += pesos[d];
    const elegida = vivas.reduce((a, b) => (credito[b] > credito[a] ? b : a));
    credito[elegida] -= totalPeso;
    cola.push(ordenDecada[elegida].shift());
  }
  return cola.map((x, i) => ({ pos: i + 1, id: x.id, prevista: x.prev, cortaProbable: x.corta, tercil: x.tercil, votos: x.vc }));
}

/** ¿Se puede servir? Devuelve el motivo si no. */
export function motivoNoServible(t) {
  if (!t) return "no-existe";
  const flat = t.providers_flatrate ?? [];
  if (!flat.some((p) => YUMP.has(p))) return "sin-flatrate-yump";
  if (!t.overview) return "sin-sinopsis";
  if (t.runtime == null) return "sin-duracion";
  if (t.year == null) return "sin-anio";
  if (!t.title) return "sin-titulo";
  if (!t.genres?.length) return "sin-generos";
  return null;
}

/**
 * Decisión sobre un título SERVIBLE, dados los contadores de lo ya aceptado.
 * "reserva" = se puede servir pero su cupo está lleno: se guarda enriquecido
 * para la próxima ampliación, sin volver a consultar TMDB.
 */
export function decidir(t, cont, cuotas) {
  const d = decadaDe(t.year);
  const corta = t.runtime <= CORTA_MAX_MIN;
  if (cont.total >= cuotas.total) return { decision: "reserva", motivo: "objetivo-completo" };
  if ((cont.decadas[d] ?? 0) >= cuotas.decadas[d]) return { decision: "reserva", motivo: `cupo-${d}-lleno` };
  const faltanCortas = Math.max(0, cuotas.cortaMin - cont.cortas);
  if (!corta && cuotas.total - cont.total - 1 < faltanCortas) return { decision: "reserva", motivo: "lugar-reservado-a-cortas" };
  return { decision: "aceptado", decada: d, corta };
}

export const contadoresVacios = () => ({ total: 0, cortas: 0, decadas: Object.fromEntries(DECADAS.map((d) => [d, 0])) });

export function sumar(cont, t) {
  cont.total++;
  if (t.runtime <= CORTA_MAX_MIN) cont.cortas++;
  const d = decadaDe(t.year);
  cont.decadas[d] = (cont.decadas[d] ?? 0) + 1;
}

/**
 * Recorre la cola en orden hasta llenar el objetivo. `evaluar(c)` devuelve el
 * título enriquecido (o null si no existe) — en la ejecución real es el detalle
 * de TMDB (vía diario), en la simulación es azar con semilla.
 *
 * Cupo de una década AGOTADA: cuando en lo que falta de la cola ya no queda
 * ningún candidato previsto para esa década y su cupo no se llenó, el sobrante
 * pasa a las demás, de la más antigua a la más nueva (sigue protegiendo lo
 * viejo). Sin esto, una década corta haría recorrer la cola entera.
 *
 * `detener()` permite cortar entre consultas (presupuesto, Ctrl+C).
 */
/**
 * Lo que devuelve `evaluar` cuando NO hay dato y no se debe consultar
 * (`--sin-nuevos-detalles`): el recorrido termina ahí, como si la cola se
 * hubiera agotado, y se aplica el último recurso.
 */
export const FIN_DE_DATOS = Symbol("fin-de-datos");

/**
 * Último recurso (decisión del dueño, 2026-10-07): si al terminar el recorrido
 * no se alcanzó el mínimo de cortas, se incorporan cortas REALES (≤ 90 min) ya
 * enriquecidas de la reserva, AUNQUE su década esté llena. Sin consultar nada.
 * Orden: primero la década menos representada respecto de su objetivo
 * ORIGINAL (las antiguas, que se quedaron cortas), y dentro de una década, la
 * posición en la cola. Después, si sigue faltando total, se completa desde la
 * reserva respetando los cupos.
 */
function completarDesdeReserva(reserva, cont, cuotas, objetivoDecadas) {
  const promovidos = [];
  const quitar = (t) => reserva.splice(reserva.indexOf(t), 1);
  const representacion = (d) => (cont.decadas[d] ?? 0) / Math.max(1, objetivoDecadas?.[d] ?? cuotas.decadas[d] ?? 1);
  while (cont.cortas < cuotas.cortaMin && cont.total < cuotas.total) {
    const cortas = reserva.filter((t) => t.runtime <= CORTA_MAX_MIN);
    if (!cortas.length) break;
    cortas.sort((a, b) => representacion(decadaDe(a.year)) - representacion(decadaDe(b.year)) || a._pos - b._pos);
    const t = cortas[0];
    quitar(t); sumar(cont, t); promovidos.push({ ...t, _motivo: "ultimo-recurso-cortas" });
  }
  for (const t of [...reserva].sort((a, b) => a._pos - b._pos)) {
    if (cont.total >= cuotas.total) break;
    if (decidir(t, cont, cuotas).decision !== "aceptado") continue;
    quitar(t); sumar(cont, t); promovidos.push({ ...t, _motivo: "ultimo-recurso-cupo" });
  }
  return promovidos;
}

export async function llenarObjetivo(cola, cuotasIniciales, evaluar, { objetivoDecadas = null } = {}) {
  const cuotas = structuredClone(cuotasIniciales);
  const cont = contadoresVacios();
  const restantes = Object.fromEntries(DECADAS.map((d) => [d, 0]));
  for (const c of cola) restantes[c.prevista]++;
  const aceptados = [];
  const reserva = [];
  const descartes = [];
  let consultas = 0;
  const redistribuir = () => {
    for (const d of DECADAS) {
      if (restantes[d] > 0 || cont.decadas[d] >= cuotas.decadas[d]) continue;
      let sobra = cuotas.decadas[d] - cont.decadas[d];
      cuotas.decadas[d] = cont.decadas[d];
      const vivas = DECADAS.filter((x) => restantes[x] > 0);
      for (let k = 0; sobra > 0 && vivas.length; k++, sobra--) cuotas.decadas[vivas[k % vivas.length]]++;
    }
  };
  for (const c of cola) {
    if (cont.total >= cuotas.total) break;
    const t = await evaluar(c);
    if (t === FIN_DE_DATOS) break;
    restantes[c.prevista]--;
    consultas++;
    const motivo = motivoNoServible(t);
    if (motivo) descartes.push({ id: c.id, motivo });
    else {
      const r = decidir(t, cont, cuotas);
      if (r.decision === "aceptado") { sumar(cont, t); aceptados.push({ ...t, _pos: c.pos }); }
      else reserva.push({ ...t, _pos: c.pos, _motivo: r.motivo });
    }
    redistribuir();
  }
  // Último recurso sólo si el recorrido terminó (cola agotada o sin más
  // datos) sin llenar el objetivo. Un corte por presupuesto lanza antes.
  let completadosDesdeReserva = [];
  if (cont.total < cuotas.total) {
    completadosDesdeReserva = completarDesdeReserva(reserva, cont, cuotas, objetivoDecadas ?? cuotasIniciales.decadas);
    for (const t of completadosDesdeReserva) aceptados.push(t);
  }
  const completo = cont.total >= cuotas.total && cont.cortas >= Math.min(cuotas.cortaMin, cuotas.total);
  return { aceptados, reserva, descartes, consultas, cont, cuotas, completo, completadosDesdeReserva };
}

/**
 * Cuántos detalles cuesta llenar el objetivo, simulando la cola con tasas
 * SUPUESTAS (Monte Carlo con semilla fija). Sirve para proponer el
 * presupuesto, NO es una medición: las tasas reales se conocen enriqueciendo.
 */
export async function estimarConsultas(cola, cuotas, tasas, { corridas = 200, semilla = 7 } = {}) {
  let s = semilla >>> 0;
  const azar = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
  const ANIO = { "<1980": 1965, "1980s": 1985, "1990s": 1995, "2000s": 2005, "2010s": 2015, "2020s": 2022 };
  const res = [];
  for (let k = 0; k < corridas; k++) {
    const r = await llenarObjetivo(cola, cuotas, async (c) => {
      if (azar() > (tasas.servible[c.prevista] ?? 0.8)) return null;
      const corta = azar() < (c.cortaProbable ? tasas.cortaReal : tasas.cortaRealResto);
      return { title: "x", overview: "x", genres: ["x"], providers_flatrate: ["Netflix"], year: ANIO[c.prevista], runtime: corta ? 85 : 110 };
    });
    res.push(r);
  }
  const ord = (f) => res.map(f).sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.floor(p * (arr.length - 1))];
  const consultas = ord((r) => r.consultas);
  return {
    p50: q(consultas, 0.5), p90: q(consultas, 0.9), max: q(consultas, 1),
    completas: res.filter((r) => r.completo).length / res.length,
    cortasP50: q(ord((r) => r.cont.cortas), 0.5),
    decadasP50: Object.fromEntries(DECADAS.map((d) => [d, q(ord((r) => r.cont.decadas[d]), 0.5)])),
  };
}

/**
 * Detalles que FALTAN para llenar el objetivo, reconstruido del diario: se
 * reproduce la cola con lo que ya se consultó y, para lo que falta, se muestrea
 * de lo OBSERVADO (por década prevista y probable corta; semilla fija). No
 * resta nada de la estimación inicial, que con tasas supuestas puede estar muy
 * lejos (pasó: estimaba 1296 y a 1500 faltaban 24).
 * `diario`: Map clave → resultado (`detalle:<id>` → { titulo } | { descartado }).
 */
export async function estimarPendientes(cola, cuotas, diario, { sinNuevosDetalles = false, corridas = 200, semilla = 11, tasasRespaldo = null } = {}) {
  const dato = (c) => diario.get(`detalle:${c.id}`);
  const valor = (d) => (d?.titulo && !motivoNoServible(d.titulo) ? d.titulo : null);
  const obs = {};
  for (const c of cola) { const d = dato(c); if (d) (obs[`${c.prevista}|${c.cortaProbable}`] ??= []).push(valor(d)); }
  const todas = Object.values(obs).flat();
  let s = semilla >>> 0;
  const azar = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
  const sinDato = new Set(cola.filter((c) => !dato(c)).map((c) => c.id));
  const res = [];
  for (let k = 0; k < (sinNuevosDetalles ? 1 : corridas); k++) {
    let nuevas = 0;
    const r = await llenarObjetivo(cola, cuotas, async (c) => {
      const d = dato(c);
      if (d) return d.titulo ?? null;
      if (sinNuevosDetalles) return FIN_DE_DATOS;
      nuevas++;
      const m = obs[`${c.prevista}|${c.cortaProbable}`] ?? todas;
      if (!m.length) return azar() < (tasasRespaldo?.servible?.[c.prevista] ?? 0.8) ? { title: "x", overview: "x", genres: ["x"], providers_flatrate: ["Netflix"], year: 2015, runtime: 110 } : null;
      return m[Math.floor(azar() * m.length)];
    });
    res.push({ nuevas, completo: r.completo });
  }
  const ord = res.map((r) => r.nuevas).sort((a, b) => a - b);
  const q = (p) => ord[Math.floor(p * (ord.length - 1))];
  return { p50: q(0.5), p90: q(0.9), max: q(1), completas: res.filter((r) => r.completo).length / res.length, enDiario: cola.length - sinDato.size };
}
