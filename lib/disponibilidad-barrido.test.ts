// Barrido: que nadie vuelva a decidir disponibilidad por su cuenta.
//
// EL BUG QUE ESTE ARCHIVO EXISTE PARA IMPEDIR. El arreglo de Moria (top oficial
// de Netflix) era correcto y estaba SOLO en la ficha, porque la ficha era la que
// se había reportado. Las cards, la búsqueda y los relacionados seguían pintando
// gris el mismo título. Nadie lo hizo mal: simplemente no había nada que
// obligara a que la decisión viviera en un solo lugar.
//
// Ahora sí. `lib/disponibilidad.ts` es el único que decide, y estos tests fallan
// si una superficie nueva lee el dato crudo y se lo saltea.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PLATAFORMAS_OFICIALES } from "./enlace-oficial.ts";

const raiz = path.resolve(import.meta.dirname, "..");
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");

const existeArchivo = (rel: string) => fs.existsSync(path.join(raiz, rel));

/** El código sin comentarios: la prosa explica las reglas y no las infringe. */
function codigo(rel: string): string {
  return leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function fuentes(...dirs: string[]): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        out.push(path.relative(raiz, p).split(path.sep).join("/"));
      }
    }
  };
  for (const d of dirs) rec(path.join(raiz, d));
  return out;
}

const TODAS = fuentes("lib", "app", "components", "hooks");

// ============================================================================
// 1. El dato crudo de TMDB no se lee fuera de enrich
// ============================================================================

// Los tres que pueden tocar el dato crudo, cada uno con su motivo. Una
// excepción sin motivo registrado es un agujero disfrazado de decisión.
const PUEDEN_LEER_CRUDO: Record<string, string> = {
  "lib/tmdb.ts": "es el cliente HTTP de TMDB: acá vive la llamada",
  "lib/enrich.ts": "`providersOf` (privada) y el adaptador del resolvedor central",
  "lib/netflix-top10.ts":
    "NO decide disponibilidad: `enNetflixAR` desambigua homónimos al resolver un "
    + "título del TSV a un id de TMDB. Es una ENTRADA de la evidencia, no una salida "
    + "hacia la interfaz — lo que la app muestra sigue saliendo del resolvedor.",
};

