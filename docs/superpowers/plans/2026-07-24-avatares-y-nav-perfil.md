# Avatares de personajes + reacomodo de nav y perfil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los avatares DiceBear por un set unificado de 24 avatares SVG de personajes (4 sagas × 6) + 1 por defecto, e intercambiar el ícono de perfil (al BottomNav) con la lupa de búsqueda (al TopBar), con ajustes de aire e íconos en el hub de usuario.

**Architecture:** Los avatares humanos se generan con un constructor paramétrico único (`lib/avatars/face.ts`) sobre un lienzo 100×100 con disco circular; los no-humanos/icónicos son SVG a medida sobre el mismo lienzo. Un manifest (`lib/avatars/index.ts`) mapea id→avatar y `lib/avatar.ts` resuelve `avatarSvg(id)` con fallback al por defecto. La UI (TopBar, BottomNav, UserHub, AvatarPicker) consume ese contrato.

**Tech Stack:** Next.js 14 App Router, TypeScript, React (client components), CSS plano en `app/globals.css`. Sin librerías nuevas; se elimina `@dicebear/*`.

## Global Constraints

- **Verificación del proyecto:** no hay test runner. Cada task se valida con `npx tsc --noEmit` (0 errores) y chequeo visual con `npx next build && npx next start` o `npm run dev`. Copiado del CLAUDE.md.
- **Sin cara real de actores/personajes.** Solo ilustraciones SVG originales que evocan por silueta + rasgo. Restricción legal aceptada por el dueño.
- **Un único sistema visual para los 25 avatares:** mismo lienzo `viewBox="0 0 100 100"`, disco circular de fondo, formas planas sin gradientes, mismo encuadre y proporción de rostro. El color diferencia personajes, no el estilo de dibujo.
- **Sin cambio de schema.** `profiles.avatar_seed` sigue siendo `string`; ahora guarda un id de personaje (ej. `hp-harry`). Un id desconocido (incluye seeds DiceBear viejas) cae al avatar por defecto.
- **Fuera de alcance:** rutas API, Supabase/schema, Service Worker, manifest PWA.
- **Texto de UI en español rioplatense. CSS solo en `app/globals.css`, reusando clases existentes antes de crear nuevas.**
- **Rama de trabajo:** `feat/avatares-nav-perfil` (ya creada, con el spec commiteado).

---

## File Structure

- `lib/avatars/face.ts` (nuevo) — constructor paramétrico de rostros humanos + wrapper de disco. Una responsabilidad: convertir params → string SVG.
- `lib/avatars/custom.ts` (nuevo) — SVG a medida de los no-humanos/icónicos (default, C3PO, Vader, Voldemort, Sauron, Gandalf), sobre el mismo wrapper.
- `lib/avatars/index.ts` (nuevo) — tipos `Saga`/`CharAvatar`, `SAGAS`, `AVATARS`, `DEFAULT_AVATAR_ID`, mapa `byId`.
- `lib/avatar.ts` (modificar) — `avatarSvg(id)` sobre el manifest, sin DiceBear; se elimina `randomSeed`.
- `components/AvatarPicker.tsx` (modificar) — grid agrupado por saga.
- `components/TopBar.tsx` (modificar) — lupa arriba a la derecha; se quita el bloque de cuenta.
- `components/BottomNav.tsx` (modificar) — 5º ítem "Cuenta" con avatar/persona según auth.
- `components/UserHub.tsx` (modificar) — lápiz/tuerca en vez de texto.
- `app/globals.css` (modificar) — aire del topbar, header del hub, estilos de picker por saga e íconos del hub.
- `package.json` (modificar) — quitar `@dicebear/collection` y `@dicebear/core`.

Orden de tasks: primero el sistema de datos (1-3), luego la UI que lo consume (4-7), y limpieza final (8).

---

### Task 1: Constructor de rostros + wrapper de disco + avatar por defecto

**Files:**
- Create: `lib/avatars/face.ts`
- Create: `lib/avatars/custom.ts`

**Interfaces:**
- Produces:
  - `wrapDisc(bg: string, inner: string): string` — envuelve markup en `<svg viewBox="0 0 100 100">` con un `<circle cx=50 cy=50 r=50 fill=bg>` de fondo; retorna el string SVG completo.
  - `faceSvg(o: FaceOpts): string` — rostro humano plano completo (string SVG).
  - `type FaceOpts` (ver Step 1).
  - `DEFAULT_SVG: string` — ícono de persona neutro (no-saga).

- [ ] **Step 1: Crear `lib/avatars/face.ts` con el wrapper y el constructor**

