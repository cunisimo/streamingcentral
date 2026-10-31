// Diversidad de "Elegidas para vos": categorías, selección de orígenes y
// selección final de tarjetas. Plan: docs/superpowers/plans/2026-10-31-reco-diversidad.md
//
// Puro y sin red, por la misma razón que ./reco-mezcla y ./reco-puntaje: son
// invariantes del riel y tienen que poder probarse con node:test.
import type { MediaType } from "./types";

// --- Categorías (§1 del plan) --------------------------------------------------
//
// Tres categorías que NO se mezclan, definidas sólo con los géneros que ya vienen
// en el crudo de TMDB (sin llamadas):
//
//   INFANTIL  serie con Kids (10762), o película con Animación (16) Y Family
//             (10751). Kids existe sólo en series y en la muestra es limpio;
//             Family solo es ruidoso (sitcoms, Shrek), por eso en películas se
//             exige la combinación. Errores aceptados: Shrek y Los Simpson: la
//             película cuentan como infantiles.
//   FAMILIAR  10751 sin lo anterior. No tiene regla ni cupo.
//   ANIMACIÓN 16. Cupo blando con 3 orígenes o más.
export const GENERO_ANIMACION = 16;
export const GENERO_FAMILY = 10751;
export const GENERO_KIDS = 10762;

export function esInfantil(tipo: MediaType, generos?: number[]): boolean {
  if (!generos?.length) return false;
  if (tipo === "tv") return generos.includes(GENERO_KIDS);
  return generos.includes(GENERO_ANIMACION) && generos.includes(GENERO_FAMILY);
}

export const esAnimacion = (generos?: number[]) => !!generos?.includes(GENERO_ANIMACION);

// Qué excluir en el pedido del CRUCE (§4.2). `sinFamilia` es la variante D2(a),
// que el dueño pidió validar antes de desplegar.
//
//   cruce hacia series:    sin Kids, si el origen no es infantil. Coincide
//                          exactamente con la definición infantil en series.
//   cruce hacia películas: sin Family SÓLO si el origen es animado y no
//                          infantil (D2a). TMDB no permite excluir "16 y 10751"
//                          en una consulta y `with_genres` va con `|` (O), así
//                          que esto también pierde películas familiares SIN
//                          animación en ese cruce. Es el costo medido en
//                          docs/medidas (ver el informe de la implementación).
export function exclusionesCruce(
  origen: { tipo: MediaType; generos: number[] }, sinFamilia: boolean,
): number[] {
  if (esInfantil(origen.tipo, origen.generos)) return [];
  const destino: MediaType = origen.tipo === "movie" ? "tv" : "movie";
  if (destino === "tv") return [GENERO_KIDS];
  if (sinFamilia && esAnimacion(origen.generos)) return [GENERO_FAMILY];
  return [];
}

// --- Orígenes (§2) ------------------------------------------------------------

export interface SenalConRango {
  tipo: MediaType;
  id: number;
  peso: 1 | 2 | 3;     // 3 Petacular · 2 Ta buena · 1 Mi lista
  // Posición por recencia entre TODAS las señales positivas (0 = la más nueva).
  rango: number;
}

// valor = peso − rango / K. K = cuántos puestos de recencia equivalen a un punto
// de peso: con 10, un Ta buena nuevo le gana a un Petacular 11 puestos más
// viejo. K y λ salen de la calibración del harness (scripts/reco-harness,
// sección 7): con 10/1 los seis orígenes de P6 cubren crimen, animación y otros
// temas, y un voto nuevo de crimen desplaza a otro de crimen. Es UN perfil: la
// evidencia es débil y se revisa con datos reales.
export const K_RECENCIA = 10;
export const LAMBDA_MMR = 1;
// Cuántas señales compiten por los 6 lugares.
export const HISTORIAL_ORIGENES = 12;

const claveS = (s: { tipo: MediaType; id: number }) => `${s.tipo}:${s.id}`;

