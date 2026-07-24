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
    default: return "";
  }
}

function beardMarkup(style: Beard, color: string): string {
  switch (style) {
    case "none": return "";
    case "stubble": return `<path d="M34 54c4 12 28 12 32 0-2 10-30 10-32 0z" fill="${color}" opacity=".35"/>`;
    case "full": return `<path d="M33 50c2 18 32 18 34 0-1 12-6 20-17 20s-16-8-17-20z" fill="${color}"/>`;
    case "long": return `<path d="M33 50c1 26 4 40 17 40s16-14 17-40c-2 16-32 16-34 0z" fill="${color}"/>`;
    case "goatee": return `<path d="M44 60c2 6 10 6 12 0-1 8-11 8-12 0z" fill="${color}"/>`;
    default: return "";
  }
}

function headwearMarkup(style: Headwear, color: string): string {
  switch (style) {
    case "none": return "";
    case "wizard": return `<path d="M50 2 34 34c10-5 22-5 32 0z" fill="${color}"/>`;
    case "hood": return `<path d="M24 46c0-26 52-26 52 0-6-14-46-14-52 0z" fill="${color}"/>`;
    default: return "";
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
    hairMarkup(hair, hairColor) +
    glasses +
    headwearMarkup(o.headwear ?? "none", o.headwearColor ?? "#555") +
    (o.extra ?? "");

  return wrapDisc(o.bg, inner);
}
