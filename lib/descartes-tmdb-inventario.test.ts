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
//                   en las líneas siguientes) — se verifica automáticamente
//   tmdb-propaga    catch de una ruta API: responde un estado HTTP; no traga
//                   contenido (la ficha y la búsqueda traducen con respuestaDeErrorTmdb)
//   no-tmdb         lo que atrapa no puede ser un error de TMDB (Supabase, Redis,
//                   JSON del cliente, URL, red del navegador…)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");

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
type Fila = (typeof INVENTARIO)[number];
function emparejar(): { sitio: Sitio; fila: Fila | null }[] {
  const usadas = new Set<Fila>();
  return sitios().map((sitio) => {
    const fila = INVENTARIO.find((f) => !usadas.has(f) && f.archivo === sitio.archivo && sitio.texto.includes(f.ancla)) ?? null;
    if (fila) usadas.add(fila);
    return { sitio, fila };
  });
}

/** EL INVENTARIO: un ancla (fragmento único de la línea) por sitio. */
const INVENTARIO: { archivo: string; ancla: string; clase: "tmdb-registra" | "tmdb-propaga" | "no-tmdb"; motivo?: string }[] = [
  // --- pueden recibir un ErrorTmdb: registran la causa --------------------
  { archivo: "lib/enrich.ts", ancla: "providersOf(type, id).catch", clase: "tmdb-registra" },               // ficha: proveedores opcionales
  { archivo: "lib/enrich.ts", ancla: "pickTrailer((await titleVideos(type, id, lang)).results, lang)).catch", clase: "tmdb-registra" }, // ficha: trailer opcional
  { archivo: "lib/enrich.ts", ancla: "} catch (e) {", clase: "tmdb-registra" },                              // titleCard
  { archivo: "lib/lotes-tolerantes.ts", ancla: "Promise.allSettled(o.ids.map", clase: "tmdb-registra" },     // directores
  { archivo: "lib/lotes-tolerantes.ts", ancla: "} catch (e) {", clase: "tmdb-registra" },                    // portadas de género
  { archivo: "lib/busqueda-enriquecido.ts", ancla: "deps.enriquecer(c).then((t) => ({ t, degradado: false })).catch", clase: "tmdb-registra" },
  { archivo: "lib/settle-all.ts", ancla: "Promise.allSettled(tareas)", clase: "tmdb-registra" },
  { archivo: "lib/pools.ts", ancla: "Promise.allSettled(tareas)", clase: "tmdb-registra" },
  { archivo: "lib/home.ts", ancla: "} catch (e) {", clase: "tmdb-registra" },                                // safe()
  { archivo: "lib/top.ts", ancla: "} catch (e) {", clase: "tmdb-registra" },                                 // safe() de un bloque
  { archivo: "lib/idioma.ts", ancla: "} catch (e) {", clase: "tmdb-registra" },                              // respaldo de lote
  { archivo: "lib/idioma.ts", ancla: "} catch (e) {", clase: "tmdb-registra" },                              // respaldo de un item
  { archivo: "lib/netflix-top10.ts", ancla: "} catch (e) {", clase: "tmdb-registra" },                       // enNetflixAR
  { archivo: "lib/netflix-resolver.ts", ancla: "} catch (e) {", clase: "tmdb-registra" },                    // buscar
  { archivo: "lib/netflix-resolver.ts", ancla: "} catch (e) {", clase: "tmdb-registra" },                    // buscar (reducida)
  { archivo: "lib/disponibilidad.ts", ancla: "} catch (e) {", clase: "tmdb-registra" },                      // leerDatosTitulo (TMDB en IDIOMA_EVIDENCIA)
  { archivo: "lib/tmdb.ts", ancla: "} catch (e) {", clase: "tmdb-registra", motivo: "es el cliente: clasifica el fetch y relanza ErrorTmdb" },
  { archivo: "lib/tmdb.ts", ancla: "} catch (e) {", clase: "tmdb-registra", motivo: "es el cliente: clasifica el cuerpo y relanza ErrorTmdb" },
  { archivo: "lib/tmdb-politica.ts", ancla: "} catch (e) {", clase: "tmdb-registra", motivo: "el bucle decide con la política y relanza" },
  { archivo: "app/api/recordatorio/route.ts", ancla: "} catch (e) {", clase: "tmdb-registra" },              // digitalAR: detalle de TMDB
  { archivo: "app/api/recordatorio/route.ts", ancla: "} catch (e) {", clase: "tmdb-registra" },              // datosDe: detalle de TMDB
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

test("el inventario cubre los doce sitios del informe (S1-S11 + genreCovers) y no afirma que sean sólo once", () => {
  const registran = new Set(INVENTARIO.filter((i) => i.clase === "tmdb-registra").map((i) => i.archivo));
  for (const a of ["lib/home.ts", "lib/settle-all.ts", "lib/enrich.ts", "lib/lotes-tolerantes.ts", "lib/pools.ts", "lib/top.ts", "lib/netflix-top10.ts", "lib/idioma.ts", "lib/busqueda-enriquecido.ts", "lib/disponibilidad.ts", "lib/netflix-resolver.ts", "app/api/recordatorio/route.ts"]) {
    assert.ok(registran.has(a), `${a} falta entre los que registran`);
  }
});
