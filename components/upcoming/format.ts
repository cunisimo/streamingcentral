// Helpers de presentación de la Agenda de Estrenos (reutilizables por el futuro
// Planner). Sin dependencias de la UI.

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// "2026-08-28" -> "28 Ago". Se parsea a mano para evitar el corrimiento de día
// que provoca new Date("YYYY-MM-DD") por interpretarlo en UTC.
export function formatReleaseDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${d} ${MONTHS[m - 1] ?? ""}`.trim();
}
