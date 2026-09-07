// El historial de la sesión abierta de la ruleta.
//
// ============================================================================
// QUÉ PROBLEMA RESUELVE
// ============================================================================
// Hasta ahora "Otra" era un camino de ida: consumía de la cola y lo anterior se
// perdía. Si el usuario veía algo que le interesaba y apretaba "Otra" de más, no
// había forma de volver — la recomendación anterior estaba tirada.
//
// Acá vive el modelo, PURO y sin React, porque es donde están las decisiones:
// cuándo "Otra" avanza por lo ya visto y cuándo consume de la cola, cuándo
// aparece "Atrás", y qué se guarda para restaurar al volver de una ficha. Un
// componente con `useState` no se puede probar sin DOM; esto sí.
//
// ============================================================================
// 🔴 "OTRA" NO SIEMPRE CONSUME DE LA COLA
// ============================================================================
// Si el usuario retrocedió, "Otra" tiene que RE-AVANZAR por lo que ya vio antes
// de tocar la cola. Si no, retroceder una vez y adelantar otra le daría un
// título distinto del que acababa de ver, y el historial dejaría de ser un
// historial. La cola sólo se toca cuando la posición ya está en el final.
//
// Consecuencia directa, y es la que importa para el costo: **moverse por el
// historial no genera una sola llamada de red**. Sólo agotar la cola pide otra
// tanda, exactamente igual que antes de este cambio.
import type { Escenario, RoulettePick } from "./roulette.ts";

/** Una sesión de ruleta abierta: lo que se vio, dónde está parado y qué queda. */
export interface SesionRuleta {
  escenario: Escenario;
  /** Todo lo que se mostró, en orden. Nunca se achica al retroceder. */
  historial: RoulettePick[];
  /** Índice dentro de `historial` de lo que se está viendo. */
  pos: number;
  /** Lo que ya se trajo de la API y todavía no se mostró. */
  cola: RoulettePick[];
}

/** Qué pasó al pedir "Otra". */
export type ResultadoOtra =
  /** Se avanzó por el historial. **No hay que pedir nada ni marcar nada.** */
  | { tipo: "historial"; sesion: SesionRuleta }
  /** Salió de la cola: es la primera vez que se muestra, hay que marcarlo. */
  | { tipo: "cola"; sesion: SesionRuleta; nuevo: RoulettePick }
  /** La cola se agotó: el llamador tiene que pedir otra tanda. */
  | { tipo: "agotada" };

/** Saca de `picks` lo que ya está en el historial o en la cola. */
function sinRepetidos(picks: RoulettePick[], sesion: SesionRuleta | null): RoulettePick[] {
  const vistos = new Set<number>();
  if (sesion) {
    for (const p of sesion.historial) vistos.add(p.id);
    for (const p of sesion.cola) vistos.add(p.id);
  }
  const salida: RoulettePick[] = [];
  for (const p of picks) {
    if (vistos.has(p.id)) continue;
    vistos.add(p.id);   // también deduplica dentro de la propia tanda
    salida.push(p);
  }
  return salida;
}

/**
 * Arranca una sesión con la primera tanda.
 *
 * El primero pasa a ser la recomendación visible y el resto queda en la cola,
 * que es exactamente lo que hacía el componente antes. Lo nuevo es que ese
 * primero queda ADEMÁS anotado en el historial, en la posición 0.
 */
export function iniciar(escenario: Escenario, picks: RoulettePick[]): SesionRuleta | null {
  const limpios = sinRepetidos(picks, null);
  if (!limpios.length) return null;
  const [primero, ...resto] = limpios;
  return { escenario, historial: [primero], pos: 0, cola: resto };
}

/** Lo que se está viendo. */
export function actual(s: SesionRuleta): RoulettePick | null {
  return s.historial[s.pos] ?? null;
}

/**
 * ¿Se puede volver?
 *
 * En la PRIMERA recomendación no, y por eso el botón no se dibuja: un "Atrás"
 * deshabilitado en el primer uso es un control que no explica nada.
 */
