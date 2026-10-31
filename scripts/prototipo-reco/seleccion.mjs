// PROTOTIPO del plan docs/superpowers/plans/2026-10-31-reco-diversidad.md.
// NO está conectado a la app: sirve para probar con datos sintéticos las reglas
// del plan (sin TMDB) antes de implementarlas en lib/.
//
// Dos funciones puras:
//   seleccionarTarjetas — arma el riel final a partir de candidatos ya
//                         elegibles (en plataforma, no excluidos, no descartados,
//                         guard infantil aplicado).
//   elegirOrigenesMMR   — elige hasta 6 orígenes entre las señales positivas.

export const OBJETIVO = 20;
export const PISO = 10;
export const POR_TIPO = 10;

// --- Riel final --------------------------------------------------------------

// Prioridad cuando chocan (§3 del plan):
//   1. Reglas duras: lo que llega acá ya las cumple. Nunca se relajan.
//   2. Cantidad: T = min(OBJETIVO, elegibles). Se muestra si elegibles ≥ PISO.
//   3. Diversidad: los cupos deciden QUÉ entra primero y en qué posición, pero
//      nunca dejan el riel por debajo de T. La pasada 2 completa sin cupos.
export function seleccionarTarjetas(cands, { origenesAnimados = 0, origenesInfantiles = 0 } = {}) {
  const elegibles = cands.length;
  const visible = elegibles >= PISO;
  const T = Math.min(OBJETIVO, elegibles);
  const n = new Set(cands.map((c) => c.origen)).size;

  const capOrigen = Math.ceil(T / Math.min(Math.max(n, 1), 4));
  const capTema = (origenesTema) => {
    if (n < 3) return Infinity;
    const share = Math.max(origenesTema / n, 0.1);
    return Math.min(Math.ceil(T * share), Math.ceil(T * 0.5));
  };
  const capAnim = capTema(origenesAnimados);
  const capInf = capTema(origenesInfantiles);

  const orden = [...cands].sort((a, b) => b.score - a.score || (a.k < b.k ? -1 : 1));
  const out = [];
  const usados = new Set();
  const cuenta = (pred) => out.filter(pred).length;

  const cumpleCupos = (c) => {
    if (cuenta((x) => x.origen === c.origen) >= capOrigen) return false;
    if (c.anim && cuenta((x) => x.anim) >= capAnim) return false;
    if (c.infantil && cuenta((x) => x.infantil) >= capInf) return false;
    // Primeras 6, sólo con n ≥ 3 (con 1 o 2 orígenes es imposible cumplirlo):
    // como mucho 2 del mismo origen y 2 de animación.
    if (out.length < 6 && n >= 3) {
      if (cuenta((x) => x.origen === c.origen) >= 2) return false;
      if (c.anim && cuenta((x) => x.anim) >= 2) return false;
    }
    return true;
  };

  // Elige el mejor del tipo que toca; si no hay, el mejor del otro tipo.
  const tomar = (filtro) => {
    const tocaPel = out.length % 2 === 0;
    const tipos = tocaPel ? ["movie", "tv"] : ["tv", "movie"];
    for (const tipo of tipos) {
      if (cuenta((x) => x.tipo === tipo) >= POR_TIPO && out.length < T) {
        // El 10/10 es objetivo, no cuota: se respeta si el otro tipo tiene algo.
        const otro = tipo === "movie" ? "tv" : "movie";
        if (orden.some((c) => !usados.has(c.k) && c.tipo === otro && filtro(c))) continue;
      }
      const c = orden.find((c) => !usados.has(c.k) && c.tipo === tipo && filtro(c));
      if (c) return c;
    }
    return null;
  };

  // Pasada 1: con cupos.
  while (out.length < T) {
    const c = tomar(cumpleCupos);
    if (!c) break;
    out.push(c); usados.add(c.k);
  }
  const conCupos = out.length;
  // Pasada 2: completa hasta T sin cupos (las reglas duras ya vienen cumplidas).
  while (out.length < T) {
    const c = tomar(() => true);
    if (!c) break;
    out.push(c); usados.add(c.k);
  }
  return { visible, T, items: visible ? out : [], conCupos, completados: out.length - conCupos, caps: { capOrigen, capAnim, capInf } };
}

// --- Orígenes ----------------------------------------------------------------

// valor = peso − rango / K. `rango` es la posición por recencia entre TODAS las
// señales positivas (0 = la más nueva). K dice cuántos puestos de recencia
// equivalen a un punto de peso: con K = 6, un Ta buena nuevo empata con un
// Petacular 6 puestos más viejo. K es un parámetro a calibrar, no un resultado.
//
// MMR: cada elección maximiza valor − λ · similitud máxima con lo ya elegido.
// similitud = Jaccard de géneros + 1 si comparten la marca de animación.
export function similitud(a, b) {
  const A = new Set(a.generos), B = new Set(b.generos);
  const inter = [...A].filter((g) => B.has(g)).length;
  const union = new Set([...A, ...B]).size || 1;
  return inter / union + (a.anim === b.anim && a.anim ? 1 : 0);
}

export function elegirOrigenesMMR(senales, { max = 6, historial = 12, K = 6, lambda = 1 } = {}) {
  const conValor = senales
    .map((s) => ({ ...s, valor: s.peso - s.rango / K }))
    // Desempate: más reciente primero, después `tipo:id` estable.
    .sort((a, b) => b.valor - a.valor || a.rango - b.rango || (a.k < b.k ? -1 : 1))
    .slice(0, historial);
  const elegidos = [];
  while (elegidos.length < max && elegidos.length < conValor.length) {
    let mejor = null, mejorMmr = -Infinity;
    for (const s of conValor) {
      if (elegidos.includes(s)) continue;
      const sim = elegidos.length ? Math.max(...elegidos.map((e) => similitud(s, e))) : 0;
      const mmr = s.valor - lambda * sim;
      if (mmr > mejorMmr + 1e-9) { mejor = s; mejorMmr = mmr; }
    }
    elegidos.push(mejor);
  }
  return elegidos;
}
