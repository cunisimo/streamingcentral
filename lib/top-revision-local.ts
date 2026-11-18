// Guarda del banco local del Top (app/revision-local/top). Sólo fuera de
// producción Y con TOP_REVISION_LOCAL=1, que no se documenta en
// .env.local.example ni se configura en Vercel. Mismo criterio que
// `revisionLocalHabilitada` de las reseñas (lib/comunidad/revision-local.ts).
export function bancoTopHabilitado(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production" && env.TOP_REVISION_LOCAL === "1";
}
