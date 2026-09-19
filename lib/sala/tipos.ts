// Tipos y constantes de las salas compartidas. Client-safe: no importa nada
// de servidor. Es el contrato entre la RPC `sala_estado`, la ruta de
// preparación y la interfaz.
import type { PlatformCode } from "../types.ts";

export type Duracion = "cualquiera" | "corta" | "larga";
export type Size = 5 | 10 | 20;

export const SIZES: readonly Size[] = [5, 10, 20];
export const DURACIONES: readonly Duracion[] = ["cualquiera", "corta", "larga"];

/**
 * Límite global de la ronda, en segundos, por tamaño de tanda. Es el mismo
 * número que `sala_limite_seg` en la base: acá está para la interfaz
 * (mostrar cuánto queda) y para los tests; el que manda es el del servidor.
 * Coherente con el contador local de 10 s por card: 20 × 10 = 200 < 300.
 */
export const LIMITE_SEG: Record<Size, number> = { 5: 120, 10: 180, 20: 300 };

/** Lo que la interfaz preselecciona. La API NO lo aplica: exige valores explícitos. */
export const CONFIG_DEFAULT = { size: 10 as Size, duracion: "cualquiera" as Duracion } as const;

/** Una fila de `sala_candidatos`. `advertencia` puede ser NULL: el "Pero" es opcional. */
export interface Candidata {
  tmdb_id: number;
  runtime: number;
  razon: string;
  advertencia: string | null;
  year: number | null;
  genres: string[];
}

/**
 * Una card congelada de `room_titles`. Es lo que ve cada participante, en el
 * mismo orden (`pos`). `advertencia === null` → la card no muestra "Pero".
 * `platforms` son las plataformas del título en AR según `cardsByIds` en el
 * momento de preparar (cachés `card:` 24 h / `pv3:` 8 h: puede tener hasta
 * 24 h de antigüedad); la unión de la sala decide cuáles se destacan.
 */
export interface CardSala {
  pos: number;
  tmdb_id: number;
  titulo: string;
  anio: number | null;
  runtime: number;
  poster: string | null;
  generos: string[];
  platforms: PlatformCode[];
  razon: string;
  advertencia: string | null;
}

/** Respuesta de `POST /api/sala/preparar`. */
export type ResultadoPreparar =
  | { ok: true; round_id: string; numero: number; started_at: string; deadline_at: string;
      /** Diagnóstico: cuántas candidatas se enriquecieron y cuántas de ésas se descartaron (sin card, sin duración o fuera de la unión). */
      enriquecidas: number; descartadas: number }
  | { ok: false; motivo: "sin_quorum" | "estado" | "no_es_host" | "desactivadas" | "insuficientes" | "fallo"; alcanzables?: Size[]; detalle?: string };
