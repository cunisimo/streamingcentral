// El texto del recordatorio: qué dice el evento que se agenda.
//
// Módulo aparte y sin imports de runtime, misma razón que `lib/busqueda-orden.ts`:
// la ruta importa `next/server` y no se puede cargar con `node --test`.
//
// LO QUE FIJA: el título que llega al `.ics` es EXACTAMENTE el que vino de la
// ficha —ya reparado por `detalleReparado`— sin re-traducir ni recortar. No hay
// una segunda fuente que pueda contradecir lo que el usuario vio.
import type { MediaType } from "./types";

export interface DatosRecordatorio {
  titulo: string;
  fecha: string;
  season: number | null;
  episode: number | null;
  premiere: boolean;
}

// Para series el dueño pidió NO agendar recurrencias: cada toque agenda un solo
// evento, sea el estreno de temporada o el episodio suelto.
export function resumen(
  d: DatosRecordatorio, tipo: MediaType, plataforma: string | null,
): string {
  const donde = plataforma ? ` en ${plataforma}` : "";
  if (tipo === "movie") return `${d.titulo} — estreno${donde}`;
  if (d.premiere && d.season) return `${d.titulo} — estrena la temporada ${d.season}${donde}`;
  if (d.season && d.episode) return `${d.titulo} — T${d.season} E${d.episode}${donde}`;
  return `${d.titulo} — nuevo episodio${donde}`;
}
