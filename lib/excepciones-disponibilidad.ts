// Registro manual de disponibilidad verificada a mano.
//
// La última prioridad del resolvedor (`lib/disponibilidad.ts`): sólo se mira
// cuando TMDB no sabe nada, el top oficial no dice nada y la evidencia de enlace
// oficial tampoco alcanzó.
//
// 🔴 ESTÁ VACÍO A PROPÓSITO, y el caso testigo NO va acá. `tv:275224` se resuelve
// por la regla general (red + enlace oficial + estrenada + sin contradicción);
// meterlo como excepción sería tapar el problema con un parche de un solo
// título y dejar rotos los otros diez de la misma medición. Hay un test que
// falla si alguien lo agrega.
//
// CUÁNDO SÍ corresponde una entrada acá: un título que se verificó a mano en la
// plataforma —no en JustWatch, no "me suena"— y que ninguna regla general puede
// cubrir sin volverse insegura. Es la salida de emergencia, no el mecanismo.
//
// ⚠️ VIVE VERSIONADO EN EL REPO, no en Supabase. Para esta primera versión no se
// crea infraestructura en la base: una excepción es una decisión revisable, y
// como archivo queda en el historial, se revisa en el diff y no puede cambiar
// sin que nadie se entere.
import type { PlatformCode } from "./types";

export interface ExcepcionManual {
  /** `tipo:id`, la misma clave que usa el resto de la app. */
  clave: string;
  plataforma: PlatformCode;
  /** Hoy siempre "AR". El campo existe para que agregar otra región sea explícito. */
  region: string;
  /** Dónde se verificó. URL https. */
  fuente: string;
  /** Cuándo se verificó, YYYY-MM-DD. */
  verificado: string;
  /**
   * Cuándo deja de valer, YYYY-MM-DD. **Obligatorio.**
   *
   * Sin vencimiento, una excepción sobrevive al motivo que la creó: el título se
   * va de la plataforma y la app sigue afirmando que está. Vencida se ignora
   * sola y el título vuelve a decidirse por las reglas generales.
   */
  vence: string;
}

/** Las excepciones vigentes. Ver el encabezado antes de agregar una. */
export const EXCEPCIONES: ExcepcionManual[] = [];
