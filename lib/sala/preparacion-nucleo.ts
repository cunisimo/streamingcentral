// Selección PURA de las cards de una tanda. Sin red, sin caché, sin fecha:
// recibe las candidatas de `sala_candidatos` (ya ordenadas por la semilla de
// la sala), las UITitle que `cardsByIds` pudo enriquecer, y la unión de
// plataformas congelada, y devuelve las cards en el orden final.
//
// REGLAS QUE FIJA (y que los tests hacen cumplir):
//   - El orden es el de las candidatas: NUNCA se reordena por popularidad ni
//     por nota (ver el principio en CLAUDE.md).
//   - Una película queda si sigue en AL MENOS UNA plataforma de la unión de la
//     sala. No hace falta que todos los participantes la tengan.
//   - `platforms` viene de `cardsByIds` → `card:` (24 h) / `pv3:` (8 h): la
//     disponibilidad puede tener hasta 24 h de antigüedad. No es instantánea.
//   - Sin card (TMDB no la enriqueció) o sin duración comprobable, se descarta.
//   - `advertencia` vacía o de espacios se normaliza a null: el "Pero" es
//     opcional y no se inventa texto. `sala_publicar_ronda` hace lo mismo.
import type { PlatformCode, UITitle } from "../types";
import { SIZES, type Candidata, type CardSala, type Size } from "./tipos";

export function enPlataformasDeLaSala(deLaCard: readonly PlatformCode[], union: readonly PlatformCode[]): boolean {
  return deLaCard.some((p) => union.includes(p));
}

const textoONull = (s: string | null | undefined): string | null => {
  const t = (s ?? "").trim();
  return t.length ? t : null;
};

export interface Seleccion {
  cards: CardSala[];
  /** Cuántas faltaron para llegar a `size` (0 si se llenó). */
  faltan: number;
  /** Cuántas candidatas eran válidas en total (con card, en la unión, con duración). */
  validas: number;
}

export function elegirCards(
  candidatas: readonly Candidata[],
  cards: ReadonlyMap<number, UITitle>,
  union: readonly PlatformCode[],
  size: Size,
): Seleccion {
  const out: CardSala[] = [];
  let validas = 0;
  for (const c of candidatas) {
    const card = cards.get(c.tmdb_id);
    if (!card) continue;
    if (!(Number.isInteger(c.runtime) && c.runtime > 0)) continue;
    if (!enPlataformasDeLaSala(card.platforms, union)) continue;
    validas++;
    if (out.length >= size) continue;
    out.push({
      pos: out.length,
      tmdb_id: c.tmdb_id,
      titulo: card.title,
      anio: card.year,
      runtime: c.runtime,
      poster: card.poster,
      generos: card.genres,
      platforms: card.platforms,
      razon: c.razon,
      advertencia: textoONull(c.advertencia),
    });
  }
  return { cards: out, faltan: Math.max(0, size - out.length), validas };
}

/** Qué tamaños de tanda se pueden ofrecer con `validas` películas. */
export function tamaniosAlcanzables(validas: number): Size[] {
  return SIZES.filter((s) => s <= validas);
}
