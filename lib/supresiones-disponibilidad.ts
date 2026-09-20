// Supresiones negativas de disponibilidad: lo que TMDB AFIRMA y el dueño
// comprobó, dentro de la plataforma, que NO está.
//
// 🔴 ES LO CONTRARIO DE `excepciones-disponibilidad.ts`, Y POR ESO ES OTRO
// ARCHIVO. Las excepciones positivas sólo AGREGAN cuando TMDB no sabe nada, y
// la regla del resolvedor es que los respaldos nunca contradicen a TMDB. Esto
// sí lo contradice: resta una plataforma concreta de un título concreto. Es la
// única vía por la que la app puede decir menos que TMDB, y se aplica al FINAL
// del resolvedor, sobre cualquier procedencia.
//
// EL CASO (2026-09-20). TMDB listaba `movie:2118` (Los Ángeles al desnudo) en
// Disney+ AR; el dueño buscó en Disney+ y no está. Medido sobre 100 películas
// que TMDB ubica en Disney+ AR: 20 falsos positivos, todos licenciados (Warner,
// Fox, Universal), y 0 en 60 de Netflix. TMDB sirve el dato viejo EN VIVO —no
// es nuestro cache— y JustWatch, su fuente, ya lo corrigió. Ver
// docs/medidas/2026-09-20-disney-falsos-positivos.md e ISSUES #24.
//
// QUÉ QUITA Y QUÉ NO. Sólo la plataforma nombrada: si TMDB devuelve Disney+ y
// Paramount+, queda Paramount+. Si Disney+ era la única, el resultado visible
// queda vacío y NO se consultan respaldos: la decisión fue de TMDB y el dueño
// la corrigió; salir a inferir otra cosa sería inventar.
//
// 🔴 NO VENCE SOLA. Una supresión se levanta con una verificación positiva
// directa —el dueño vuelve a ver el título dentro de la plataforma— y nunca por
// calendario. `proximaRevision` es un recordatorio para el cruce periódico
// (mensual, desde octubre de 2026), no una fecha de caducidad: si pasa, la
// supresión sigue. Si venciera sola, el título volvería a Disney+ el día que
// nadie lo mira, que es justo el error que esto corrige.
//
// ⚠️ CADA CAMBIO EN ESTE REGISTRO EXIGE SUBIR `VERSION_DISPONIBILIDAD` Y
// `VERSION_HOME` en lib/claves.ts. Las plataformas resueltas viven en cachés
// exteriores de hasta 36 h (card, búsqueda, Top, reco, últimos y las cinco
// familias del Home); sin subir la versión, la corrección "no se ve" hasta que
// expiren. Un test ata la cantidad de entradas a la versión.
//
// ⚠️ VIVE VERSIONADO EN EL REPO, igual que las excepciones: es una decisión
// revisable, queda en el diff y no cambia sin que nadie se entere.
import type { PlatformCode } from "./types";

export interface SupresionManual {
  /** `tipo:id`, la misma clave que usa el resto de la app. */
  clave: string;
  /** Hoy siempre "AR". El campo existe para que otra región sea explícita. */
  region: string;
  /** La plataforma que se quita. Sólo ésa. */
  plataforma: PlatformCode;
  /** Cuándo se verificó, YYYY-MM-DD. */
  verificado: string;
  /** Cómo se verificó. Tiene que ser una comprobación DENTRO de la plataforma. */
  evidencia: string;
  /** Una supresión inactiva se conserva como historial y no se aplica. */
  activa: boolean;
  /** Recordatorio para el cruce periódico, YYYY-MM-DD. NO es un vencimiento. */
  proximaRevision: string;
}

// Las 20 películas que TMDB ubicaba en Disney+ AR el 2026-09-20 y el dueño
// verificó a mano dentro de Disney+ que no están. Una por línea, con el título
// al lado para que el diff se lea.
const disneyAR20260920 = (id: number): SupresionManual => ({
  clave: `movie:${id}`,
  region: "AR",
  plataforma: "d",
  verificado: "2026-09-20",
  evidencia: "verificación manual del dueño dentro de Disney+",
  activa: true,
  proximaRevision: "2026-10-20",
});

/** El registro. Ver el encabezado antes de tocarlo. */
export const SUPRESIONES: SupresionManual[] = [
  disneyAR20260920(949),     // Heat
  disneyAR20260920(281957),  // The Revenant
  disneyAR20260920(311),     // Once Upon a Time in America
  disneyAR20260920(2251),    // Unfaithful
  disneyAR20260920(787),     // Mr. & Mrs. Smith
  disneyAR20260920(194662),  // Birdman
  disneyAR20260920(10591),   // The Girl Next Door
  disneyAR20260920(49530),   // In Time
  disneyAR20260920(1645),    // A Time to Kill
  disneyAR20260920(10315),   // Fantastic Mr. Fox
  disneyAR20260920(2118),    // L.A. Confidential
  disneyAR20260920(8247),    // Jumper
  disneyAR20260920(86834),   // Noah
  disneyAR20260920(43347),   // Love & Other Drugs
  disneyAR20260920(9631),    // The Negotiator
  disneyAR20260920(634),     // Bridget Jones's Diary
  disneyAR20260920(241),     // Natural Born Killers
  disneyAR20260920(340837),  // A Cure for Wellness
  disneyAR20260920(10731),   // The Client
  disneyAR20260920(8092),    // This Boy's Life
];

/**
 * Quita de `plataformas` las que estén suprimidas para `clave` en `region`.
 *
 * Devuelve el MISMO array cuando no hay nada que quitar y una COPIA cuando sí:
 * la entrada suele ser el array que guardó el cache de `providersOf`, y
 * mutarlo le sacaría la plataforma a todas las superficies que lo comparten.
 *
 * No recibe fecha a propósito: ninguna supresión vence sola (ver encabezado).
 */
export function suprimirPlataformas(
  clave: string, region: string, plataformas: PlatformCode[],
  supresiones: SupresionManual[] = SUPRESIONES,
): PlatformCode[] {
  if (!plataformas.length) return plataformas;
  const quitar = new Set<PlatformCode>();
  for (const s of supresiones) {
    if (s.activa && s.clave === clave && s.region === region) quitar.add(s.plataforma);
  }
  if (!quitar.size || !plataformas.some((p) => quitar.has(p))) return plataformas;
  return plataformas.filter((p) => !quitar.has(p));
}
