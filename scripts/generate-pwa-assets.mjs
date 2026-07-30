// Genera todos los assets PWA (íconos + splash) desde public/brand/yump-icon.png.
// Re-ejecutable: si cambia el ícono, `node scripts/generate-pwa-assets.mjs`
// regenera los 26 archivos. También reescribe components/pwa/AppleSplashLinks.tsx.
//
// Uso:  node scripts/generate-pwa-assets.mjs
//
// Requiere devDependencies: sharp, png-to-ico.

import sharp from "sharp";
import pngToIco from "png-to-ico";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEVICES, SPLASH_BG, LOGO_RATIO, splashFile, splashMedia } from "./pwa-devices.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS = join(ROOT, "public", "icons");
const SPLASH = join(ROOT, "public", "splash");
const ICON_SRC = join(ROOT, "public", "brand", "yump-icon.png");

const ACCENT = "#F58634";
const WHITE = "#FFFFFF";
const FACE_SIZE = 512; // resolución de trabajo; todos los íconos se derivan de acá.

// La fuente (public/brand/yump-icon.png) es un tile con gradiente Yump + flecha,
// pero la flecha es en realidad un RECORTE DE ALFA (transparente) sobre canvas
// transparente — no blanco sólido. Si se compone tal cual sobre un fondo de
// color (ej. el maskable sobre ACCENT), la flecha se vuelve un "agujero" que
// deja ver el fondo. El sistema de marca Yump siempre muestra este ícono sobre
// blanco, así que acá aplanamos (`flatten`) sobre blanco opaco ANTES de todo lo
// demás: el recorte de la flecha y el canvas transparente pasan a ser blanco
// sólido, dando un tile opaco con la burbuja degradada + flecha blanca limpia.
// No queda transparencia en ningún punto de la cara resultante.
async function loadFace() {
  // La fuente es apaisada (1000×638) y la marca (burbuja + flecha) ocupa todo el
  // ancho, así que `cover` recortaría la flecha. Usamos `contain` sobre blanco
  // para que la marca entre COMPLETA, centrada, con margen blanco arriba/abajo —
  // que es como el design system muestra el ícono (sobre blanco).
  return sharp(ICON_SRC)
    .flatten({ background: WHITE })
    .resize(FACE_SIZE, FACE_SIZE, { fit: "contain", background: WHITE })
    .png()
    .toBuffer();
}

// Máscara de esquinas redondeadas (rx/ry) del tamaño de trabajo.
function roundedMaskSvg(radius01) {
  const r = Math.round(radius01 * FACE_SIZE);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FACE_SIZE}" height="${FACE_SIZE}"><rect width="${FACE_SIZE}" height="${FACE_SIZE}" rx="${r}" ry="${r}" fill="#fff"/></svg>`
  );
}

// Recorta un tile cuadrado (buffer PNG) a esquinas redondeadas vía máscara alfa.
async function withRoundedCorners(faceBuf, radius01) {
  return sharp(faceBuf)
    .composite([{ input: roundedMaskSvg(radius01), blend: "dest-in" }])
    .png()
    .toBuffer();
}

// Maskable: el tile completo (con su fondo propio) escalado a `safe` (~62%,
// bien dentro de la zona segura del 80%) y centrado sobre un fondo sólido de
// marca a full bleed — así el masking circular/squircle de Android nunca
// recorta la flecha.
// La cara ya es un tile blanco opaco (flatten sobre blanco), así que el fondo
// del maskable también es blanco: queda un tile uniforme con la burbuja+flecha
// dentro de la zona segura, sin costuras de color ni el "agujero" de la flecha.
async function maskableFace(faceBuf, safe = 0.72) {
  const inner = Math.round(FACE_SIZE * safe);
  const scaled = await sharp(faceBuf).resize(inner, inner, { fit: "cover" }).png().toBuffer();
  return sharp({ create: { width: FACE_SIZE, height: FACE_SIZE, channels: 4, background: WHITE } })
    .composite([{ input: scaled, gravity: "centre" }])
    .png()
    .toBuffer();
}

async function toSize(buf, size, outPath) {
  await sharp(buf).resize(size, size).png().toFile(outPath);
  return outPath;
}

async function png(svg, size, outPath) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  return outPath;
}

