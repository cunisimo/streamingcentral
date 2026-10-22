// Tipos del módulo de reglas de moderación de reseñas y nombres comunitarios
// (plan docs/superpowers/plans/2026-10-22-resenas-comunidad.md, E1; revisión
// §3). PURO: sin red, sin base, sin datos reales. Todavía no lo usa ninguna
// ruta ni pantalla.

/**
 * Qué pasa con un texto. Gana el más restrictivo (ver `PRIORIDAD`).
 * `error` existe para que un fallo NUNCA se confunda con `publicar`: quien
 * llame sólo publica si recibe exactamente `"publicar"`.
 */
export type Resultado =
  | "publicar"
  | "retener"
  | "rechazo_formato"
  | "rechazo_contenido"
  | "error";

/** Lo que una regla puede devolver cuando se dispara. */
export type ResultadoRegla = Exclude<Resultado, "publicar" | "error">;

export const PRIORIDAD: Record<Resultado, number> = {
  publicar: 0,
  retener: 1,
  rechazo_formato: 2,
  rechazo_contenido: 3,
  error: 4,
};

/** Las copias del texto que miran las reglas (ver plegado.ts). */
export interface Plegado {
  /** NFC, saltos de línea normalizados y bordes recortados. Lo que se guarda. */
  original: string;
  /** NFKC, minúsculas, sin acentos ni invisibles, espacios colapsados. */
  base: string;
  /** Pasada 1: `base` con las corridas de palabras-número pasadas a dígitos. */
  digitos: string;
  /** Pasada 2: `base` con puntos y arrobas ofuscados resueltos, letras sueltas unidas y cirílicas/griegas mapeadas. */
  letras: string;
}

/** Contexto EXPLÍCITO que arma quien llama. El módulo no consulta nada. */
export interface ContextoResena {
  /** Hasta 3 textos de la misma cuenta en las últimas 24 h (contacto partido). */
  textosRecientes: readonly string[];
}

export interface Disparo {
  resultado: ResultadoRegla;
  /** Texto para el autor. En una retención no se muestra (ver decision.ts). */
  motivo: string;
}

export interface Regla<C> {
  id: string;
  version: number;
  evaluar: (p: Plegado, contexto: C) => Disparo | null;
}

export interface ReglaDisparada {
  regla: string;
  version: number;
  resultado: ResultadoRegla;
}

export interface Decision {
  resultado: Resultado;
  versionReglas: string;
  disparadas: ReglaDisparada[];
  /** Lo que ve el autor. Nunca revela la regla exacta de una retención. */
  motivoUsuario: string;
}
