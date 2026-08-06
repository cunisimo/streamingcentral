// Verifica las reglas del Home Composer contra la API local.
// Uso: node scripts/verify-home.mjs
const P = process.env.SC_PROVIDERS || "n,d,m,st,pv,ap";
const r = await fetch(`http://localhost:3000/api/home?providers=${P}`);
const j = await r.json();
if (j.error) { console.error("ERROR:", j.error); process.exit(1); }

const key = (t) => `${t.type}:${t.id}`;
const seen = new Map();
let dupes = 0;

const secciones = [["Para vos hoy", j.hero], ...j.rails.map((x) => [x.title || x.genre, x.items])];
console.log("sección".padEnd(26), "items".padStart(6), "dupes".padStart(6));
console.log("-".repeat(42));
for (const [nombre, items] of secciones) {
  let d = 0;
  for (const t of items) {
    const k = key(t);
    if (seen.has(k)) { d++; dupes++; console.error(`  DUP: ${t.title} ya estaba en "${seen.get(k)}"`); }
    else seen.set(k, nombre);
  }
  console.log(nombre.padEnd(26), String(items.length).padStart(6), String(d).padStart(6));
}
console.log("-".repeat(42));
console.log(`únicos: ${seen.size} | duplicados: ${dupes}`);

// Reglas duras
const cortos = j.rails.filter((x) => x.key.startsWith("genre:") && x.items.length < 20);
if (cortos.length) console.error(`FALLA: rieles de género con menos de 20: ${cortos.map((c) => `${c.genre}(${c.items.length})`).join(", ")}`);
if (dupes) console.error(`FALLA: ${dupes} duplicados`);
process.exit(dupes || cortos.length ? 1 : 0);