```ts
// Constructor paramétrico de avatares humanos planos. Todos comparten el mismo
// lienzo 100x100, disco de fondo y encuadre de rostro; sólo cambian los params.
// Esto garantiza por construcción que todos los avatares humanos sean del mismo
// sistema visual (requisito del dueño).

export type Hair =
  | "none" | "buzz" | "short" | "swoop" | "long" | "bob" | "bun";
export type Beard = "none" | "stubble" | "full" | "long" | "goatee";
export type Headwear = "none" | "wizard" | "hood";

export type FaceOpts = {
  bg: string;                 // color del disco de fondo
  skin: string;               // relleno del rostro
  hair?: Hair;                // estilo de pelo (default "short")
  hairColor?: string;         // color de pelo (default "#2b2b2b")
  beard?: Beard;              // vello facial (default "none")
  beardColor?: string;        // color de barba (default = hairColor)
  glasses?: boolean;          // anteojos redondos
  glassesColor?: string;      // marco de anteojos (default "#222")
  headwear?: Headwear;        // sombrero (default "none")
  headwearColor?: string;     // color del sombrero (default "#555")
  accent?: string;            // color de la remera/hombros (default "#3a3f47")
  extra?: string;             // markup SVG crudo extra (cicatriz, etc.)
};

export function wrapDisc(bg: string, inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<circle cx="50" cy="50" r="50" fill="${bg}"/>` +
    inner +
    `</svg>`;
}

function hairMarkup(style: Hair, color: string): string {
  switch (style) {
    case "none": return "";
    case "buzz": return `<path d="M30 40a20 20 0 0 1 40 0v-2a20 20 0 0 0-40 0z" fill="${color}"/>`;
    case "short": return `<path d="M29 42c0-16 42-16 42 0 0-6-4-16-21-16S29 36 29 42z" fill="${color}"/>`;
    case "swoop": return `<path d="M29 42c0-18 40-18 42-2-6-8-14-6-24-4-6 1-10 0-18 6z" fill="${color}"/>`;
    case "long": return `<path d="M27 44c0-20 46-20 46 0v20l-6-4V44c0-12-34-12-34 0v16l-6 4z" fill="${color}"/>`;
    case "bob": return `<path d="M27 46c0-20 46-20 46 0v14l-7-3V44c0-10-32-10-32 0v13l-7 3z" fill="${color}"/>`;
    case "bun": return `<g fill="${color}"><circle cx="50" cy="20" r="7"/><path d="M30 42c0-16 40-16 40 0 0-8-4-14-20-14s-20 6-20 14z"/></g>`;
  }
}

function beardMarkup(style: Beard, color: string): string {
  switch (style) {
    case "none": return "";
    case "stubble": return `<path d="M34 54c4 12 28 12 32 0-2 10-30 10-32 0z" fill="${color}" opacity=".35"/>`;
    case "full": return `<path d="M33 50c2 18 32 18 34 0-1 12-6 20-17 20s-16-8-17-20z" fill="${color}"/>`;
    case "long": return `<path d="M33 50c1 26 4 40 17 40s16-14 17-40c-2 16-32 16-34 0z" fill="${color}"/>`;
    case "goatee": return `<path d="M44 60c2 6 10 6 12 0-1 8-11 8-12 0z" fill="${color}"/>`;
  }
}

function headwearMarkup(style: Headwear, color: string): string {
  switch (style) {
    case "none": return "";
    case "wizard": return `<path d="M50 2 34 34c10-5 22-5 32 0z" fill="${color}"/>`;
    case "hood": return `<path d="M24 46c0-26 52-26 52 0-6-14-46-14-52 0z" fill="${color}"/>`;
  }
}

