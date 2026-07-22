// Genera todos los assets PWA (íconos + splash) desde assets/brand/logo.svg.
// Re-ejecutable: si cambia el logo, `node scripts/generate-pwa-assets.mjs`
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

const ACCENT = "#FF6A1A";
const WHITE = "#FFFFFF";

// Cara del ícono como SVG. radius01 = radio de esquina (0 = full bleed).
// triScale escala el triángulo respecto del centro (para dejar zona segura en
// los maskable). glyph opcional reemplaza el triángulo (para los shortcuts).
function iconSvg({ radius01 = 0, triScale = 1, glyph = null } = {}) {
  const r = Math.round(radius01 * 512);
  const inner = glyph
    ? glyph
    : `<path d="M203 148 L379 256 L203 364 Z" fill="${WHITE}" stroke="${WHITE}" stroke-width="34" stroke-linejoin="round" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="${r}" ry="${r}" fill="${ACCENT}"/>
    <g transform="translate(256 256) scale(${triScale}) translate(-256 -256)">${inner}</g>
  </svg>`;
}

async function png(svg, size, outPath) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  return outPath;
}

// Glifos monocromáticos (trazo blanco) para los shortcuts. Mismos íconos que la
// nav para coherencia visual.
const GLYPHS = {
  buscar: `<g fill="none" stroke="${WHITE}" stroke-width="30" stroke-linecap="round"><circle cx="232" cy="232" r="120"/><path d="M322 322 L392 392"/></g>`,
  lista: `<path d="M368 416 L256 336 L144 416 V128 a34 34 0 0 1 34-34 h156 a34 34 0 0 1 34 34 Z" fill="none" stroke="${WHITE}" stroke-width="30" stroke-linejoin="round"/>`,
  // "Qué veo hoy" = el dado del modo indeciso.
  indeciso: `<g fill="none" stroke="${WHITE}" stroke-width="28"><rect x="146" y="146" width="220" height="220" rx="44"/><circle cx="212" cy="212" r="16" fill="${WHITE}"/><circle cx="300" cy="300" r="16" fill="${WHITE}"/><circle cx="256" cy="256" r="16" fill="${WHITE}"/></g>`,
};

async function main() {
  await mkdir(ICONS, { recursive: true });
  await mkdir(SPLASH, { recursive: true });

  // --- Íconos principales ---
  const rounded = iconSvg({ radius01: 0.22 });          // Android "any": esquina redondeada propia
  const maskable = iconSvg({ radius01: 0, triScale: 0.62 }); // full bleed + triángulo dentro de la zona segura (80%)
  const fullBleed = iconSvg({ radius01: 0 });            // iOS redondea solo

  await png(rounded, 192, join(ICONS, "icon-192.png"));
  await png(rounded, 512, join(ICONS, "icon-512.png"));
  await png(maskable, 192, join(ICONS, "icon-maskable-192.png"));
  await png(maskable, 512, join(ICONS, "icon-maskable-512.png"));
  await png(fullBleed, 180, join(ROOT, "app", "apple-icon.png"));
  await png(rounded, 32, join(ROOT, "app", "icon.png"));

  // favicon.ico multi-resolución
  const ico16 = await sharp(Buffer.from(rounded)).resize(16, 16).png().toBuffer();
  const ico32 = await sharp(Buffer.from(rounded)).resize(32, 32).png().toBuffer();
  const ico48 = await sharp(Buffer.from(rounded)).resize(48, 48).png().toBuffer();
  await writeFile(join(ICONS, "favicon.ico"), await pngToIco([ico16, ico32, ico48]));

  // Shortcuts (Android long-press / jump list)
  for (const [key, glyph] of Object.entries(GLYPHS)) {
    await png(iconSvg({ radius01: 0.22, glyph }), 96, join(ICONS, `shortcut-${key}.png`));
  }

  // --- Splash de iOS ---
  const logoBuf = await sharp(Buffer.from(rounded)).png().toBuffer();
  for (const d of DEVICES) {
    const w = d.cssW * d.dpr, h = d.cssH * d.dpr;
    const logoSize = Math.round(Math.min(w, h) * LOGO_RATIO);
    const logo = await sharp(logoBuf).resize(logoSize, logoSize).png().toBuffer();
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
    const logo = await sharp(logoBuf).resize(logoSize, logoSize).png().toBuffer();
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${Math.round(s.h * 0.12)}">
        <text x="50%" y="60%" text-anchor="middle" font-family="sans-serif" font-weight="700"
          font-size="${Math.round(Math.min(s.w, s.h) * 0.05)}" fill="#16171B">StreamingCentral</text>
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
