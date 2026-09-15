// Inventario de TODOS los sitios que atrapan errores (`catch`, `.catch(`,
// `allSettled`) en lib/ y en las rutas API, clasificados.
//
// 🔴 POR QUÉ UN BARRIDO Y NO UNA LISTA DE ONCE. El informe de la Etapa 3
// inventarió once sitios (S1-S11) donde un error de TMDB se convertía en vacío
// o `null`, y la Etapa 3.a los cableó. La auditoría de Codex encontró un
// doceavo (`genreCovers`) que el inventario a mano no tenía. Este archivo
// obliga a clasificar CADA sitio del código que atrapa errores: uno nuevo, o
// uno que cambie de lugar, no compila el test hasta que alguien diga si puede
// tragarse un error de TMDB y, si puede, que registre la causa.
//
// Clases:
//   tmdb-registra   puede recibir un ErrorTmdb y lo registra (registrarDescarteTmdb
//                   en las líneas siguientes, o lo relanza clasificado)
//   tmdb-propaga    catch de una ruta API: responde un estado HTTP; no traga
//                   contenido (la ficha y la búsqueda traducen con respuestaDeErrorTmdb)
//   no-tmdb         lo que atrapa no puede ser un error de TMDB (Supabase, Redis,
//                   JSON del cliente, URL, red del navegador…)
//
// 🔴 ENCONTRAR EL NOMBRE DE LA FUNCIÓN NO DEMUESTRA QUE EL REGISTRO TENGA EFECTO
// (auditoría de Codex sobre 09b9dbe, hallazgo 2): `registrarDescarteTmdb` fuera
// de `withFallosTmdb` era inerte. Cada fila `tmdb-registra` declara ahora su
// EFECTO y el test lo verifica:
//   contexto    el registro lo consume un contexto que alguien abre (el predicado
//               de una caché, el `degradado` del Home): `prueba` es el test
//               funcional que lo ejercita
//   ruta        la ruta o tarea independiente abre `conDescartesRegistrados`, que
//               resume en una línea: `ruta` es el archivo que lo hace
//   observable  el fallo queda en la respuesta (`campo`), además del contexto
//   relanza     no traga: clasifica y relanza un ErrorTmdb
// Y el registrador NUNCA es inerte: fuera de contexto deja una línea estructurada
// (lib/fallos-tmdb.test.ts, "fuera de contexto: devuelve `logueado`").
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const codigo = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8").replace(/\r/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

function archivos(): string[] {
  const out: string[] = [];
  for (const f of fs.readdirSync(path.join(raiz, "lib"))) {
    if (f.endsWith(".ts") && !f.endsWith(".test.ts")) out.push(`lib/${f}`);
  }
  const rutas = (dir: string) => {
    for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      if (e.isDirectory()) rutas(`${dir}/${e.name}`);
      else if (e.name === "route.ts") out.push(`${dir}/${e.name}`);
    }
  };
  rutas("app/api");
  return out.sort();
}