// Las candidatas a origen, YA ordenadas por valor. No necesita géneros: por eso
// la clave del riel puede salir de acá sin leer ningún perfil antes del caché.
export function candidatasOrigen(senales: SenalConRango[], k = K_RECENCIA, max = HISTORIAL_ORIGENES): SenalConRango[] {
  const masFuerte = new Map<string, SenalConRango>();
  for (const s of senales) {
    const ya = masFuerte.get(claveS(s));
    // Duplicada (votada y en Mi lista): gana el peso mayor; a igual peso, la más nueva.
    if (!ya || s.peso > ya.peso || (s.peso === ya.peso && s.rango < ya.rango)) masFuerte.set(claveS(s), s);
  }
  const valor = (s: SenalConRango) => s.peso - s.rango / k;
  return [...masFuerte.values()]
    .sort((a, b) => valor(b) - valor(a) || a.rango - b.rango || (claveS(a) < claveS(b) ? -1 : 1))
    .slice(0, max);
}

export interface PerfilOrigen { generos: number[]; tipo: MediaType }

// Jaccard de géneros + 1 si las dos son animación.
export function similitud(a: PerfilOrigen, b: PerfilOrigen): number {
  const A = new Set(a.generos), B = new Set(b.generos);
  const inter = [...A].filter((g) => B.has(g)).length;
  const union = new Set([...A, ...B]).size || 1;
  return inter / union + (esAnimacion(a.generos) && esAnimacion(b.generos) ? 1 : 0);
}

// MMR (Carbonell & Goldstein, 1998): cada elección maximiza
// valor − λ · (similitud máxima con lo ya elegido).
//
// Lo que desplaza un voto nuevo es un RESULTADO observado en las pruebas, no
// una garantía: depende de los géneros y los pesos de cada caso.
export function elegirOrigenesMMR<S extends SenalConRango>(
  candidatas: S[], perfil: (s: S) => PerfilOrigen, max = 6,
  { k = K_RECENCIA, lambda = LAMBDA_MMR }: { k?: number; lambda?: number } = {},
): S[] {
  const valor = (s: S) => s.peso - s.rango / k;
  const elegidos: S[] = [];
  const restantes = [...candidatas];
  while (elegidos.length < max && restantes.length) {
    let mejor = -1, mejorMmr = -Infinity;
    restantes.forEach((s, i) => {
      const sim = elegidos.length ? Math.max(...elegidos.map((e) => similitud(perfil(s), perfil(e)))) : 0;
      const mmr = valor(s) - lambda * sim;
      // Empate: se queda el primero, que ya viene ordenado por valor y recencia.
      if (mmr > mejorMmr + 1e-9) { mejor = i; mejorMmr = mmr; }
    });
    elegidos.push(restantes.splice(mejor, 1)[0]);
  }
  return elegidos;
}

// --- Selección final (§3) -----------------------------------------------------

export const OBJETIVO_FINAL = 20;
export const PISO_FINAL = 10;
export const POR_TIPO_FINAL = 10;

export interface Tarjeta {
  type: MediaType;
  id: number;
  origen: string;          // `tipo:id` del origen que la respalda (uno solo)
  puntaje: number;
  animacion: boolean;
  infantil: boolean;
}

export interface ResultadoSeleccion<T> {
  items: T[];
  // Cuántas entraron con todos los cupos cumplidos (pasada 1) y cuántas
  // completó la pasada 2. Lo de la pasada 2 va siempre DESPUÉS.
  conCupos: number;
  completados: number;
  cupos: { origen: number; animacion: number; infantil: number };
}

