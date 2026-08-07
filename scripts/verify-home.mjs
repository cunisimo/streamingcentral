// Verifica las reglas del Home Composer contra la API local.
// Uso: node scripts/verify-home.mjs

// Códigos reales de plataforma (lib/providers-ar.ts, campo PlatformDef.code).
// Es un .mjs sin TS, así que se hardcodea acá — si se agrega/saca una
// plataforma en providers-ar.ts, actualizar esta lista a mano.
const CODIGOS_VALIDOS = ["n", "d", "m", "p", "pp", "at", "mb", "cr", "sp", "vx"];

const P = process.env.SC_PROVIDERS || "n,d,m,p,pp,at,mb,cr,sp,vx";
const desconocidos = P.split(",").map((c) => c.trim()).filter((c) => c && !CODIGOS_VALIDOS.includes(c));
if (desconocidos.length) {
  console.error(`AVISO: código(s) de plataforma inexistente(s) en SC_PROVIDERS: ${desconocidos.join(", ")} (válidos: ${CODIGOS_VALIDOS.join(", ")})`);
}

const r = await fetch(`http://localhost:3000/api/home?providers=${P}`);
const j = await r.json();
if (j.error) { console.error("ERROR:", j.error); process.exit(1); }
// El composer envuelve cada fuente en safe(): un fallo NO rechaza, degrada a
// vacío. Sin este aviso, un Home al que le faltan fuentes pasaría la
// verificación con "0 duplicados" y conteos cortos, que es justo el modo de
// fallo silencioso que se está tratando de evitar.
if (j.degradado) console.error(`AVISO: payload DEGRADADO — ${j.fallos} fuente(s) caída(s). Los conteos de abajo no son representativos.`);

// Estructura mínima esperada ANTES de chequear contenido: si esto no se
// cumple (p.ej. 0 providers válidos → composeHome devuelve {hero:[],rails:[]})
// no tiene sentido seguir, porque "0 duplicados" sería un falso OK.
const RIELES_ESPERADOS = [
  "ultimos", "mas-votados", "hacete-cargo",
  "genre:accion", "genre:scifi", "genre:terror", "genre:drama", "genre:comedia", "genre:documental",
  "family", "adult-anime",
];
const erroresEstructura = [];
if (!Array.isArray(j.hero) || j.hero.length === 0) {
  erroresEstructura.push("hero vacío o ausente");
}
if (!Array.isArray(j.rails) || j.rails.length < RIELES_ESPERADOS.length) {
  erroresEstructura.push(`se esperaban al menos ${RIELES_ESPERADOS.length} rieles, vinieron ${j.rails?.length ?? 0}`);
} else {
  const claves = new Set(j.rails.map((x) => x.key));
  const faltantes = RIELES_ESPERADOS.filter((k) => !claves.has(k));
  if (faltantes.length) erroresEstructura.push(`faltan rieles: ${faltantes.join(", ")}`);
}
if (erroresEstructura.length) {
  console.error("FALLA ESTRUCTURAL — el Home no trae la forma mínima esperada:");
  for (const e of erroresEstructura) console.error(`  - ${e}`);
  process.exit(1);
}

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
