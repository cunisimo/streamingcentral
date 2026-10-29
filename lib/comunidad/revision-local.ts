// Guarda de la página de revisión local de reseñas (app/revision-local/
// comunidad, E3a). Sólo fuera de producción Y con COMUNIDAD_REVISION_LOCAL=1,
// que vive únicamente en .env.comunidad-local (ignorado por Git).
export function revisionLocalHabilitada(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" && env.COMUNIDAD_REVISION_LOCAL === "1";
}
