// El motivo de una respuesta de error de nuestras rutas, leído del cuerpo.
// Etapa 3.a (#19, H8): `useApi` lo expone para que una vista distinga "TMDB no
// responde" de "sin conexión" y de "no existe". Puro y sin DOM: se prueba con
// `node --test`, como el resto de la lógica de hooks de este proyecto.
//
// Sólo se reconoce en respuestas NO ok y sólo los motivos que las rutas
// emiten a propósito (lib/tmdb-http.ts). Un `error` con texto libre —el
// `String(e)` de siempre— no es un motivo: es `null`, y la vista muestra lo de
// siempre.
export type MotivoApi = "tmdb-no-disponible" | "no-encontrado";

const MOTIVOS: ReadonlySet<string> = new Set<MotivoApi>(["tmdb-no-disponible", "no-encontrado"]);

export function motivoDeRespuesta(ok: boolean, body: unknown): MotivoApi | null {
  if (ok || !body || typeof body !== "object") return null;
  const error = (body as { error?: unknown }).error;
  return typeof error === "string" && MOTIVOS.has(error) ? (error as MotivoApi) : null;
}
