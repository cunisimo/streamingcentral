// Parser de `Retry-After` (RFC 9110 §10.2.3): segundos enteros o fecha HTTP.
// Etapa 3.a de capacidad (#19). Sin `server-only`: se prueba con `node --test`.
//
// TMDB no documenta el encabezado (developer.themoviedb.org/docs/rate-limiting,
// leído el 14/09/2026), así que no se asume su forma: lo que no se entiende es
// `null`, y "no entendí" nunca se convierte en una espera inventada.
//
// Devuelve MILISEGUNDOS a esperar, o `null`. No acota valores absurdos: eso es
// política (lib/tmdb-politica.ts), no parseo.

/** `ahora` en ms epoch; se inyecta para poder probar las fechas. */
export function parsearRetryAfter(valor: string | null | undefined, ahora: number): number | null {
  if (valor === null || valor === undefined) return null;
  const s = valor.trim();
  if (!s) return null;
  // Segundos: sólo dígitos. "5s", "1e3", "-3" o "2.5" no son la forma de la RFC.
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  // Fecha HTTP. `Date.parse` acepta IMF-fixdate; una fecha pasada es "ya".
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  const delta = t - ahora;
  return delta > 0 ? delta : null;
}