export function puedeVolver(s: SesionRuleta): boolean {
  return s.pos > 0;
}

/** Retrocede una posición. Si ya está en la primera, no hace nada. */
export function atras(s: SesionRuleta): SesionRuleta {
  return s.pos > 0 ? { ...s, pos: s.pos - 1 } : s;
}

/**
 * Avanza: primero por el historial ya visto, y recién después por la cola.
 *
 * ⚠️ NO agrega nada a `yump:ruleta-mostrados` cuando avanza por el historial —
 * eso ya se marcó la primera vez. El llamador sólo marca en el caso `cola`.
 */
export function otra(s: SesionRuleta): ResultadoOtra {
  if (s.pos < s.historial.length - 1) {
    return { tipo: "historial", sesion: { ...s, pos: s.pos + 1 } };
  }
  if (s.cola.length) {
    const [siguiente, ...resto] = s.cola;
    return {
      tipo: "cola",
      sesion: { ...s, historial: [...s.historial, siguiente], pos: s.historial.length, cola: resto },
      nuevo: siguiente,
    };
  }
  return { tipo: "agotada" };
}

/**
 * Suma una tanda nueva a una sesión viva y avanza a su primer título.
 *
 * Es lo que corresponde después de un `{ tipo: "agotada" }`: la sesión sigue
 * siendo la misma —el historial no se pierde— y lo que llega se apila detrás.
 * Los repetidos se descartan contra historial Y cola.
 */
export function sumarTanda(s: SesionRuleta, picks: RoulettePick[]): ResultadoOtra {
  const nuevos = sinRepetidos(picks, s);
  if (!nuevos.length) return { tipo: "agotada" };
  const [primero, ...resto] = nuevos;
  return {
    tipo: "cola",
    sesion: { ...s, historial: [...s.historial, primero], pos: s.historial.length, cola: resto },
    nuevo: primero,
  };
}

// ============================================================================
// Lo que se guarda para restaurar al volver de una ficha
// ============================================================================

/**
 * El estado de la ruleta que sobrevive a ir a una ficha y volver.
 *
 * 🔴 EL ESCENARIO VA ACÁ ADENTRO, NO EN LA FIRMA DEL SNAPSHOT. La regla del
 * almacén (`hooks/lista-paginada-store.ts`) es que lo que se RESTAURA no puede
 * estar en la firma: si estuviera, montar el Home con la ruleta cerrada daría
 * una firma distinta de la guardada y el snapshot se borraría antes de que
 * nadie pudiera leerlo. En la firma va sólo lo que obliga a tirar todo, que son
 * las plataformas.
 */
export interface EstadoRuleta {
  abierto: boolean;
  sesion: SesionRuleta | null;
}

/** ¿Vale la pena guardar este estado? Sin sesión no hay nada que restaurar. */
export function valeGuardar(e: EstadoRuleta): boolean {
  return e.abierto && e.sesion !== null && e.sesion.historial.length > 0;
}

/**
 * Valida lo que vuelve del `sessionStorage`.
 *
 * No se confía en la forma: es JSON que escribió otra versión de la app, y un
 * campo de menos acá se convierte en una tarjeta rota en pantalla.
 */
export function esEstadoValido(v: unknown): v is EstadoRuleta {
  if (!v || typeof v !== "object") return false;
  const e = v as Partial<EstadoRuleta>;
  if (typeof e.abierto !== "boolean") return false;
  if (e.sesion === null || e.sesion === undefined) return e.abierto === false || e.sesion === null;
  const s = e.sesion as Partial<SesionRuleta>;
  if (typeof s.escenario !== "string") return false;
  if (!Array.isArray(s.historial) || !s.historial.length) return false;
  if (!Array.isArray(s.cola)) return false;
  if (typeof s.pos !== "number" || s.pos < 0 || s.pos >= s.historial.length) return false;
  return s.historial.every((p) => p && typeof (p as RoulettePick).id === "number");
}
