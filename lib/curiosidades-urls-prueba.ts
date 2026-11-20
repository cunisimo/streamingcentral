// URLs de fuente con su veredicto esperado. Las usan el test unitario
// (lib/curiosidades-nucleo.test.ts, contra `urlFuenteValida`) y la batería local
// (scripts/sabias-que/pruebas-local.mjs, contra el CHECK de la migración 025):
// así la regla de la app y la de la base no pueden divergir sin que falle algo.
export const URLS: Array<[string, boolean]> = [
  ["https://es.wikipedia.org/wiki/Volver_al_futuro", true],
  ["http://example.com", true],
  ["https://sub.example.com.ar:8443/a/b?c=1#d", true],
  ["javascript:alert(1)", false],
  ["JAVASCRIPT:alert(1)", false],
  ["data:text/html,<b>x</b>", false],
  ["ftp://example.com/x", false],
  ["https://usuario@example.com/", false],
  ["https://usuario:clave@example.com/", false],
  ["http://localhost:3000", false],
  ["https://example", false],
  ["https://example.com/ con espacio", false],
  ["//example.com", false],
  ["example.com", false],
  ["", false],
];
