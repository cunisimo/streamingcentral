import { agenda } from "./lib-datos.mjs";
const t = (await agenda()).filter((f) => f.plataformas.length > 0);
const anim = t.filter((f) => (f.genre_ids ?? []).includes(16));

// Escritura japonesa: hiragana, katakana, kanji (CJK unificado).
const JP = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
const esJP = (f) => JP.test(f.original_title ?? "");

const cr  = (f) => f.plataformas.includes("cr");
const clasificadores = {
  "A. solo Crunchyroll":                 (f) => cr(f),
  "B. solo genero Animacion":            (f) => (f.genre_ids ?? []).includes(16),
  "C. Animacion + escritura japonesa":   (f) => (f.genre_ids ?? []).includes(16) && esJP(f),
  "D. Crunchyroll O (Anim + jp)":        (f) => cr(f) || ((f.genre_ids ?? []).includes(16) && esJP(f)),
  "E. escritura japonesa sola":          (f) => esJP(f),
};
console.log(`universo: ${t.length} | con genero Animacion: ${anim.length}\n`);
for (const [n, fn] of Object.entries(clasificadores)) {
  const s = t.filter(fn);
  console.log(`${n.padEnd(36)} ${String(s.length).padStart(3)}  (${(s.length*100/t.length).toFixed(1)}% del total)`);
}

// Los desacuerdos entre C/D y Crunchyroll: quienes entran de mas y de menos.
const D = (f) => cr(f) || ((f.genre_ids ?? []).includes(16) && esJP(f));
console.log(`\n--- animacion que D NO marca como anime (${anim.filter(f=>!D(f)).length}) ---`);
for (const f of anim.filter((f) => !D(f))) {
  console.log(`   ${f.title.slice(0,40).padEnd(41)} orig="${(f.original_title??'').slice(0,34)}" [${f.plataformas}]`);
}
