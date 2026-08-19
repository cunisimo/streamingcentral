// Las tres funciones puras del riel "Elegidas para vos": elegir orígenes,
// intercalar por origen y mezclar los dos tipos.
//
// Viven acá y no en `lib/reco.ts` por la misma razón que `lib/fecha.ts` y
// `lib/home-refresco.ts`: `reco.ts` es `server-only` y un test de Node no puede
// importarlo. Y son justo la parte que hay que poder probar — son invariantes
// del riel (que no se repita un origen, que la fila se vea mixta, que un título
// no ocupe dos lugares), no detalles de presentación.
import type { MediaType } from "./types";

export type PesoSenal = 3 | 2 | 1;   // 3 Petacular · 2 Ta buena · 1 Mi lista

export interface Senal {
  tipo: MediaType;
  id: number;
  peso: PesoSenal;
}

export const clave = (t: MediaType, id: number) => `${t}:${id}`;

// Elige los títulos que van a originar recomendaciones.
//
// Deduplica por `tipo:id` conservando la señal MÁS FUERTE. Sin eso, un título
// que está en Mi lista y además tiene voto ocupaba DOS de los seis lugares y
// aportaba los mismos candidatos dos veces: el riel quedaba armado sobre cuatro
// títulos en vez de seis, y ese título pesaba doble en el intercalado.
//
// La jerarquía es Petacular > Ta buena > Mi lista, y funciona por
// DISPONIBILIDAD: no hay cupo por nivel. Si alguien solo tiene títulos en Mi
// lista, esos ocupan los seis lugares.
export function elegirOrigenes(senales: Senal[], max: number): Senal[] {
  const masFuerte = new Map<string, Senal>();
  for (const s of senales) {
    const k = clave(s.tipo, s.id);
    const ya = masFuerte.get(k);
    if (!ya || s.peso > ya.peso) masFuerte.set(k, s);
  }
  return [...masFuerte.values()].sort((a, b) => b.peso - a.peso).slice(0, max);
}

// Intercala tomando uno de cada origen por vuelta.
//
// La identidad del origen es `tipo:id` y NO el id solo: TMDB numera películas y
// series por separado, así que existe la película 1399 y la serie 1399. Con el
// id pelado, dos orígenes distintos se fusionaban en un grupo.
//
// Sin intercalar, el riel se lo lleva el primer origen: medido, 8 de los 12
// primeros salían del mismo título, porque casi ningún candidato tiene 2+ apoyos
// y entonces el desempate por apoyos no desempata y manda el orden de llegada.
export function intercalarPorOrigen<T extends { porque: { id: number; tipo: MediaType }; apoyos: number }>(
  cands: T[],
): T[] {
  const grupos = new Map<string, T[]>();
  for (const c of cands) {
    const k = clave(c.porque.tipo, c.porque.id);
    const g = grupos.get(k) ?? [];
    g.push(c);
    grupos.set(k, g);
  }
  for (const g of grupos.values()) g.sort((a, b) => b.apoyos - a.apoyos);
  const listas = [...grupos.values()];
  const out: T[] = [];
  for (let i = 0; out.length < cands.length; i++) {
    let hubo = false;
    for (const l of listas) if (i < l.length) { out.push(l[i]); hubo = true; }
    if (!hubo) break;
  }
  return out;
}

// Mezcla los dos tipos ALTERNANDO uno y uno, no un bloque y después el otro.
//
// La versión anterior ponía primero hasta 10 películas y después las series: el
// reparto final era 10 y 10, pero en pantalla se veía como dos rieles pegados, y
// en mobile —donde entran 2,5 tarjetas— había que scrollear cinco pantallas para
// llegar a la primera serie. Un riel mixto que hay que scrollear para descubrir
// que es mixto no es un riel mixto.
//
// "10 y 10" es un objetivo, no una cuota: cuando un lado se agota, el otro
// completa hasta el objetivo total.
export function mezclarTipos<T extends { type: MediaType }>(
  items: T[], objetivo: number, porTipo: number,
): T[] {
  const pel = items.filter((i) => i.type === "movie");
  const ser = items.filter((i) => i.type === "tv");
  const out: T[] = [];
  let p = 0, s = 0;
  // Arranca por el lado que más tiene, para que el que escasea quede repartido a
  // lo largo del riel en vez de amontonado al final.
  let tocaPelicula = pel.length >= ser.length;
  const cuantas = (t: MediaType) => out.filter((i) => i.type === t).length;
  while (out.length < objetivo && (p < pel.length || s < ser.length)) {
    const puedePel = p < pel.length && cuantas("movie") < porTipo;
    const puedeSer = s < ser.length && cuantas("tv") < porTipo;
    if (tocaPelicula && puedePel) out.push(pel[p++]);
    else if (!tocaPelicula && puedeSer) out.push(ser[s++]);
    else if (puedeSer) out.push(ser[s++]);
    else if (puedePel) out.push(pel[p++]);
    // Si los dos topes por tipo se llenaron pero falta para el objetivo, manda
    // el objetivo total: el riel es uno solo y mixto.
    else if (p < pel.length) out.push(pel[p++]);
    else if (s < ser.length) out.push(ser[s++]);
    else break;
    tocaPelicula = !tocaPelicula;
  }
  return out;
}
