// Combina las reglas en una decisión (revisión §3.3). Punto de entrada del
// módulo: `evaluarResena` y `evaluarNombre`.
//
// 🔴 UN FALLO NUNCA APRUEBA. Si el plegado o cualquier regla lanza, devuelve
// algo que no sea un disparo válido, o no corrieron todas las reglas, el
// resultado es `error`. No existe un camino por defecto que devuelva
// `publicar`: sólo se publica cuando TODAS las reglas corrieron y ninguna se
// disparó. Quien llame tiene que publicar únicamente ante `"publicar"`.

import { MAX_TEXTOS_RECIENTES } from "./listas.ts";
import { plegar as plegarReal } from "./plegado.ts";
import { REGLAS_NOMBRE, REGLAS_RESENA } from "./reglas.ts";
import { PRIORIDAD } from "./tipos.ts";
import type { ContextoResena, Decision, Plegado, Regla, ReglaDisparada, Resultado, ResultadoRegla } from "./tipos.ts";
import { VERSION_REGLAS } from "./version.ts";

export const MOTIVO_ERROR = "No pudimos revisar el texto. Probá de nuevo.";
export const MOTIVO_RETENCION_RESENA = "Tu reseña quedó en revisión. Te vamos a avisar cuando se resuelva.";
export const MOTIVO_RETENCION_NOMBRE = "Tu nombre quedó en revisión. Mientras tanto se muestra el anterior.";

const RESULTADOS_REGLA: ReadonlySet<string> = new Set<ResultadoRegla>(["retener", "rechazo_formato", "rechazo_contenido"]);

export interface Dependencias {
  plegar: (texto: string) => Plegado;
}

const DEPENDENCIAS: Dependencias = { plegar: plegarReal };

function error(): Decision {
  return { resultado: "error", versionReglas: VERSION_REGLAS, disparadas: [], motivoUsuario: MOTIVO_ERROR };
}

/** El núcleo, con las reglas inyectables (las pruebas de fallo lo usan así). */
export function evaluarCon<C>(
  texto: string,
  contexto: C,
  reglas: readonly Regla<C>[],
  motivoRetencion: string,
  deps: Dependencias = DEPENDENCIAS,
): Decision {
  try {
    if (reglas.length === 0) return error();
    const plegado = deps.plegar(texto);
    const disparadas: (ReglaDisparada & { motivo: string })[] = [];
    let corridas = 0;
    for (const regla of reglas) {
      const d = regla.evaluar(plegado, contexto);
      corridas++;
      if (d === null) continue;
      if (typeof d !== "object" || !RESULTADOS_REGLA.has(d.resultado) || typeof d.motivo !== "string" || d.motivo === "") {
        return error();
      }
      disparadas.push({ regla: regla.id, version: regla.version, resultado: d.resultado, motivo: d.motivo });
    }
    if (corridas !== reglas.length) return error();

    let resultado: Resultado = "publicar";
    for (const d of disparadas) if (PRIORIDAD[d.resultado] > PRIORIDAD[resultado]) resultado = d.resultado;

    let motivoUsuario = "";
    if (resultado === "retener") motivoUsuario = motivoRetencion;
    else if (resultado !== "publicar") {
      motivoUsuario = [...new Set(disparadas.filter((d) => d.resultado === resultado).map((d) => d.motivo))].join(" ");
    }
    return {
      resultado,
      versionReglas: VERSION_REGLAS,
      disparadas: disparadas.map(({ regla, version, resultado: r }) => ({ regla, version, resultado: r })),
      motivoUsuario,
    };
  } catch {
    return error();
  }
}

function contextoValido(c: unknown): c is ContextoResena {
  if (typeof c !== "object" || c === null) return false;
  const t = (c as { textosRecientes?: unknown }).textosRecientes;
  return Array.isArray(t) && t.length <= MAX_TEXTOS_RECIENTES && t.every((x) => typeof x === "string");
}

/**
 * Reseña nueva o edición. `contexto` es obligatorio y explícito: lo arma quien
 * llama con hasta 3 textos de la misma cuenta en 24 h. Uno inválido es `error`.
 */
export function evaluarResena(texto: string, contexto: ContextoResena, deps?: Dependencias): Decision {
  if (!contextoValido(contexto)) return error();
  return evaluarCon(texto, contexto, REGLAS_RESENA, MOTIVO_RETENCION_RESENA, deps);
}

/** Nombre comunitario. */
export function evaluarNombre(nombre: string, deps?: Dependencias): Decision {
  return evaluarCon<unknown>(nombre, undefined, REGLAS_NOMBRE, MOTIVO_RETENCION_NOMBRE, deps);
}