// PRIORIDAD (decisión D1 del dueño, 31/10):
//   1. reglas duras — llegan ya cumplidas: lo que entra acá es elegible;
//   2. cantidad — T = min(20, elegibles); quien llama decide el piso de 10
//      sobre los ELEGIBLES, no sobre lo que dejan los cupos;
//   3. diversidad — los cupos deciden qué entra primero y en qué posición, y
//      nunca dejan el riel por debajo de T.
export function seleccionarTarjetas<T extends Tarjeta>(
  elegibles: T[],
  { origenesAnimados, origenesInfantiles }: { origenesAnimados: number; origenesInfantiles: number },
): ResultadoSeleccion<T> {
  const T = Math.min(OBJETIVO_FINAL, elegibles.length);
  const n = new Set(elegibles.map((c) => c.origen)).size;
  const capOrigen = Math.ceil(T / Math.min(Math.max(n, 1), 4));
  // Cupo temático: sólo con 3 orígenes o más. Con 1 o 2 el riel es, por
  // construcción, "más de lo mismo", y un cupo sólo forzaría la pasada 2.
  const capTema = (conTema: number) => n < 3
    ? Infinity
    : Math.min(Math.ceil(T * Math.max(conTema / n, 0.1)), Math.ceil(T * 0.5));
  const cupos = { origen: capOrigen, animacion: capTema(origenesAnimados), infantil: capTema(origenesInfantiles) };
  // Primeras 6 (lo que se ve sin scrollear en el celular), con n ≥ 3: la MISMA
  // proporción que el riel entero, redondeada hacia abajo y nunca menos de 1.
  // Con un tope fijo de 2, un único gusto infantil entre 6 ponía 2 infantiles
  // arriba (harness, perfil P8): un tercio de la pantalla para 1/6 de los gustos.
  const top6 = (cap: number) => (Number.isFinite(cap) ? Math.max(1, Math.floor((6 * cap) / Math.max(T, 1))) : Infinity);
  const top6Anim = top6(cupos.animacion), top6Inf = top6(cupos.infantil);

  const orden = [...elegibles].sort((a, b) =>
    b.puntaje - a.puntaje || (a.type < b.type ? -1 : a.type > b.type ? 1 : a.id - b.id));
  const out: T[] = [];
  const usados = new Set<T>();
  const porOrigen = new Map<string, number>();
  let anim = 0, inf = 0;
  const cuantosTipo = (t: MediaType) => out.filter((x) => x.type === t).length;

  const cumpleCupos = (c: T, conTop6: boolean) => {
    const delOrigen = porOrigen.get(c.origen) ?? 0;
    if (delOrigen >= cupos.origen) return false;
    if (c.animacion && anim >= cupos.animacion) return false;
    if (c.infantil && inf >= cupos.infantil) return false;
    if (conTop6 && out.length < 6 && n >= 3) {
      if (delOrigen >= 2) return false;
      if (c.animacion && anim >= top6Anim) return false;
      if (c.infantil && inf >= top6Inf) return false;
    }
    return true;
  };

  // Alterna película/serie como `mezclarTipos`: 10 y 10 es objetivo, no cuota.
  const siguiente = (filtro: (c: T) => boolean): T | null => {
    const tocaPel = out.length % 2 === 0;
    const tipos: MediaType[] = tocaPel ? ["movie", "tv"] : ["tv", "movie"];
    for (const tipo of tipos) {
      const otro: MediaType = tipo === "movie" ? "tv" : "movie";
      if (cuantosTipo(tipo) >= POR_TIPO_FINAL
        && orden.some((c) => !usados.has(c) && c.type === otro && filtro(c))) continue;
      const c = orden.find((x) => !usados.has(x) && x.type === tipo && filtro(x));
      if (c) return c;
    }
    return null;
  };
  const tomar = (c: T) => {
    out.push(c); usados.add(c);
    porOrigen.set(c.origen, (porOrigen.get(c.origen) ?? 0) + 1);
    if (c.animacion) anim++;
    if (c.infantil) inf++;
  };

  // Pasada 1. La regla de las primeras 6 es de POSICIÓN: si no hay quién la
  // cumpla, se toma el mejor que cumple los cupos de cantidad y la pasada sigue.
  // Cortar la pasada ahí mandaba casi todo a la pasada 2, sin cupos (harness,
  // perfil P9: 16 de 20 completadas).
  const paso1 = () => siguiente((c) => cumpleCupos(c, true)) ?? siguiente((c) => cumpleCupos(c, false));
  for (let c = paso1(); out.length < T && c; c = out.length < T ? paso1() : null) tomar(c);
  const conCupos = out.length;
  // Pasada 2: completa hasta T sin cupos, pero tomando primero del origen MENOS
  // representado (y, dentro de él, por puntaje). Por puntaje puro, los
  // sobrantes de mayor puntaje eran todos del mismo origen y la pasada 2
  // concentraba MÁS que el algoritmo anterior (harness, perfil P9: 13 de un
  // origen contra 11).
  const paso2 = () => {
    let min = Infinity;
    for (const c of orden) if (!usados.has(c)) min = Math.min(min, porOrigen.get(c.origen) ?? 0);
    return siguiente((c) => (porOrigen.get(c.origen) ?? 0) === min) ?? siguiente(() => true);
  };
  for (let c = paso2(); out.length < T && c; c = out.length < T ? paso2() : null) tomar(c);
  return { items: out, conCupos, completados: out.length - conCupos, cupos };
}