test("sólo los archivos autorizados llaman a watchProviders()", () => {
  const infractores = TODAS.filter(
    (f) => !(f in PUEDEN_LEER_CRUDO) && /\bwatchProviders\s*\(/.test(codigo(f)),
  );
  assert.deepEqual(infractores, [],
    "estos archivos leen watch/providers directo y se saltean el resolvedor:\n" + infractores.join("\n"));
});

test("cada autorización para leer el dato crudo tiene su motivo", () => {
  for (const [f, motivo] of Object.entries(PUEDEN_LEER_CRUDO)) {
    assert.ok(fs.existsSync(path.join(raiz, f)), `${f} ya no existe: sacá la excepción`);
    assert.ok(motivo.length > 30, `${f}: el motivo no explica nada`);
  }
});

test("`providersOf` no se exporta: es privada de enrich", () => {
  // Si se exportara, cualquier superficie podría tomar `codes` y pintar con eso,
  // que es exactamente el camino que dejó las cards en gris con Moria.
  assert.doesNotMatch(codigo("lib/enrich.ts"), /export\s+(async\s+)?function\s+providersOf/);
});

test("nadie más define su propia función de plataformas de un título", () => {
  // `plataformasDeFicha` era el segundo camino y se eliminó. Que no vuelva.
  const infractores = TODAS.filter((f) => /plataformasDeFicha/.test(codigo(f)));
  assert.deepEqual(infractores, [], "volvió un segundo camino de decisión");
});

// ============================================================================
// 2. `networks` nunca se usa sola
// ============================================================================

test("`networks` sólo se lee donde la regla estricta lo permite", () => {
  // La regla vieja era "networks nunca se usa". La nueva es "nunca se usa
  // SOLA", y el único lugar donde se combina con lo demás es enlace-oficial.ts.
  // enrich.ts la lee para ARMAR los datos que esa regla evalúa, no para decidir.
  const AUTORIZADOS = new Set([
    "lib/enlace-oficial.ts",  // la regla
    "lib/enrich.ts",          // arma DatosSerie y se lo pasa
    "lib/tmdb.ts",            // el tipo del campo
  ]);
  const infractores = TODAS.filter(
    (f) => !AUTORIZADOS.has(f) && /\bnetworks\b/.test(codigo(f)),
  );
  assert.deepEqual(infractores, [],
    "estos archivos miran `networks` fuera de la regla estricta:\n" + infractores.join("\n"));
});

test("enrich no decide con networks: sólo se lo pasa a la regla", () => {
  const src = codigo("lib/enrich.ts");
  // Lo único que hace con `networks` es mapear ids para DatosSerie.
  const usos = src.match(/[^\n]*\bnetworks\b[^\n]*/g) ?? [];
  assert.equal(usos.length, 1, `enrich usa networks en ${usos.length} lugares:\n${usos.join("\n")}`);
  assert.match(usos[0], /redes:/, "el único uso tiene que ser armar `redes` de DatosSerie");
});

// ============================================================================
// 3. La allowlist de dominios no se afloja
// ============================================================================

test("el dominio se compara por host completo, nunca con includes/endsWith", () => {
  const src = codigo("lib/enlace-oficial.ts");
  assert.match(src, /hosts\.includes\(u\.hostname/, "dejó de comparar el host completo");
  // Un `homepage.includes("disneyplus.com")` aceptaría disneyplus.com.evil.ru.
  assert.doesNotMatch(src, /homepage\.includes\(/, "compara la URL como texto");
  assert.doesNotMatch(src, /hostname\.endsWith\(/, "endsWith acepta subdominios ajenos");
});

test("la regla exige https, ruta de título y locale propio", () => {
  const src = codigo("lib/enlace-oficial.ts");
  assert.match(src, /u\.protocol !== "https:"/);
  assert.match(src, /rutaTitulo\.test\(/);
  assert.match(src, /locale !== LOCALE_AR/);
});

test("no se habilitó ninguna plataforma sin verificar", () => {
  // Hoy hay UNA. El número está acá para que sumar otra sea una decisión y no
  // un descuido: cada combinación de red, dominio y ruta hay que medirla.
  assert.equal(PLATAFORMAS_OFICIALES.length, 1,
    "se agregó una plataforma: verificá red, dominio, ruta e ids globales, y actualizá este número");
  assert.equal(PLATAFORMAS_OFICIALES[0].code, "d");
});

test("el caso testigo no está hardcodeado en ningún lado", () => {
  const infractores = TODAS.filter((f) => /275224/.test(codigo(f)));
  assert.deepEqual(infractores, [], "tv:275224 quedó hardcodeado: la regla tiene que ser general");
});

// ============================================================================
// 3.bis La señal de fallo llega a las cachés de afuera
// ============================================================================

test("el adaptador REGISTRA el fallo, no se lo queda", () => {
  const src = codigo("lib/enrich.ts");
  assert.match(src, /if \(r\.fallo\) registrarFalloDisponibilidad\(\)/,
    "disponibilidadDe perdió la señal: la card, el Home y la lista guardarían resultados incompletos");
});

test("el contexto llega a todos los archivos que cachean títulos", () => {
  // El conteo por superficie lo fija lib/cache-disponibilidad-inventario.test.ts,
  // que obliga a clasificar CADA cachedLoc del proyecto. Acá sólo se comprueba
  // que ningún archivo con superficies que enriquecen se quedó sin el contexto.
  for (const a of ["lib/enrich.ts", "lib/home.ts", "lib/top.ts", "lib/reco.ts"]) {
    assert.match(codigo(a), /withFallosDisponibilidad\(/, `${a} no envuelve`);
  }
});

test("un fallo de disponibilidad degrada el payload del Home", () => {
  const src = codigo("lib/home.ts");
  assert.match(src, /degradado: true/,
    "el Home no marca degradado, así que `cachedLocIf` lo guardaría igual");
});

test("los predicados de guardado siguen mirando la señal", () => {
  const enrich = codigo("lib/enrich.ts");
  assert.match(enrich, /if \(fallos\) fallo = true/, "la card no propaga");
  assert.match(enrich, /if \(fallos\) senal\.fallo = true/, "la lista no propaga");
});

// ============================================================================
// 4. El riel "Últimos lanzamientos" y su selector
// ============================================================================

test("el selector de `ultimos` está cableado al parámetro del Home", () => {
  // 🔴 El bug que esto impide: el riel declaraba el toggle en el composer pero
  // `TOGGLE_KEYS` no incluía `ultimos`, así que el botón cambiaba en pantalla y
  // `/api/home` seguía recibiendo el mismo `t`. Los tests estructurales del
  // composer no podían verlo.
  const nucleo = codigo("hooks/home-types-nucleo.ts");
  assert.match(nucleo, /"ultimos"/, "`ultimos` no es clave de refetch");
  assert.match(nucleo, /DEFAULTS_TOGGLE[\s\S]{0,120}ultimos:\s*"movie"/,
    "el default de `ultimos` no está declarado como movie");
  // Y que el hook use el núcleo en vez de tener su propia lista, que es como
  // se desincronizaron la primera vez.
  const hook = codigo("hooks/useHomeTypes.ts");
  assert.match(hook, /from "\.\/home-types-nucleo"/);
  assert.doesNotMatch(hook, /const TOGGLE_KEYS\s*=/, "el hook volvió a tener su propia lista");
});

test("la lista de últimos NO tiene ninguna ventana fija del catálogo regional", () => {
  const src = codigo("lib/enrich.ts");
  // Hubo DOS regresiones seguidas acá: primero mezclar 3 páginas por fuente y
  // terminar, y después un tope de 12 "de seguridad", que era lo mismo con otro
  // nombre. El único límite legítimo es `total_pages` de TMDB.
  assert.doesNotMatch(src, /ULTIMOS_PAGINAS\b(?!_RED)/, "volvió la ventana fija");
  assert.doesNotMatch(src, /ULTIMOS_MAX_PAGINAS/, "volvió un tope de páginas inventado");
  assert.match(src, /totalPaginas/, "no usa el límite real de la fuente");
  // Y el COMPORTAMIENTO —página 13, empates en el borde, agotamiento real— lo
  // fija lib/ultimos-paginacion.test.ts con la fuente inyectada. Un regex sobre
  // una constante no prueba nada de eso, y por eso no alcanza con este test.
  assert.ok(existeArchivo("lib/ultimos-paginacion.test.ts"),
    "se borró el test de comportamiento de la paginación");
});

test("cada tramo de la lista se cachea por separado", () => {
  const src = codigo("lib/enrich.ts");
  // Si un solo cache cubriera la página entera, pedir la 2 rearmaría la 1.
  assert.match(src, /claveUltimosSeries\(hoy, orden, `reg:p\$\{pagina\}`/);
  assert.match(src, /claveUltimosSeries\(hoy, orden, "red"/);
});

test("el riel `ultimos` declara toggle, clave y tipo activo", () => {
  const src = codigo("lib/home.ts");
  const linea = (src.match(/[^\n]*key: "ultimos"[\s\S]{0,320}/) ?? [""])[0];
  assert.match(linea, /typeToggle: "refetch"/, "el riel no tiene selector con refetch");
  assert.match(linea, /shelfKey: "ultimos"/, "el riel no tiene su clave estable");
  assert.match(linea, /activeType: tipoUltimos/, "el riel no manda el tipo activo");
  assert.match(linea, /seeAllHref: `\/lista\/ultimos\?tipo=\$\{tipoUltimos\}`/,
    "\"Ver todas\" no conserva el tipo");
});

test("el default del riel sigue siendo Películas", () => {
  // El Home inicial de quien nunca tocó el selector no puede cambiar.
  assert.match(codigo("lib/home.ts"), /const tipoUltimos: MediaType = types\["ultimos"\] \?\? "movie";/);
});

test("la fuente del riel usa el tipo elegido, no `movie` fijo", () => {
  const src = codigo("lib/home.ts");
  assert.doesNotMatch(src, /latestReleases\(providers, "movie"/,
    "quedó cableado a movie: el selector no haría nada");
  assert.equal((src.match(/latestReleases\(providers, tipoUltimos/g) ?? []).length, 2,
    "las dos páginas (p1 y su fallback p2) tienen que usar el mismo tipo");
});

test("la versión de la clave del Home subió a v6", () => {
  // Un payload v5 cacheado no trae el selector: sin subir la versión, el cambio
  // no se vería hasta que expirara el TTL de 6 h.
  assert.match(codigo("lib/claves.ts"), /home:\$\{pre\(huella\)\}v6:/);
});

test("los skeletons reservan el selector también en el primer riel", () => {
  const src = codigo("components/CatalogView.tsx");
  assert.match(src, /conToggle=\{i < RIELES - 2\}/,
    "el primer riel quedó sin reservar el selector: vuelve el salto de layout");
});

test("`/lista/ultimos` recibe el tipo desde el server, no de useSearchParams", () => {
  const pagina = codigo("app/lista/[key]/page.tsx");
  assert.match(pagina, /searchParams\?\.tipo === "tv" \? "tv" : "movie"/);
  assert.match(pagina, /<UltimosView tipoInicial=/);
  assert.doesNotMatch(codigo("components/UltimosView.tsx"), /useSearchParams/);
});

test("al volver atrás manda el snapshot, no la URL", () => {
  // Misma regla que /categoria: si ganara la URL, volver de una ficha te
  // devolvía a Películas después de haber elegido Series.
  const src = codigo("components/UltimosView.tsx");
  assert.match(src, /if \(inicial\.extra\?\.tipo\) setTipo\(inicial\.extra\.tipo\)/);
});
