// Foto COMPLETA de las dos tablas de la agenda, antes de cualquier escritura.
//
// Complementa al snapshot del backfill, que es otra cosa: aquel guarda solo las
// tres columnas localizadas de las filas que va a tocar, y sirve para revertir.
// Esta guarda TODO —todas las columnas, las dos tablas— y sirve para contestar
// "esto estaba asi antes de que empezaramos", incluido lo que el backfill no
// toca y el sync manual si va a mover: fechas, providers, popularidad,
// updated_at.
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function traer(tabla, orden) {
  const r = await fetch(`${U}/rest/v1/${tabla}?select=*&order=${orden}`, {
    headers: { apikey: K, Authorization: `Bearer ${K}` },
  });
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${await r.text()}`);
  return r.json();
}

// Hash sobre el JSON CANONICO (claves ordenadas), para que no dependa del orden
// en que PostgREST serialice los campos.
const canonico = (v) => JSON.stringify(v, Object.keys(
  Array.isArray(v) && v.length ? v[0] : {},
).sort());
function huella(filas) {
  const orden = filas.length ? Object.keys(filas[0]).sort() : [];
  const texto = filas.map((f) => orden.map((k) => `${k}=${JSON.stringify(f[k] ?? null)}`).join("|")).join("\n");
  return createHash("sha256").update(texto).digest("hex");
}

const upcoming = await traer("upcoming_content", "media_type,tmdb_id");
const links = await traer("upcoming_content_providers", "upcoming_id,provider_id");

const ahora = new Date();
const fecha = ahora.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const hora = ahora.toLocaleTimeString("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour12: false }).replace(/:/g, "");

const doc = {
  que_es: "Foto COMPLETA de la agenda de estrenos ANTES del sync manual y del backfill de idioma (tanda 3). Todas las columnas de las dos tablas. Complementa al snapshot del backfill, que solo guarda las tres columnas localizadas de las filas que va a tocar.",
  generado: ahora.toISOString(),
  zona: "America/Argentina/Buenos_Aires",
  tablas: {
    upcoming_content: {
      filas: upcoming.length,
      columnas: upcoming.length ? Object.keys(upcoming[0]).sort() : [],
      sha256: huella(upcoming),
      por_tipo: upcoming.reduce((a, f) => ({ ...a, [f.media_type]: (a[f.media_type] ?? 0) + 1 }), {}),
      rango_release_date: upcoming.length
        ? [upcoming.map((f) => f.release_date).sort()[0], upcoming.map((f) => f.release_date).sort().pop()]
        : null,
      rango_updated_at: upcoming.length
        ? [upcoming.map((f) => f.updated_at).sort()[0], upcoming.map((f) => f.updated_at).sort().pop()]
        : null,
    },
    upcoming_content_providers: {
      filas: links.length,
      columnas: links.length ? Object.keys(links[0]).sort() : [],
      sha256: huella(links),
      providers_distintos: [...new Set(links.map((l) => l.provider_id))].sort((a, b) => a - b),
    },
  },
  como_verificar:
    "Volver a correr scripts/foto-upcoming.mjs y comparar los sha256. El hash se calcula sobre las columnas ORDENADAS alfabeticamente y una fila por linea, asi que no depende de como serialice PostgREST.",
  upcoming_content: upcoming,
  upcoming_content_providers: links,
};

const ruta = `docs/medidas/foto-upcoming-${fecha}T${hora}.json`;
writeFileSync(ruta, JSON.stringify(doc, null, 1));

console.log(`upcoming_content            ${String(upcoming.length).padStart(4)} filas  sha256 ${doc.tablas.upcoming_content.sha256}`);
console.log(`upcoming_content_providers  ${String(links.length).padStart(4)} filas  sha256 ${doc.tablas.upcoming_content_providers.sha256}`);
console.log(`por tipo: ${JSON.stringify(doc.tablas.upcoming_content.por_tipo)}`);
console.log(`release_date: ${doc.tablas.upcoming_content.rango_release_date?.join("  ->  ")}`);
console.log(`updated_at:   ${doc.tablas.upcoming_content.rango_updated_at?.join("  ->  ")}`);
console.log(`providers presentes: ${doc.tablas.upcoming_content_providers.providers_distintos.join(", ")}`);
console.log(`\nescrita: ${ruta}`);
