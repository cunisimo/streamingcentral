// Medición del agujero de disponibilidad regional de TMDB.
//
//   node scripts/medir-disponibilidad.mjs caso      → el caso testigo, crudo
//   node scripts/medir-disponibilidad.mjs muestra   → la muestra de Disney+
//
// No escribe en Supabase ni toca producción: sólo lee TMDB.
import fs from "node:fs";
import path from "node:path";

// .env.local a mano: este script corre fuera de Next.
for (const linea of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const i = linea.indexOf("=");
  if (i < 0 || linea.trim().startsWith("#")) continue;
  const k = linea.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = linea.slice(i + 1).trim();
}

const TOKEN = process.env.TMDB_READ_TOKEN;
if (!TOKEN) throw new Error("falta TMDB_READ_TOKEN");

let llamadas = 0;
async function tmdb(ruta, params = {}) {
  const u = new URL("https://api.themoviedb.org/3" + ruta);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  llamadas++;
  const r = await fetch(u, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`${r.status} ${ruta}`);
  return r.json();
}

const hoyAR = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

// ---------------------------------------------------------------- caso testigo
async function caso() {
  const ID = 275224;
  const d = await tmdb(`/tv/${ID}`, { language: "es-ES" });
  const wp = await tmdb(`/tv/${ID}/watch/providers`);
  const regiones = Object.keys(wp.results ?? {}).sort();

  console.log("=== CASO TESTIGO tv:275224 ===");
  console.log("name        :", d.name);
  console.log("first_air   :", d.first_air_date, "| hoy AR:", hoyAR());
  console.log("networks    :", (d.networks ?? []).map((n) => `${n.name}(${n.id})`).join(", ") || "(ninguna)");
  console.log("homepage    :", d.homepage || "(vacío)");
  console.log("regiones en watch/providers:", regiones.length, "->", regiones.join(",") || "(ninguna)");
  console.log("AR presente :", regiones.includes("AR"));
  if (wp.results?.AR) console.log("AR flatrate :", JSON.stringify(wp.results.AR.flatrate ?? []));

  // discover por proveedor Disney+ (337) en AR
  const disc = await tmdb("/discover/tv", {
    watch_region: "AR", with_watch_providers: 337,
    with_watch_monetization_types: "flatrate",
    "first_air_date.lte": hoyAR(), sort_by: "first_air_date.desc",
    language: "es-ES", page: 1,
  });
  const enDiscover = (disc.results ?? []).some((t) => t.id === ID);
  console.log("discover d/AR pág.1 lo trae:", enDiscover, `(${disc.total_results} resultados)`);

  // discover por RED Disney+ (2739), sin filtro de proveedor
  const red = await tmdb("/discover/tv", {
    with_networks: 2739, "first_air_date.lte": hoyAR(),
    sort_by: "first_air_date.desc", language: "es-ES", page: 1,
  });
  const enRed = (red.results ?? []).some((t) => t.id === ID);
  console.log("discover with_networks=2739 lo trae:", enRed, `(${red.total_results} resultados)`);
  console.log("llamadas TMDB:", llamadas);
}

// ------------------------------------------------------------------- muestra
async function muestra() {
  const DIAS = Number(process.env.DIAS ?? 60);
  const hoy = hoyAR();
  const desde = new Date(Date.now() - DIAS * 864e5)
    .toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });

  console.log(`=== MUESTRA Disney+ (red 2739), estrenos ${desde} .. ${hoy} ===`);

  const candidatos = [];
  for (let p = 1; p <= 3; p++) {
    const r = await tmdb("/discover/tv", {
      with_networks: 2739, "first_air_date.gte": desde, "first_air_date.lte": hoy,
      sort_by: "first_air_date.desc", language: "es-ES", page: p,
    });
    candidatos.push(...(r.results ?? []));
    if (p >= (r.total_pages ?? 1)) break;
  }

  const filas = [];
  for (const t of candidatos) {
    const [wp, det] = await Promise.all([
      tmdb(`/tv/${t.id}/watch/providers`),
      tmdb(`/tv/${t.id}`, { language: "es-ES" }),
    ]);
    const ar = wp.results?.AR;
    const flat = ar?.flatrate ?? [];
    filas.push({
      id: t.id,
      nombre: t.name,
      estreno: t.first_air_date,
      tieneAR: flat.length > 0,
      proveedoresAR: flat.map((x) => `${x.provider_name}(${x.provider_id})`),
      regiones: Object.keys(wp.results ?? {}).length,
      homepage: det.homepage || "",
      redes: (det.networks ?? []).map((n) => `${n.name}(${n.id})`),
    });
  }

  const conAR = filas.filter((f) => f.tieneAR);
  const sinAR = filas.filter((f) => !f.tieneAR);
  const conLinkDisney = sinAR.filter((f) => /^https:\/\/(www\.)?disneyplus\.com\//i.test(f.homepage));

  console.log("candidatos por red      :", filas.length);
  console.log("con proveedor AR (TMDB) :", conAR.length);
  console.log("SIN proveedor AR        :", sinAR.length);
  console.log("  ...de ésos, con homepage disneyplus.com:", conLinkDisney.length);
  console.log();
  console.log("--- SIN AR ---");
  for (const f of sinAR) {
    const link = f.homepage ? f.homepage.slice(0, 78) : "(sin homepage)";
    console.log(` tv:${f.id}  ${f.estreno}  ${f.nombre}`);
    console.log(`            redes=${f.redes.join(",")}  regiones=${f.regiones}`);
    console.log(`            ${link}`);
  }
  console.log();
  console.log("--- CON AR ---");
  for (const f of conAR) {
    console.log(` tv:${f.id}  ${f.estreno}  ${f.nombre}  -> ${f.proveedoresAR.join(",")}`);
  }
  console.log();
  console.log("llamadas TMDB:", llamadas);

  const salida = path.join("docs", "medidas", `${hoy}-disponibilidad-disney.json`);
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, JSON.stringify({
    generado: new Date().toISOString(), ventanaDias: DIAS, desde, hasta: hoy,
    red: 2739, totales: {
      candidatos: filas.length, conProveedorAR: conAR.length,
      sinProveedorAR: sinAR.length, sinARconHomepageDisney: conLinkDisney.length,
    },
    filas,
  }, null, 2) + "\n");
  console.log("escrito:", salida);
}

const modo = process.argv[2];
if (modo === "caso") await caso();
else if (modo === "muestra") await muestra();
else { console.error("uso: caso | muestra"); process.exit(1); }