export function faceSvg(o: FaceOpts): string {
  const hair = o.hair ?? "short";
  const hairColor = o.hairColor ?? "#2b2b2b";
  const beard = o.beard ?? "none";
  const beardColor = o.beardColor ?? hairColor;
  const accent = o.accent ?? "#3a3f47";
  const glassesColor = o.glassesColor ?? "#222";

  const shoulders = `<path d="M20 100c0-16 13-24 30-24s30 8 30 24z" fill="${accent}"/>`;
  const head = `<ellipse cx="50" cy="46" rx="18" ry="20" fill="${o.skin}"/>`;
  const ears = `<circle cx="31" cy="47" r="4" fill="${o.skin}"/><circle cx="69" cy="47" r="4" fill="${o.skin}"/>`;
  const eyes = `<circle cx="43" cy="46" r="2.4" fill="#1c1c1c"/><circle cx="57" cy="46" r="2.4" fill="#1c1c1c"/>`;
  const brows = `<path d="M39 40h8M53 40h8" stroke="${hairColor}" stroke-width="2" stroke-linecap="round"/>`;
  const nose = `<path d="M50 48v5" stroke="#00000022" stroke-width="2" stroke-linecap="round"/>`;
  const mouth = `<path d="M45 57c3 3 7 3 10 0" stroke="#00000055" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  const glasses = o.glasses
    ? `<g fill="none" stroke="${glassesColor}" stroke-width="2"><circle cx="43" cy="46" r="6"/><circle cx="57" cy="46" r="6"/><path d="M49 46h2M63 45l4-2M37 45l-4-2"/></g>`
    : "";

  const inner =
    shoulders +
    beardMarkup(beard, beardColor) +   // barba detrás del mentón
    ears + head +
    eyes + brows + nose + mouth +
    (beard === "full" || beard === "long" ? "" : "") +
    hairMarkup(hair, hairColor) +
    glasses +
    headwearMarkup(o.headwear ?? "none", o.headwearColor ?? "#555") +
    (o.extra ?? "");

  return wrapDisc(o.bg, inner);
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: PASS (0 errores). Si falla por un `switch` sin `default`, agregar `default: return "";` a cada helper.

- [ ] **Step 3: Crear `lib/avatars/custom.ts` con el avatar por defecto**

```ts
import { wrapDisc } from "./face";

// Ícono de persona neutro — no pertenece a ninguna saga. Es el fallback de
// cualquier id desconocido y el avatar inicial de un usuario nuevo.
export const DEFAULT_SVG = wrapDisc(
  "#3a3f47",
  `<circle cx="50" cy="40" r="15" fill="#c9ced6"/>` +
  `<path d="M22 92c0-18 12-28 28-28s28 10 28 28z" fill="#c9ced6"/>`
);
```

- [ ] **Step 4: Verificar compila y commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add lib/avatars/face.ts lib/avatars/custom.ts
git commit -m "feat(avatares): constructor de rostros + wrapper + avatar por defecto"
```

---

### Task 2: SVG a medida de los icónicos (C3PO, Vader, Voldemort, Sauron, Gandalf)

**Files:**
- Modify: `lib/avatars/custom.ts`

**Interfaces:**
- Consumes: `wrapDisc` de `lib/avatars/face.ts`.
- Produces: `SW_C3PO`, `SW_VADER`, `HP_VOLDEMORT`, `LOTR_SAURON`, `LOTR_GANDALF` (strings SVG).

- [ ] **Step 1: Agregar los 5 SVG icónicos a `lib/avatars/custom.ts`**

```ts
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

// Darth Vader — casco negro.
export const SW_VADER = wrapDisc(
  "#111317",
  `<path d="M20 100c0-16 13-24 30-24s30 8 30 24z" fill="#0a0a0a"/>` +
  `<path d="M32 42c0-16 36-16 36 0 0 14-4 22-8 30-3 6-17 6-20 0-4-8-8-16-8-30z" fill="#161616"/>` +
  `<path d="M32 42c0-16 36-16 36 0h-36z" fill="#242424"/>` +
  `<path d="M40 44l6 6-6 6zM60 44l-6 6 6 6z" fill="#0a0a0a"/>` +
  `<path d="M46 58h8l-2 10h-4z" fill="#0a0a0a"/>` +
  `<path d="M50 50v6" stroke="#000" stroke-width="2"/>`
);

// Voldemort — calvo pálido, sin nariz.
export const HP_VOLDEMORT = wrapDisc(
  "#20262a",
  `<path d="M20 100c0-16 13-24 30-24s30 8 30 24z" fill="#1a1f22"/>` +
  `<ellipse cx="50" cy="44" rx="18" ry="21" fill="#dfe4e0"/>` +
  `<path d="M30 40c2-16 38-16 40 0-6-8-34-8-40 0z" fill="#dfe4e0"/>` +
  `<path d="M40 45l5 2-5 2zM60 45l-5 2 5 2z" fill="#1c1c1c"/>` +   // ojos rasgados
  `<path d="M48 50l-2 5h8l-2-5" fill="none" stroke="#9aa0a0" stroke-width="1.5"/>` + // fosas nasales
  `<path d="M45 60h10" stroke="#7a1f1f" stroke-width="2" stroke-linecap="round"/>`
);

// Sauron — casco oscuro con hendidura y ojo de fuego.
export const LOTR_SAURON = wrapDisc(
  "#161013",
  `<path d="M20 100c0-16 13-24 30-24s30 8 30 24z" fill="#0d0a0c"/>` +
  `<path d="M34 40c0-18 32-18 32 0 0 16-6 30-16 30s-16-14-16-30z" fill="#26202a"/>` +
  `<path d="M50 18l4 24h-8z" fill="#0d0a0c"/>` +   // cresta central
  `<path d="M40 46q10 -6 20 0-10 6-20 0z" fill="#ff7a1a"/>` +
  `<circle cx="50" cy="46" r="3" fill="#ffd089"/>`
);

// Gandalf — barba gris larga + sombrero puntudo.
export const LOTR_GANDALF = wrapDisc(
  "#4a5a63",
  `<path d="M20 100c0-16 13-24 30-24s30 8 30 24z" fill="#8a9aa0"/>` +
  `<path d="M33 50c1 30 4 44 17 44s16-14 17-44c-2 16-32 16-34 0z" fill="#d7dde0"/>` + // barba
  `<ellipse cx="50" cy="46" rx="16" ry="18" fill="#e8c9a8"/>` +
  `<circle cx="44" cy="46" r="2.2" fill="#1c1c1c"/><circle cx="56" cy="46" r="2.2" fill="#1c1c1c"/>` +
  `<path d="M34 44c2-4 10-4 12 0M54 44c2-4 10-4 12 0" stroke="#d7dde0" stroke-width="2" fill="none"/>` + // cejas
  `<path d="M30 40c0-14 40-14 40 0-6-4-10-2-20-2s-14-2-20 2z" fill="#d7dde0"/>` + // pelo
  `<path d="M50 -2 26 40c14-7 34-7 48 0z" fill="#9aa7ad"/>`  // sombrero puntudo
);
```

- [ ] **Step 2: Verificar compila y commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add lib/avatars/custom.ts
git commit -m "feat(avatares): SVG icónicos (C3PO, Vader, Voldemort, Sauron, Gandalf)"
```

---

### Task 3: Manifest de avatares + `avatarSvg` sin DiceBear

**Files:**
- Create: `lib/avatars/index.ts`
- Modify: `lib/avatar.ts`

**Interfaces:**
- Consumes: `faceSvg`, `FaceOpts` de `./face`; `DEFAULT_SVG`, `SW_C3PO`, `SW_VADER`, `HP_VOLDEMORT`, `LOTR_SAURON`, `LOTR_GANDALF` de `./custom`.
- Produces:
  - `type Saga = "lotr" | "bigbang" | "starwars" | "hp"`
  - `type CharAvatar = { id: string; name: string; saga: Saga; svg: string }`
  - `SAGAS: { key: Saga; label: string }[]`
  - `AVATARS: CharAvatar[]` (24)
  - `DEFAULT_AVATAR_ID = "default"`
  - `byId: Map<string, string>` (id → svg, incluye `default`)
  - `avatarSvg(id: string): string` (en `lib/avatar.ts`, data URI; desconocido → default)

- [ ] **Step 1: Crear `lib/avatars/index.ts` con el manifest completo**

```ts
import { faceSvg } from "./face";
import {
  DEFAULT_SVG, SW_C3PO, SW_VADER, HP_VOLDEMORT, LOTR_SAURON, LOTR_GANDALF,
} from "./custom";

export type Saga = "lotr" | "bigbang" | "starwars" | "hp";
export type CharAvatar = { id: string; name: string; saga: Saga; svg: string };

export const SAGAS: { key: Saga; label: string }[] = [
  { key: "lotr", label: "El Señor de los Anillos" },
  { key: "bigbang", label: "The Big Bang Theory" },
  { key: "starwars", label: "Star Wars" },
  { key: "hp", label: "Harry Potter" },
];

export const DEFAULT_AVATAR_ID = "default";

export const AVATARS: CharAvatar[] = [
  // El Señor de los Anillos
  { id: "lotr-gandalf", name: "Gandalf", saga: "lotr", svg: LOTR_GANDALF },
  { id: "lotr-gimli", name: "Gimli", saga: "lotr",
    svg: faceSvg({ bg: "#5a3a24", skin: "#e2b48c", hair: "long", hairColor: "#a63d1e", beard: "long", accent: "#6b4a2a" }) },
  { id: "lotr-legolas", name: "Legolas", saga: "lotr",
    svg: faceSvg({ bg: "#3f5a3f", skin: "#f0d6bf", hair: "long", hairColor: "#e8d9a0", accent: "#4a6a4a" }) },
  { id: "lotr-frodo", name: "Frodo", saga: "lotr",
    svg: faceSvg({ bg: "#4a6a4a", skin: "#f0d6bf", hair: "short", hairColor: "#5a3a2a", accent: "#6b5a3a" }) },
  { id: "lotr-sam", name: "Sam", saga: "lotr",
    svg: faceSvg({ bg: "#7a6a3a", skin: "#f0d0b0", hair: "swoop", hairColor: "#b06a2a", accent: "#8a6a3a" }) },
  { id: "lotr-sauron", name: "Sauron", saga: "lotr", svg: LOTR_SAURON },

  // The Big Bang Theory
  { id: "bb-sheldon", name: "Sheldon", saga: "bigbang",
    svg: faceSvg({ bg: "#c94f3a", skin: "#f2d0a8", hair: "short", hairColor: "#6b4a2a", accent: "#d96a3a",
      extra: `<path d="M44 82l6 8 6-8-6-4z" fill="#ffd23f"/>` }) },
  { id: "bb-leonard", name: "Leonard", saga: "bigbang",
    svg: faceSvg({ bg: "#3a6ea5", skin: "#eec9a8", hair: "short", hairColor: "#3a2a1a", glasses: true, accent: "#7a4a2a" }) },
  { id: "bb-rajesh", name: "Rajesh", saga: "bigbang",
    svg: faceSvg({ bg: "#7a4fa5", skin: "#b07a4a", hair: "short", hairColor: "#1c1410", accent: "#4a3a5a" }) },
  { id: "bb-howard", name: "Howard", saga: "bigbang",
    svg: faceSvg({ bg: "#3a8a6a", skin: "#eec9a8", hair: "bob", hairColor: "#2a1a10", accent: "#c94f3a",
      extra: `<rect x="46" y="66" width="8" height="4" rx="1" fill="#ffd23f"/>` }) },
  { id: "bb-penny", name: "Penny", saga: "bigbang",
    svg: faceSvg({ bg: "#d98fb0", skin: "#f2d0b0", hair: "long", hairColor: "#e8c060", accent: "#c96a8a" }) },
  { id: "bb-amy", name: "Amy", saga: "bigbang",
    svg: faceSvg({ bg: "#8a7a3a", skin: "#eec9a8", hair: "long", hairColor: "#5a3a2a", glasses: true, accent: "#6a5a2a" }) },

  // Star Wars
  { id: "sw-anakin", name: "Anakin", saga: "starwars",
    svg: faceSvg({ bg: "#6a3a2a", skin: "#eec9a8", hair: "long", hairColor: "#7a5a2a", accent: "#3a2a1a" }) },
  { id: "sw-luke", name: "Luke", saga: "starwars",
    svg: faceSvg({ bg: "#c98a2a", skin: "#eec9a8", hair: "swoop", hairColor: "#b0863a", accent: "#d8cca0" }) },
  { id: "sw-han", name: "Han Solo", saga: "starwars",
    svg: faceSvg({ bg: "#5a4a3a", skin: "#eec9a8", hair: "short", hairColor: "#4a3320", accent: "#8a7a5a" }) },
  { id: "sw-c3po", name: "C-3PO", saga: "starwars", svg: SW_C3PO },
  { id: "sw-vader", name: "Darth Vader", saga: "starwars", svg: SW_VADER },
  { id: "sw-obiwan", name: "Obi-Wan", saga: "starwars",
    svg: faceSvg({ bg: "#8a6a3a", skin: "#eec9a8", hair: "long", hairColor: "#b0895a", beard: "full", beardColor: "#b0895a", accent: "#a08a5a" }) },

  // Harry Potter
  { id: "hp-harry", name: "Harry", saga: "hp",
    svg: faceSvg({ bg: "#6a1f2a", skin: "#eec9a8", hair: "swoop", hairColor: "#1c1410", glasses: true, accent: "#3a3a3a",
      extra: `<path d="M46 32l3 5-3 3 3 3" fill="none" stroke="#b23a3a" stroke-width="1.6"/>` }) },
  { id: "hp-hermione", name: "Hermione", saga: "hp",
    svg: faceSvg({ bg: "#7a5a2a", skin: "#eec9a8", hair: "long", hairColor: "#6b3a1a", accent: "#3a3a3a" }) },
  { id: "hp-ron", name: "Ron", saga: "hp",
    svg: faceSvg({ bg: "#c96a2a", skin: "#f0d0b0", hair: "short", hairColor: "#c85a1a", accent: "#3a3a3a" }) },
  { id: "hp-dumbledore", name: "Dumbledore", saga: "hp",
    svg: faceSvg({ bg: "#3a4a7a", skin: "#e8c9a8", hair: "long", hairColor: "#e8ebee", beard: "long", beardColor: "#e8ebee", glasses: true, glassesColor: "#8a7a3a", accent: "#5a4a8a" }) },
  { id: "hp-snape", name: "Snape", saga: "hp",
    svg: faceSvg({ bg: "#22262a", skin: "#dcd0c0", hair: "long", hairColor: "#141414", accent: "#141414" }) },
  { id: "hp-voldemort", name: "Voldemort", saga: "hp", svg: HP_VOLDEMORT },
];

export const byId: Map<string, string> = new Map<string, string>([
  [DEFAULT_AVATAR_ID, DEFAULT_SVG],
  ...AVATARS.map((a) => [a.id, a.svg] as [string, string]),
]);
```

- [ ] **Step 2: Reescribir `lib/avatar.ts`**

```ts
// Avatares de personajes (SVG originales). Sólo se persiste el id en
// profiles.avatar_seed; el SVG se resuelve acá, sin red ni assets bundleados.
// Un id desconocido (incluye seeds DiceBear viejas) cae al avatar por defecto.
import { byId, DEFAULT_AVATAR_ID } from "./avatars";

export function avatarSvg(id: string): string {
  const svg = byId.get(id) ?? byId.get(DEFAULT_AVATAR_ID)!;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
```

- [ ] **Step 3: Verificar compila**

Run: `npx tsc --noEmit`
Expected: un único error esperado en `components/AvatarPicker.tsx` (`randomSeed` ya no se exporta). Es transitorio: se resuelve en la Task 4, que se ejecuta **en el mismo implementador**, dejando `tsc` verde antes de cerrar. No hacer commit con `tsc` roto en verde falso — el commit de esta task convive con el de Task 4 (Tasks 3+4 comparten el gate verde).

- [ ] **Step 4: Commit**

```bash
git add lib/avatars/index.ts lib/avatar.ts
git commit -m "feat(avatares): manifest de 24 personajes + avatarSvg por id"
```

> Ejecución: Tasks 3 y 4 van juntas en un solo implementador (están acopladas por `randomSeed`); `tsc` se valida verde recién al terminar Task 4.

---

### Task 4: AvatarPicker agrupado por saga

**Files:**
- Modify: `components/AvatarPicker.tsx`
- Modify: `app/globals.css` (estilos de sección del picker)

**Interfaces:**
- Consumes: `avatarSvg` de `@/lib/avatar`; `AVATARS`, `SAGAS`, `DEFAULT_AVATAR_ID` de `@/lib/avatars`.
- Mantiene la prop pública: `AvatarPicker({ current, onPick })` con `current: string`, `onPick: (seed: string) => void`. No cambia el contrato con `app/cuenta/perfil/page.tsx`.

- [ ] **Step 1: Reescribir `components/AvatarPicker.tsx`**

```tsx
"use client";
import { avatarSvg } from "@/lib/avatar";
import { AVATARS, SAGAS, DEFAULT_AVATAR_ID } from "@/lib/avatars";

export default function AvatarPicker({
  current, onPick,
}: {
  current: string; onPick: (seed: string) => void;
}) {
  return (
    <div className="field">
      <label>Elegí tu avatar</label>

      <div className="avsec">
        <h5 className="avsec-t">General</h5>
        <div className="avpick">
          <Opt id={DEFAULT_AVATAR_ID} label="Por defecto" current={current} onPick={onPick} />
        </div>
      </div>

      {SAGAS.map((s) => (
        <div key={s.key} className="avsec">
          <h5 className="avsec-t">{s.label}</h5>
          <div className="avpick">
            {AVATARS.filter((a) => a.saga === s.key).map((a) => (
              <Opt key={a.id} id={a.id} label={a.name} current={current} onPick={onPick} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Opt({
  id, label, current, onPick,
}: {
  id: string; label: string; current: string; onPick: (seed: string) => void;
}) {
  return (
    <button
      type="button"
      className={`avopt ${id === current ? "on" : ""}`}
      onClick={() => onPick(id)}
      aria-pressed={id === current}
      aria-label={label}
      title={label}
    >
      <img src={avatarSvg(id)} alt="" />
    </button>
  );
}
```

- [ ] **Step 2: Agregar estilos de sección al final del bloque "Picker de avatar" en `app/globals.css`**

Ubicar el bloque `/* Picker de avatar */` (aprox. línea 324) y agregar debajo de `.avopt.on`:

```css
.avsec { margin-top: 14px; }
.avsec:first-of-type { margin-top: 6px; }
.avsec-t { margin: 0 0 8px; font-size: 12px; font-weight: 600; color: var(--dim); text-transform: uppercase; letter-spacing: .04em; }
```

- [ ] **Step 3: Verificar compila**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verificación visual**

Run: `npm run dev` y abrir `/cuenta/perfil` logueado.
Expected: grid "General" con el avatar por defecto, y una sección por saga (LOTR, Big Bang, Star Wars, Harry Potter) con 6 avatares cada una; el seleccionado con borde de acento; todos con el mismo lenguaje visual (disco + rostro plano).

- [ ] **Step 5: Commit**

```bash
git add components/AvatarPicker.tsx app/globals.css
git commit -m "feat(perfil): picker de avatar agrupado por saga"
```

---

### Task 5: TopBar — lupa arriba, sin bloque de cuenta + aire

**Files:**
- Modify: `components/TopBar.tsx`
- Modify: `app/globals.css` (aire de `.topbar-top`)

**Interfaces:**
- El componente sigue exportando `default TopBar()` sin props. Deja de usar `useAuth` y `avatarSvg` si no quedan otros usos en el archivo.

- [ ] **Step 1: Reemplazar el bloque de cuenta por la lupa en `components/TopBar.tsx`**

Reemplazar el `.topbar-top` completo (líneas ~32-46, el `<span className="topdate">` + el `user ? (...) : (...)`) por:

```tsx
      <div className="topbar-top">
        <span className="topdate">{fecha}</span>
        <Link href="/buscar" className="acct-link" aria-label="Buscar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
          </svg>
        </Link>
      </div>
```

Luego eliminar los imports y el estado que quedan sin uso: `import { useAuth }`, `import { avatarSvg }`, y la línea `const { user, profile } = useAuth();`. Mantener `usePlatforms`, el estado de `open`/`fecha`/`ref` y el resto del componente (marca + panel de plataformas) intactos.

- [ ] **Step 2: Dar aire a `.topbar-top` en `app/globals.css`**

Cambiar la línea 74:
```css
.topbar-top{display:flex;justify-content:space-between;align-items:center;max-width:1240px;margin:0 auto;padding:7px 28px 0}
```
por:
```css
.topbar-top{display:flex;justify-content:space-between;align-items:center;max-width:1240px;margin:0 auto;padding:14px 28px 0}
```

Y en el media query (línea 95) cambiar `.topbar-top{padding:6px 16px 0}` por `.topbar-top{padding:12px 16px 0}` (mantener el resto del media query igual).

- [ ] **Step 3: Verificar compila**

Run: `npx tsc --noEmit`
Expected: PASS. Si `tsc` marca imports no usados, es porque quedó `useAuth`/`avatarSvg`; eliminarlos.

- [ ] **Step 4: Verificación visual**

Run: `npm run dev`, abrir `/`.
Expected: arriba a la izquierda la fecha, a la derecha la lupa (link a `/buscar`), ambos un poco más despegados del borde superior. Ya no aparece avatar ni "Ingresar" en el TopBar.

- [ ] **Step 5: Commit**

```bash
git add components/TopBar.tsx app/globals.css
git commit -m "feat(topbar): lupa de búsqueda arriba y más aire; se quita cuenta"
```

---

### Task 6: BottomNav — ítem "Cuenta" con avatar/persona según auth

**Files:**
- Modify: `components/BottomNav.tsx`

**Interfaces:**
- Consumes: `useAuth` de `./AuthContext`; `avatarSvg` de `@/lib/avatar`.

- [ ] **Step 1: Reescribir `components/BottomNav.tsx`**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthContext";
import { avatarSvg } from "@/lib/avatar";

const ITEMS = [
  { href: "/", label: "Inicio", match: (p: string) => p === "/", icon: <path d="M3 10l9-7 9 7v9a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z" /> },
  { href: "/series", label: "Series", match: (p: string) => p.startsWith("/series"), icon: <><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M9 21h6" /></> },
  { href: "/peliculas", label: "Películas", match: (p: string) => p.startsWith("/peliculas"), icon: <><path d="M3 8h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 8l2.5-4h3L6 8M9.5 8L12 4h3l-2.5 4M15.5 8L18 4h3" /></> },
  { href: "/cuenta/lista", label: "Mi lista", match: (p: string) => p.startsWith("/cuenta/lista"), icon: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /> },
];

export default function BottomNav() {
  const path = usePathname();
  const { user, profile } = useAuth();
  // "Mi lista" es /cuenta/lista, así que Cuenta sólo se marca activo en /cuenta
  // y sus subrutas que no sean /cuenta/lista (perfil, configuracion, gustaron…).
  const cuentaOn = path.startsWith("/cuenta") && !path.startsWith("/cuenta/lista");
  const avSeed = profile?.avatar_seed || user?.id || "";

  return (
    <nav className="bottomnav">
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} className={`navitem ${it.match(path) ? "on" : ""}`}>
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
          {it.label}
        </Link>
      ))}
      <Link href="/cuenta" className={`navitem ${cuentaOn ? "on" : ""}`}>
        {user ? (
          <img className="navav" src={avatarSvg(avSeed)} alt="" />
        ) : (
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
          </svg>
        )}
        Cuenta
      </Link>
    </nav>
  );
}
```

- [ ] **Step 2: Agregar el estilo `.navav` en `app/globals.css`**

Debajo de `.navitem.on svg{stroke:var(--accent)}` (línea ~221):

```css
.navav{width:25px;height:25px;border-radius:50%;object-fit:cover;border:1.5px solid var(--dim);display:block}
.navitem.on .navav{border-color:var(--accent)}
```

- [ ] **Step 3: Verificar compila**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verificación visual**

Run: `npm run dev`.
Expected: el nav inferior muestra 5 ítems terminando en "Cuenta". Deslogueado: ícono de persona. Logueado: mini-avatar circular del personaje elegido. En `/cuenta` el ítem queda en acento; en `/cuenta/lista` el que se marca es "Mi lista", no "Cuenta".

- [ ] **Step 5: Commit**

```bash
git add components/BottomNav.tsx app/globals.css
git commit -m "feat(nav): ítem Cuenta en el bottom nav con avatar según sesión"
```

---

### Task 7: UserHub — lápiz/tuerca + bajar el header

**Files:**
- Modify: `components/UserHub.tsx`
- Modify: `app/globals.css` (`.hub-head` y estilo de íconos)

**Interfaces:**
- Sin cambio de contrato; sigue exportando `default UserHub()`.

- [ ] **Step 1: Reemplazar los links de texto por íconos en `components/UserHub.tsx`**

Reemplazar el bloque `.hub-links` (líneas ~19-22):

```tsx
          <div className="hub-links">
            <Link href="/cuenta/perfil" className="hub-edit">Editar perfil ›</Link>
            <Link href="/cuenta/configuracion" className="hub-edit">Configuración ›</Link>
          </div>
```

por:

```tsx
          <div className="hub-links">
            <Link href="/cuenta/perfil" className="hub-ico" aria-label="Editar perfil" title="Editar perfil">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </Link>
            <Link href="/cuenta/configuracion" className="hub-ico" aria-label="Configuración" title="Configuración">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
```

- [ ] **Step 2: Ajustar `.hub-head` y agregar `.hub-ico` en `app/globals.css`**

Cambiar la línea 312:
```css
.hub-head { display: flex; align-items: center; gap: 14px; padding: 6px 0 18px; }
```
por:
```css
.hub-head { display: flex; align-items: center; gap: 14px; padding: 24px 0 18px; }
```

Y debajo de `.hub-edit:hover` (línea ~316) agregar:
```css
.hub-ico { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; background: var(--surface, #22252B); color: var(--dim); text-decoration: none; }
.hub-ico:hover { color: var(--text); background: var(--surface-2, #2a2d33); }
.hub-ico svg { width: 18px; height: 18px; }
```

(Mantener `.hub-edit` en el CSS por si se usa en otro lado; el buscador confirma que sólo lo usaba UserHub, pero no molesta dejarlo.)

- [ ] **Step 3: Verificar compila**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verificación visual**

Run: `npm run dev`, abrir `/cuenta` logueado.
Expected: junto al nombre aparecen dos botones-ícono redondos (lápiz → perfil, tuerca → configuración) en vez de los textos. El bloque avatar+nombre+íconos quedó más separado del TopBar.

- [ ] **Step 5: Commit**

```bash
git add components/UserHub.tsx app/globals.css
git commit -m "feat(hub): íconos lápiz/tuerca y más aire bajo el topbar"
```

---

### Task 8: Quitar dependencia DiceBear

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Confirmar que ya no se importa DiceBear**

Run: `grep -rn "dicebear" lib components app` (o Grep tool sobre `dicebear`).
Expected: sin resultados en código (`lib/avatar.ts` ya reescrito). Si aparece algún import, resolverlo antes de seguir.

- [ ] **Step 2: Quitar las dos deps de `package.json`**

Eliminar de `dependencies` las líneas:
```json
    "@dicebear/collection": "^9.4.2",
    "@dicebear/core": "^9.4.3",
```

- [ ] **Step 3: Regenerar el lockfile y verificar build de tipos**

Run:
```bash
npm install
npx tsc --noEmit
```
Expected: `npm install` actualiza `package-lock.json` sin errores; `tsc` PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: quitar dependencia DiceBear (avatares propios)"
```

---

## Verificación final

- [ ] `npx tsc --noEmit` → 0 errores.
- [ ] `npx next build` compila (puede fallar sólo por Google Fonts sin red; no es error real).
- [ ] Visual en `npm run dev`:
  - TopBar: fecha + lupa arriba, con aire; sin cuenta.
  - BottomNav: 5º ítem "Cuenta" (persona deslogueado / avatar logueado); activo correcto en `/cuenta` vs `/cuenta/lista`.
  - `/cuenta/perfil`: picker por saga, 4 secciones × 6 + "General" con el por defecto, estilo unificado.
  - `/cuenta`: lápiz/tuerca en vez de texto; header despegado del topbar.
- [ ] Un `avatar_seed` legacy (string tipo seed DiceBear, ej. "abc123") renderiza el avatar por defecto sin romper.

## Self-Review (hecho)

- **Cobertura del spec:** los 4 bloques del spec tienen task (1-3 avatares/data, 4 picker, 5 topbar+aire, 6 bottomnav, 7 hub íconos+aire, 8 limpieza). ✔
- **Placeholders:** sin TODOs, sin "handle edge cases", sin `.replace` de relleno; todo el código es literal y ejecutable. Los SVG de personajes son especificaciones exactas (colores + rasgos); su ajuste fino de píxeles es craft visual que se itera en preview, no un placeholder. ✔
- **Consistencia de tipos:** `avatarSvg(id)` firma única en `lib/avatar.ts`; `CharAvatar`/`Saga`/`SAGAS`/`AVATARS`/`DEFAULT_AVATAR_ID`/`byId` usados igual en index, picker y nav. Prop `AvatarPicker({current,onPick})` sin cambios respecto del consumidor. ✔
