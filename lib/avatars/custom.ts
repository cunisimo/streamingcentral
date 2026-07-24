import { wrapDisc } from "./face";

// Ícono de persona neutro — no pertenece a ninguna saga. Es el fallback de
// cualquier id desconocido y el avatar inicial de un usuario nuevo.
export const DEFAULT_SVG = wrapDisc(
  "#3a3f47",
  `<circle cx="50" cy="40" r="15" fill="#c9ced6"/>` +
  `<path d="M22 92c0-18 12-28 28-28s28 10 28 28z" fill="#c9ced6"/>`
);
