import { wrapDisc } from "./face";

// Ícono de persona neutro — no pertenece a ninguna saga. Es el fallback de
// cualquier id desconocido y el avatar inicial de un usuario nuevo.
export const DEFAULT_SVG = wrapDisc(
  "#3a3f47",
  `<circle cx="50" cy="40" r="15" fill="#c9ced6"/>` +
  `<path d="M22 92c0-18 12-28 28-28s28 10 28 28z" fill="#c9ced6"/>`
);

// Icónicos: no salen del constructor humano (silueta droide/casco/calvo) pero
// usan el mismo lienzo y disco para no romper la unidad del set.

// C3PO — cabeza de droide dorada.
export const SW_C3PO = wrapDisc(
  "#4a4636",
  `<path d="M20 100c0-16 13-24 30-24s30 8 30 24z" fill="#8a7a2a"/>` +
  `<ellipse cx="50" cy="44" rx="17" ry="21" fill="#e8b923"/>` +
  `<ellipse cx="50" cy="44" rx="17" ry="21" fill="none" stroke="#b8901a" stroke-width="1.5"/>` +
  `<circle cx="43" cy="43" r="4.5" fill="#2a2a2a"/><circle cx="57" cy="43" r="4.5" fill="#2a2a2a"/>` +
  `<circle cx="43" cy="43" r="2" fill="#fff6cf"/><circle cx="57" cy="43" r="2" fill="#fff6cf"/>` +
  `<path d="M44 58h12M46 62h8" stroke="#8a6a12" stroke-width="2" stroke-linecap="round"/>` +
  `<path d="M50 24v-6" stroke="#b8901a" stroke-width="2"/>`
);

// Darth Vader — casco negro sobre disco claro para que la silueta contraste.
export const SW_VADER = wrapDisc(
  "#484d55",
  `<path d="M20 100c0-16 13-24 30-24s30 8 30 24z" fill="#0d0d0f"/>` +
  `<path d="M32 42c0-16 36-16 36 0 0 14-4 22-8 30-3 6-17 6-20 0-4-8-8-16-8-30z" fill="#17181b" stroke="#6a7078" stroke-width="1.5"/>` +
  `<path d="M32 42c0-16 36-16 36 0h-36z" fill="#26282c"/>` +
  `<path d="M34 40c1-8 30-8 32 0" fill="none" stroke="#5a606a" stroke-width="1.5"/>` +
  `<path d="M40 44l7 6-7 6zM60 44l-7 6 7 6z" fill="#0a0a0a" stroke="#3a3f47" stroke-width="1"/>` +
  `<path d="M46 58h8l-2 11h-4z" fill="#0a0a0a" stroke="#3a3f47" stroke-width="1"/>` +
  `<path d="M47 61h6M47 64h6M48 67h4" stroke="#4a4f57" stroke-width="1"/>`
);

// Voldemort — calvo pálido, sin nariz.
export const HP_VOLDEMORT = wrapDisc(
  "#20262a",
  `<path d="M20 100c0-16 13-24 30-24s30 8 30 24z" fill="#1a1f22"/>` +
  `<ellipse cx="50" cy="44" rx="18" ry="21" fill="#dfe4e0"/>` +
  `<path d="M30 40c2-16 38-16 40 0-6-8-34-8-40 0z" fill="#dfe4e0"/>` +
  `<path d="M40 45l5 2-5 2zM60 45l-5 2 5 2z" fill="#1c1c1c"/>` +
  `<path d="M48 50l-2 5h8l-2-5" fill="none" stroke="#9aa0a0" stroke-width="1.5"/>` +
  `<path d="M45 60h10" stroke="#7a1f1f" stroke-width="2" stroke-linecap="round"/>`
);

// Sauron — casco oscuro con hendidura y ojo de fuego.
export const LOTR_SAURON = wrapDisc(
  "#161013",
  `<path d="M20 100c0-16 13-24 30-24s30 8 30 24z" fill="#0d0a0c"/>` +
  `<path d="M34 40c0-18 32-18 32 0 0 16-6 30-16 30s-16-14-16-30z" fill="#26202a"/>` +
  `<path d="M50 18l4 24h-8z" fill="#0d0a0c"/>` +
  `<path d="M40 46q10 -6 20 0-10 6-20 0z" fill="#ff7a1a"/>` +
  `<circle cx="50" cy="46" r="3" fill="#ffd089"/>`
);

// Gandalf — barba gris larga + sombrero puntudo.
export const LOTR_GANDALF = wrapDisc(
  "#4a5a63",
  `<path d="M20 100c0-16 13-24 30-24s30 8 30 24z" fill="#8a9aa0"/>` +
  `<path d="M33 50c1 30 4 44 17 44s16-14 17-44c-2 16-32 16-34 0z" fill="#d7dde0"/>` +
  `<ellipse cx="50" cy="46" rx="16" ry="18" fill="#e8c9a8"/>` +
  `<circle cx="44" cy="46" r="2.2" fill="#1c1c1c"/><circle cx="56" cy="46" r="2.2" fill="#1c1c1c"/>` +
  `<path d="M34 44c2-4 10-4 12 0M54 44c2-4 10-4 12 0" stroke="#d7dde0" stroke-width="2" fill="none"/>` +
  `<path d="M30 40c0-14 40-14 40 0-6-4-10-2-20-2s-14-2-20 2z" fill="#d7dde0"/>` +
  `<path d="M50 -2 26 40c14-7 34-7 48 0z" fill="#9aa7ad"/>`
);
