// UN instante por solicitud del Home, y todo lo que depende del día sale de él.
// Etapa 2 de capacidad (#17), auditoría final de Codex sobre 82842a5.
//
// `homePayload` consultaba el reloj tres veces (`dailySeed()` para la clave del
// vuelo, otro `dailySeed()` para las cinco claves del contexto, `hoyAR()` para
// el día de la generación). Con la medianoche argentina entre dos de esas
// lecturas, la clave de coordinación, la fresca/turno/degradado y el `dia`
// podían pertenecer a días distintos: dos solicitudes del mismo instante con
// claves distintas esquivan el single-flight, los logs mienten y el fencing
// diario —lo que la Etapa 2 protege justo en ese límite— se debilita.
//
// Acá: `instanteHome()` captura el día argentino UNA vez y deriva su semilla
// (`semillaDeDia`, la misma cuenta de `dailySeed`); `clavesDelHome(instante,…)`
// construye las cinco claves con ESA semilla y devuelve el día junto con ellas,
// así que la clave del vuelo es `claves.fresca` y el `dia` de la generación
// viaja en el mismo contexto. Sin fecha, `hoyAR()` a secas honra `YUMP_FECHA`
// (E-medianoche del banco). Módulo puro: se prueba forzando el cruce de
// medianoche con fechas dadas (lib/home-instante.test.ts).
// Extensiones explícitas: este módulo se ejecuta desde `node --test` (como lib/home-servir.ts).
import { claveHome, claveHomeDegradado, claveHomeGeneracion, claveHomeUltimoBueno, claveTurnoHome } from "./claves.ts";
import type { ClaveLocalizada } from "./claves.ts";
import { hoyAR, semillaDeDia } from "./fecha.ts";
import { HUELLA_IDIOMA } from "./idioma.ts";

export interface InstanteHome {
  /** El día argentino en el que ENTRÓ la solicitud, `YYYY-MM-DD`. */
  dia: string;
  /** La semilla de ese día: la de `dailySeed()` en ese instante. */
  semilla: number;
}

/** Captura el instante. Sin `ahora`, es el día de hoy (o el forzado en el banco). */
export function instanteHome(ahora?: Date): InstanteHome {
  const dia = hoyAR(ahora);
  return { dia, semilla: semillaDeDia(dia) };
}

/** Las cinco claves de una combinación, más el día y la semilla de las que salen. */
export interface ClavesDelHome {
  fresca: ClaveLocalizada;
  ub: ClaveLocalizada;
  gen: string;
  degradado: ClaveLocalizada;
  turno: string;
  dia: string;
  semilla: number;
}

/**
 * Las cinco claves de UNA combinación (providers y tipos ya canónicos, ver
 * lib/canonizar-home.ts), derivadas del instante: la fresca de siempre, el
 * último bueno y su generación (sin semilla: sobreviven a la medianoche), el
 * degradado compartido y el turno (con semilla: son de la composición de UNA
 * fresca). La huella de idioma va adentro de cada clave (lib/claves.ts).
 */
export function clavesDelHome(instante: InstanteHome, providers: string, tipos: string): ClavesDelHome {
  return {
    fresca: claveHome(instante.semilla, providers, tipos, HUELLA_IDIOMA),
    ub: claveHomeUltimoBueno(providers, tipos, HUELLA_IDIOMA),
    gen: claveHomeGeneracion(providers, tipos, HUELLA_IDIOMA),
    degradado: claveHomeDegradado(instante.semilla, providers, tipos, HUELLA_IDIOMA),
    turno: claveTurnoHome(instante.semilla, providers, tipos, HUELLA_IDIOMA),
    dia: instante.dia,
    semilla: instante.semilla,
  };
}