interface Sitio { archivo: string; linea: number; texto: string }
function sitios(): Sitio[] {
  const out: Sitio[] = [];
  for (const rel of archivos()) {
    // Sin comentarios (de bloque y de línea), conservando los números de línea.
    // El `\r` se quita antes: es terminador de línea para `.` y para `$`, y
    // dejaba pasar comentarios en un checkout con CRLF.
    const fuente = fs.readFileSync(path.join(raiz, rel), "utf8").replace(/\r/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
    fuente.split("\n").forEach((l, i) => {
      const sin = l.replace(/\/\/.*$/, "");
      if (/\bcatch\b/.test(sin) || /allSettled\(/.test(sin)) out.push({ archivo: rel, linea: i + 1, texto: sin.trim() });
    });
  }
  return out;
}

/**
 * Empareja cada sitio con su fila del inventario. Un mismo texto de ancla
 * puede aparecer varias veces en un archivo (`} catch (e) {`): las filas se
 * asignan EN ORDEN de aparición, y `n` en la fila dice cuál es (1 por defecto).
 */
function emparejar(): { sitio: Sitio; fila: Fila | null }[] {
  const usadas = new Set<Fila>();
  return sitios().map((sitio) => {
    const fila = INVENTARIO.find((f) => !usadas.has(f) && f.archivo === sitio.archivo && sitio.texto.includes(f.ancla)) ?? null;
    if (fila) usadas.add(fila);
    return { sitio, fila };
  });
}

type Efecto =
  | { efecto: "contexto"; prueba: string }
  | { efecto: "ruta"; ruta: string }
  | { efecto: "observable"; campo: string; prueba: string }
  | { efecto: "relanza" };
type Fila = { archivo: string; ancla: string; motivo?: string } & (
  | ({ clase: "tmdb-registra" } & Efecto)
  | { clase: "tmdb-propaga" }
  | { clase: "no-tmdb" }
);

/** EL INVENTARIO: un ancla (fragmento único de la línea) por sitio, en orden de aparición. */
const INVENTARIO: Fila[] = [
  // --- pueden recibir un ErrorTmdb: registran la causa, con su EFECTO ------
  { archivo: "lib/enrich.ts", ancla: "providersOf(type, id).catch", clase: "tmdb-registra", efecto: "observable", campo: "degradacion.proveedores", prueba: "lib/etapa3a-cableado.test.ts" }, // ficha
  { archivo: "lib/enrich.ts", ancla: "pickTrailer((await titleVideos(type, id, lang)).results, lang)).catch", clase: "tmdb-registra", efecto: "observable", campo: "degradacion.trailer", prueba: "lib/etapa3a-cableado.test.ts" }, // ficha
  { archivo: "lib/enrich.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "contexto", prueba: "lib/etapa3a-cableado.test.ts" },       // titleCard: `fallo = true` → no se guarda; contexto de la card
  { archivo: "lib/lotes-tolerantes.ts", ancla: "Promise.allSettled(o.ids.map", clase: "tmdb-registra", efecto: "contexto", prueba: "lib/lotes-tolerantes.test.ts" }, // directores: `fallo` → resolverConCache no guarda; la ruta resume
  { archivo: "lib/lotes-tolerantes.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "contexto", prueba: "lib/lotes-tolerantes.test.ts" },               // portadas: ídem
  { archivo: "lib/busqueda-enriquecido.ts", ancla: "deps.enriquecer(c).then((t) => ({ t, degradado: false })).catch", clase: "tmdb-registra", efecto: "contexto", prueba: "lib/busqueda-enriquecido.test.ts" },
  { archivo: "lib/settle-all.ts", ancla: "Promise.allSettled(tareas)", clase: "tmdb-registra", efecto: "contexto", prueba: "lib/fallos-tmdb.test.ts" },
  { archivo: "lib/pools.ts", ancla: "Promise.allSettled(tareas)", clase: "tmdb-registra", efecto: "contexto", prueba: "scripts/banco/etapa3a-parcial.mjs" },        // Home: degradado (banco de 429 parcial)
  { archivo: "lib/home.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "contexto", prueba: "scripts/banco/etapa3a-parcial.mjs" },                     // safe(): producirHome consume
  { archivo: "lib/top.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "ruta", ruta: "app/api/top/route.ts" },                                         // safe() de un bloque
  { archivo: "lib/idioma.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "contexto", prueba: "lib/fallos-tmdb.test.ts" },                              // respaldo de lote: `fallo: true` + contexto del llamador
  { archivo: "lib/idioma.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "contexto", prueba: "lib/fallos-tmdb.test.ts" },                              // respaldo de un item
  { archivo: "lib/netflix-top10.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "ruta", ruta: "app/api/cron/netflix-top10/route.ts" },               // enNetflixAR
  { archivo: "lib/netflix-resolver.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "ruta", ruta: "app/api/cron/netflix-top10/route.ts" },            // buscar
  { archivo: "lib/netflix-resolver.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "ruta", ruta: "app/api/cron/netflix-top10/route.ts" },            // buscar (reducida)
  { archivo: "lib/disponibilidad.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "contexto", prueba: "lib/fallos-disponibilidad.test.ts" },           // leerDatosTitulo: `fallo = true` → withFallosDeFuentes del llamador
  { archivo: "lib/tmdb.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "relanza", motivo: "es el cliente: clasifica el fetch y relanza ErrorTmdb" },
  { archivo: "lib/tmdb.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "relanza", motivo: "es el cliente: clasifica el cuerpo y relanza ErrorTmdb" },
  { archivo: "lib/tmdb-politica.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "relanza", motivo: "el bucle decide con la política y relanza" },
  { archivo: "app/api/recordatorio/route.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "ruta", ruta: "app/api/recordatorio/route.ts" },            // digitalAR
  { archivo: "app/api/recordatorio/route.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "ruta", ruta: "app/api/recordatorio/route.ts" },            // datosDe
  // --- rutas: propagan como estado HTTP --------------------------------------
  { archivo: "app/api/title/[tipo]/[id]/route.ts", ancla: "} catch (e) {", clase: "tmdb-propaga" },
  { archivo: "app/api/search/route.ts", ancla: "} catch (e) {", clase: "tmdb-propaga" },
  ...["admin-search", "audience", "cards", "cron/netflix-top10", "directores", "discover", "genre-covers", "hacete-cargo", "home", "latest", "mas-votados", "miniseries", "person/[id]", "personas", "providers", "recomendaciones", "ruleta", "top", "upcoming", "admin/top", "te-va-a-gustar"]
    .map((r) => ({ archivo: `app/api/${r}/route.ts`, ancla: "} catch (e) {", clase: "tmdb-propaga" as const })),
  { archivo: "lib/cors.ts", ancla: "} catch (error) {", clase: "tmdb-propaga", motivo: "envoltorio de rutas: 500 con CORS" },
  { archivo: "lib/home-servir.ts", ancla: "} catch (error) {", clase: "tmdb-propaga", motivo: "productor rechazado: libera el turno y sirve UB o propaga" },
  // --- no pueden ser errores de TMDB -----------------------------------------
  { archivo: "lib/disponibilidad.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "top oficial: Supabase" },
  { archivo: "lib/disponibilidad.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "top manual: Supabase" },
  { archivo: "lib/curated.ts", ancla: "}).catch((e) => {", clase: "no-tmdb", motivo: "blocklist de un chip: Supabase" },
  { archivo: "lib/top.ts", ancla: "} catch (e) {", clase: "no-tmdb", motivo: "publicaciones manuales: Supabase (segunda aparición)" },
  { archivo: "lib/top-manual.ts", ancla: "} catch (e) {", clase: "no-tmdb", motivo: "Supabase" },
  { archivo: "lib/cache.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/cache.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/cache.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/cache.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/cache.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/escritura-cache.ts", ancla: "} catch (error) {", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno-memoria.ts", ancla: "catch", clase: "no-tmdb", motivo: "JSON en memoria" },
  { archivo: "lib/supabase.ts", ancla: "catch", clase: "no-tmdb", motivo: "Supabase" },
  { archivo: "lib/supabase.ts", ancla: "catch", clase: "no-tmdb", motivo: "Supabase" },
  { archivo: "lib/supabase.ts", ancla: "catch", clase: "no-tmdb", motivo: "Supabase" },
  { archivo: "lib/admin-auth.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "Supabase auth" },
  { archivo: "lib/admin-auth-nucleo.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "token" },
  { archivo: "lib/api-base.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "URL en el navegador" },
  { archivo: "lib/barra-estado.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "navegador" },
  { archivo: "lib/enlace-oficial.ts", ancla: "catch { return null; }", clase: "no-tmdb", motivo: "new URL()" },
  { archivo: "lib/netflix-top10.ts", ancla: "reader.cancel().catch", clase: "no-tmdb", motivo: "stream del TSV" },
  { archivo: "app/api/admin/top/route.ts", ancla: "catch { return NextResponse.json({ error: \"cuerpo inválido\" }", clase: "no-tmdb", motivo: "JSON del cliente" },
  { archivo: "app/api/admin/top/route.ts", ancla: "} catch (e) {", clase: "tmdb-propaga", motivo: "segundo handler de la ruta de admin (Supabase)" },
  { archivo: "app/api/cuenta/eliminar/route.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "Supabase" },
  { archivo: "app/api/te-va-a-gustar/route.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "JSON del cliente" },
];

test("cada sitio que atrapa errores está clasificado, y cada fila del inventario corresponde a un sitio", () => {
  const pares = emparejar();
  const sinClasificar = pares.filter((p) => !p.fila).map((p) => p.sitio);
  assert.deepEqual(sinClasificar, [], `sitios sin clasificar: ${JSON.stringify(sinClasificar, null, 1)}`);
  const usadas = new Set(pares.map((p) => p.fila));
  const huerfanas = INVENTARIO.filter((f) => !usadas.has(f));
  assert.deepEqual(huerfanas, [], "filas del inventario sin sitio (ancla muerta o de más)");
});

test("los sitios `tmdb-registra` registran la causa (registrarDescarteTmdb o relanzan un ErrorTmdb) en las 14 líneas siguientes", () => {
  for (const { sitio, fila } of emparejar()) {
    if (fila?.clase !== "tmdb-registra") continue;
    const lineas = fs.readFileSync(path.join(raiz, sitio.archivo), "utf8").split("\n");
    const ventana = lineas.slice(sitio.linea - 1, sitio.linea + 14).join("\n");
    assert.match(ventana, /registrarDescarteTmdb\(|new ErrorTmdb\(|decidir\(e,/, `${sitio.archivo}:${sitio.linea} no registra la causa: ${sitio.texto}`);
  }
});

test("cada `tmdb-registra` declara un efecto verificable: ruta que resume, prueba funcional, campo observable o relanzado", () => {
  for (const { sitio, fila } of emparejar()) {
    if (fila?.clase !== "tmdb-registra") continue;
    const donde = `${sitio.archivo}:${sitio.linea}`;
    if (fila.efecto === "ruta") {
      assert.match(codigo(fila.ruta), /conDescartesRegistrados\(/, `${donde}: la ruta ${fila.ruta} no abre conDescartesRegistrados`);
    } else if (fila.efecto === "contexto") {
      assert.ok(fs.existsSync(path.join(raiz, fila.prueba)), `${donde}: la prueba ${fila.prueba} no existe`);
    } else if (fila.efecto === "observable") {
      const [obj, campo] = fila.campo.split(".");
      assert.match(codigo(sitio.archivo), new RegExp(`${obj}\\.${campo}\\s*=`), `${donde}: no escribe ${fila.campo}`);
      assert.ok(fs.existsSync(path.join(raiz, fila.prueba)), `${donde}: la prueba ${fila.prueba} no existe`);
    } else {
      const lineas = fs.readFileSync(path.join(raiz, sitio.archivo), "utf8").split("\n");
      assert.match(lineas.slice(sitio.linea - 1, sitio.linea + 14).join("\n"), /throw /, `${donde}: dice relanza y no relanza`);
    }
  }
});

test("las rutas independientes que registran resumen sus descartes con conDescartesRegistrados (una línea por solicitud)", () => {
  for (const r of ["app/api/directores/route.ts", "app/api/genre-covers/route.ts", "app/api/top/route.ts", "app/api/cron/netflix-top10/route.ts", "app/api/recordatorio/route.ts"]) {
    assert.match(codigo(r), /conDescartesRegistrados\("[^"]+", /, `${r} no resume sus descartes`);
  }
});

test("el inventario cubre los doce sitios del informe (S1-S11 + genreCovers) y no afirma que sean sólo once", () => {
  const registran = new Set(INVENTARIO.filter((i) => i.clase === "tmdb-registra").map((i) => i.archivo));
  for (const a of ["lib/home.ts", "lib/settle-all.ts", "lib/enrich.ts", "lib/lotes-tolerantes.ts", "lib/pools.ts", "lib/top.ts", "lib/netflix-top10.ts", "lib/idioma.ts", "lib/busqueda-enriquecido.ts", "lib/disponibilidad.ts", "lib/netflix-resolver.ts", "app/api/recordatorio/route.ts"]) {
    assert.ok(registran.has(a), `${a} falta entre los que registran`);
  }
});
