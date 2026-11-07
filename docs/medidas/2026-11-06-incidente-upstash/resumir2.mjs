import { readFileSync } from "node:fs";
const leer = (e, l) => JSON.parse(readFileSync(new URL(`./fichas-${e}-L${l}.json`, import.meta.url), "utf8"));
for (const l of ["0", "1"]) {
  const a = leer("antes", l), d = leer("despues", l);
  console.log(`\n=== latencia ${l}`);
  console.log("caso".padEnd(30), "viajes".padEnd(10), "cmd".padEnd(11), "MGET".padEnd(9), "claves".padEnd(9), "SET".padEnd(8), "tmdb".padEnd(8), "ms".padEnd(11), "igual");
  a.forEach((x, i) => {
    const y = d[i];
    const c = (k) => `${x[k]}→${y[k]}`;
    console.log(x.caso.padEnd(30), c("viajes").padEnd(10), c("comandos").padEnd(11), c("MGET").padEnd(9), c("claves").padEnd(9), c("SET").padEnd(8), c("tmdb").padEnd(8), c("ms").padEnd(11), x.hash === y.hash ? "sí" : `NO ${x.hash}/${y.hash}`);
  });
}
const a = leer("antes", "0"), d = leer("despues", "0");
const ver = (n) => { const i = a.findIndex((x) => x.caso === n); console.log(`\n${n}\n antes  leídas ${JSON.stringify(a[i].leidas)} escritas ${JSON.stringify(a[i].escritas)} otros ${a[i].otros} lotes ${a[i].lotes.slice(0, 70)}\n despues leídas ${JSON.stringify(d[i].leidas)} escritas ${JSON.stringify(d[i].escritas)} otros ${d[i].otros} lotes ${d[i].lotes}`); console.log(" control:", JSON.stringify({ plat: a[i].plataformas, trailer: a[i].trailer, rel: a[i].relacionados, relPlat: a[i].relConPlataforma, bloque: a[i].obrasEnBloque, conPlat: a[i].conPlataforma })); };
ver("title sinAR p1 fría"); ver("title AR p1 fría"); ver("person sinAR p1 fría"); ver("person AR p1 fría"); ver("title sinAR a los 5 min");
const planos = [...a, ...leer("antes", "1")]; console.log("\ntráilers presentes:", planos.filter((x) => x.trailer).length, "de", planos.filter((x) => "trailer" in x).length, "· relacionados con plataforma >0:", planos.filter((x) => x.relConPlataforma > 0).length);