// Tile ACCENT + glifo blanco centrado, para los shortcuts (Android long-press /
// jump list). Mismos glifos que la nav para coherencia visual.
function shortcutTileSvg(glyph) {
  const r = Math.round(0.22 * FACE_SIZE);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FACE_SIZE}" height="${FACE_SIZE}" viewBox="0 0 ${FACE_SIZE} ${FACE_SIZE}">
    <rect width="${FACE_SIZE}" height="${FACE_SIZE}" rx="${r}" ry="${r}" fill="${ACCENT}"/>
    ${glyph}
  </svg>`;
}

const GLYPHS = {
  buscar: `<g fill="none" stroke="${WHITE}" stroke-width="30" stroke-linecap="round"><circle cx="232" cy="232" r="120"/><path d="M322 322 L392 392"/></g>`,
  lista: `<path d="M368 416 L256 336 L144 416 V128 a34 34 0 0 1 34-34 h156 a34 34 0 0 1 34 34 Z" fill="none" stroke="${WHITE}" stroke-width="30" stroke-linejoin="round"/>`,
  // "Qué veo hoy" = el dado del modo indeciso.
  indeciso: `<g fill="none" stroke="${WHITE}" stroke-width="28"><rect x="146" y="146" width="220" height="220" rx="44"/><circle cx="212" cy="212" r="16" fill="${WHITE}"/><circle cx="300" cy="300" r="16" fill="${WHITE}"/><circle cx="256" cy="256" r="16" fill="${WHITE}"/></g>`,
};

async function main() {
  await mkdir(ICONS, { recursive: true });
  await mkdir(SPLASH, { recursive: true });

  // --- Cara del ícono, derivada del PNG Yump ---
  const face = await loadFace(); // 512×512, full bleed, tal cual el tile fuente
  const rounded = await withRoundedCorners(face, 0.22); // Android "any": esquina redondeada propia
  const maskable = await maskableFace(face, 0.72); // full bleed + tile dentro de la zona segura

  // --- Íconos principales ---
  await toSize(rounded, 192, join(ICONS, "icon-192.png"));
  await toSize(rounded, 512, join(ICONS, "icon-512.png"));
  await toSize(maskable, 192, join(ICONS, "icon-maskable-192.png"));
  await toSize(maskable, 512, join(ICONS, "icon-maskable-512.png"));
  await toSize(face, 180, join(ROOT, "app", "apple-icon.png")); // iOS redondea solo
  await toSize(rounded, 32, join(ROOT, "app", "icon.png"));

  // favicon.ico multi-resolución
  const ico16 = await sharp(rounded).resize(16, 16).png().toBuffer();
  const ico32 = await sharp(rounded).resize(32, 32).png().toBuffer();
  const ico48 = await sharp(rounded).resize(48, 48).png().toBuffer();
  await writeFile(join(ICONS, "favicon.ico"), await pngToIco([ico16, ico32, ico48]));

  // Shortcuts (Android long-press / jump list)
  for (const [key, glyph] of Object.entries(GLYPHS)) {
    await png(shortcutTileSvg(glyph), 96, join(ICONS, `shortcut-${key}.png`));
  }

  // --- Splash de iOS ---
  for (const d of DEVICES) {
    const w = d.cssW * d.dpr, h = d.cssH * d.dpr;
    const logoSize = Math.round(Math.min(w, h) * LOGO_RATIO);
    const logo = await sharp(rounded).resize(logoSize, logoSize).png().toBuffer();
    await sharp({ create: { width: w, height: h, channels: 4, background: SPLASH_BG } })
      .composite([{ input: logo, gravity: "centre" }])
      .png()
      .toFile(join(SPLASH, splashFile(d)));
  }

  // --- Screenshots (placeholder branded; reemplazables por capturas reales) ---
  // El manifest los referencia para la ficha rica de instalación en Android.
  // Se pueden sustituir por capturas reales de la app sin tocar el manifest.
  await mkdir(join(ROOT, "public", "screenshots"), { recursive: true });
  const shots = [
    { file: "sc-mobile-1.png", w: 1080, h: 1920 },
    { file: "sc-mobile-2.png", w: 1080, h: 1920 },
    { file: "sc-mobile-3.png", w: 1080, h: 1920 },
    { file: "sc-desktop-1.png", w: 1920, h: 1080 },
  ];
  for (const s of shots) {
    const logoSize = Math.round(Math.min(s.w, s.h) * 0.28);
    const logo = await sharp(rounded).resize(logoSize, logoSize).png().toBuffer();
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${Math.round(s.h * 0.12)}">
        <text x="50%" y="60%" text-anchor="middle" font-family="sans-serif" font-weight="700"
          font-size="${Math.round(Math.min(s.w, s.h) * 0.05)}" fill="#1E1D21">Yump</text>
      </svg>`
    );
    await sharp({ create: { width: s.w, height: s.h, channels: 4, background: SPLASH_BG } })
      .composite([
        { input: logo, gravity: "centre" },
        { input: label, gravity: "south" },
      ])
      .png()
      .toFile(join(ROOT, "public", "screenshots", s.file));
  }

  // --- Componente de <link> generado desde la misma lista ---
  await writeSplashLinks();

  console.log(`✓ ${6 + 3 + 1} íconos + ${DEVICES.length} splash + 4 screenshots generados`);
  console.log("✓ components/pwa/AppleSplashLinks.tsx regenerado");
}

async function writeSplashLinks() {
  const links = DEVICES.map(
    (d) => `      {/* ${d.name} */}\n      <link rel="apple-touch-startup-image" media="${splashMedia(d)}" href="/splash/${splashFile(d)}" />`
  ).join("\n");
  const tsx = `// GENERADO por scripts/generate-pwa-assets.mjs — NO editar a mano.
// Regenerar con: node scripts/generate-pwa-assets.mjs
//
// Los splash de iOS se declaran uno por resolución. Van en el <head> del layout.
export default function AppleSplashLinks() {
  return (
    <>
${links}
    </>
  );
}
`;
  await mkdir(join(ROOT, "components", "pwa"), { recursive: true });
  await writeFile(join(ROOT, "components", "pwa", "AppleSplashLinks.tsx"), tsx);
}

main().catch((e) => { console.error(e); process.exit(1); });
