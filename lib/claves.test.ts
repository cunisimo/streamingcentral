// Claves de cache: modo compatible, huella de idioma, rollback y el barrido
// que impide que una clave localizada se construya a mano.
//
// Lo que protege: si el idioma cambia y las claves no, un rollback a es-ES
// sigue leyendo títulos mexicanos de las MISMAS claves hasta que expire el TTL
// (24 h en varias familias) y el rollback no revierte nada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  claveCard, claveCombinadaCache, claveHome, clavePeoplePopular, clavePoolCache,
  claveReco, claveRecoCruce, claveRecoMismo, claveRecoPerfil, claveSearch, claveTopPop,
} from "./claves.ts";
import { calcularHuella } from "./idioma.ts";

// ============================================================================
// 1. MODO COMPATIBLE: byte a byte lo que producía el código PRE-TANDA-1
// ============================================================================
// Ya no es lo que corre en producción —la tanda 2 puso la huella— pero sigue
// siendo el "antes" del rollback: son las claves que quedaron escritas en
// Upstash con es-ES y que nadie tiene que volver a leer por accidente.

test("modo compatible: las once familias producen los bytes pre-tanda-1", () => {
  const H = "";   // la huella vacía, que es lo que se pasaba en la tanda 1
  assert.equal(claveHome(3523671066, "d,m,n", "", H), "home:v5:3523671066:d,m,n:");
  assert.equal(
    clavePoolCache("v1", "AR", "2026-08-23", "movie", "n", "pop.abc123", 2, H),
    "disc:v1:AR:2026-08-23:movie:n:pop.abc123:p2",
  );
  assert.equal(
    claveCombinadaCache("v1", "AR", "2026-08-23", "tv", "d+m+n", "pop.abc123", 3, H),
    "disc:v1:AR:2026-08-23:tv:combo-d+m+n:pop.abc123:p3",
  );
  assert.equal(claveCard("movie", 278, H), "card:movie:278");
  assert.equal(claveTopPop("n", "movie", H), "top:pop:n:movie");
  assert.equal(claveReco("h4sh", H), "reco:v2:h4sh");
  assert.equal(claveRecoMismo("tv", 1399, H), "reco:mismo:tv:1399");
  assert.equal(claveRecoCruce("movie", 557, "d,m,n", H), "reco:cruce:movie:557:d,m,n");
  assert.equal(claveRecoPerfil("movie", 557, H), "reco:perfil:v2:movie:557");
  assert.equal(clavePeoplePopular(3, H), "people:popular:3");
  // La familia 11: `search:v2` SÍ es localizada, aunque `searchDeTipo` esté
  // clavado en es-MX — el `knownFor` de las personas sale del idioma base.
  assert.equal(claveSearch("matrix", "d,m,n", H), "search:v2:matrix:d,m,n");
});

// ============================================================================
// 1bis. TANDA 2: las claves que produce la configuración de producción
// ============================================================================
// Los literales completos, a propósito. Son las claves que van a aparecer en
// Upstash después del deploy, y tenerlas escritas acá es lo que permite mirar
// el panel y confirmar que el arranque frío ocurrió una sola vez y en la
// familia que corresponde. La huella sale de `calcularHuella`, no de una
// cadena a mano: si la fórmula cambia, este test cambia con ella.

test("tanda 2: las once familias llevan la huella es-MX+f.r1", () => {
  const H = calcularHuella("es-MX", true);
  assert.equal(H, "es-MX+f.r1");
  assert.equal(claveHome(3523671066, "d,m,n", "", H), "home:es-MX+f.r1:v5:3523671066:d,m,n:");
  assert.equal(
    clavePoolCache("v1", "AR", "2026-08-23", "movie", "n", "pop.abc123", 2, H),
    "disc:es-MX+f.r1:v1:AR:2026-08-23:movie:n:pop.abc123:p2",
  );
  assert.equal(
    claveCombinadaCache("v1", "AR", "2026-08-23", "tv", "d+m+n", "pop.abc123", 3, H),
    "disc:es-MX+f.r1:v1:AR:2026-08-23:tv:combo-d+m+n:pop.abc123:p3",
  );
  assert.equal(claveCard("movie", 278, H), "card:es-MX+f.r1:movie:278");
  assert.equal(claveTopPop("n", "movie", H), "top:pop:es-MX+f.r1:n:movie");
  assert.equal(claveReco("h4sh", H), "reco:es-MX+f.r1:v2:h4sh");
  assert.equal(claveRecoMismo("tv", 1399, H), "reco:mismo:es-MX+f.r1:tv:1399");
  assert.equal(claveRecoCruce("movie", 557, "d,m,n", H), "reco:cruce:es-MX+f.r1:movie:557:d,m,n");
  assert.equal(claveRecoPerfil("movie", 557, H), "reco:perfil:es-MX+f.r1:v2:movie:557");
  assert.equal(clavePeoplePopular(3, H), "people:popular:es-MX+f.r1:3");
  assert.equal(claveSearch("matrix", "d,m,n", H), "search:es-MX+f.r1:v2:matrix:d,m,n");
});

// El rollback tiene que devolver EXACTAMENTE las claves de es-ES, y esas no son
// las del modo compatible: `IDIOMA_TITULOS=es-ES` deja huella `es-ES.r1`, no
// vacía. Es la diferencia entre "vuelve a lo de antes de la tanda 2" (sí) y
// "vuelve a lo de antes de la tanda 1" (no, y no hace falta: el contenido es el
// mismo, lo que cambia es que se rearma una vez).
test("tanda 2: el rollback a es-ES da su propio espacio, no el compatible", () => {
  const ES = calcularHuella("es-ES", true);
  assert.equal(ES, "es-ES.r1");
  assert.equal(claveCard("movie", 278, ES), "card:es-ES.r1:movie:278");
  assert.notEqual(claveCard("movie", 278, ES), claveCard("movie", 278, ""));
});

// ============================================================================
// 2. LOS ESPACIOS DE CLAVES — con la huella REAL, no una réplica
// ============================================================================

test("los tres espacios de claves son disjuntos dos a dos", () => {
  const espacios = [
    calcularHuella("es-MX", true),    // es-MX+f.r1
    calcularHuella("es-MX", false),   // es-MX.r1
    calcularHuella("es-ES", true),    // es-ES.r1
  ];
  const familias = [
    (h: string) => claveCard("movie", 278, h),
    (h: string) => claveTopPop("n", "movie", h),
    (h: string) => claveHome(1, "n", "", h),
    (h: string) => clavePeoplePopular(1, h),
    (h: string) => claveRecoMismo("tv", 1399, h),
    (h: string) => clavePoolCache("v1", "AR", "d", "movie", "n", "pop.x", 1, h),
  ];
  for (const f of familias) {
    const claves = espacios.map(f);
    assert.equal(new Set(claves).size, espacios.length, `colisión en ${claves.join(" | ")}`);
  }
});

test("el modo compatible NO colisiona con ningún espacio con huella", () => {
  const compat = claveCard("movie", 278, "");
  for (const h of ["es-MX+f.r1", "es-MX.r1", "es-ES.r1"]) {
    assert.notEqual(claveCard("movie", 278, h), compat);
  }
});

// ============================================================================
// 3. ROLLBACK, sin contaminar cache
// ============================================================================
// Almacén en memoria propio: `lib/cache.ts` necesita credenciales y este test
// no las quiere. Lo que se prueba es el CONTRATO de claves, que es lo que
// decide si un rollback revierte algo.

test("rollback es-MX+f → es-MX → es-ES → es-MX: nunca lee el espacio de otro", () => {
  const almacen = new Map<string, string>();
  const leer = (k: string) => almacen.get(k) ?? null;
  const guardar = (k: string, v: string) => { almacen.set(k, v); };

  // Las huellas salen de la función REAL.
  const MX_F = calcularHuella("es-MX", true);
  const MX = calcularHuella("es-MX", false);
  const ES = calcularHuella("es-ES", true);
  const card = (h: string) => claveCard("movie", 278, h);

  // 1. Generar con es-MX + fallback.
  guardar(card(MX_F), "Sueño de fuga (reparado)");
  assert.equal(leer(card(MX_F)), "Sueño de fuga (reparado)");

  // 2. Apagar el fallback: NO puede leer lo generado con fallback.
  assert.equal(leer(card(MX)), null, "es-MX sin fallback no lee lo reparado");
  guardar(card(MX), "Sueño de fuga (crudo)");

  // 3. Rollback a es-ES: no lee ninguno de los dos mexicanos.
  assert.equal(leer(card(ES)), null, "el rollback NO devuelve contenido mexicano");
  guardar(card(ES), "Cadena perpetua");

  // 4. Volver a es-MX + fallback: lee lo suyo, sin mezclar.
  assert.equal(leer(card(MX_F)), "Sueño de fuga (reparado)");
  assert.equal(leer(card(ES)), "Cadena perpetua");

  // 5. Los tres conjuntos son disjuntos.
  assert.equal(almacen.size, 3);
  assert.equal(new Set([card(MX_F), card(MX), card(ES)]).size, 3);
});

// ============================================================================
// 4. BARRIDO: ninguna clave localizada construida a mano
// ============================================================================
// La primera línea de defensa es el TIPO: `cachedLoc`/`cachedLocIf` exigen
// `ClaveLocalizada`, que solo devuelven los constructores de este módulo.
//
// QUÉ PROTEGE Y QUÉ NO: el tipo evita las construcciones manuales ACCIDENTALES
// —que son las que pasan de verdad— pero no puede impedir un `as
// ClaveLocalizada` deliberado. Para eso está el barrido, que además mira
// `cachedLoc`/`cachedLocIf` y rechaza los literales con `as`.
//
// NO busca prefijos en texto suelto —encontraría comentarios, logs, tests y
// `TTL.home`—: mira SOLO el primer argumento de `cached(`/`cachedIf(`, y además
// resuelve variables, que era el agujero de la primera versión.

const FAMILIAS_LOCALIZADAS = [
  "home:", "disc:", "card:", "top:pop:", "reco:", "people:popular:", "search:",
];
// Empiezan igual que una familia localizada pero no lo son.
const EXCEPCIONES_NO_LOCALIZADAS = ["people:directors"];

function esClaveLocalizada(desnudo: string): boolean {
  if (EXCEPCIONES_NO_LOCALIZADAS.some((e) => desnudo.startsWith(e))) return false;
  return FAMILIAS_LOCALIZADAS.some((f) => desnudo.startsWith(f));
}

/** Claves localizadas construidas a mano dentro de una llamada de cache. */
function claveManualEn(src: string): string[] {
  const hallados: string[] = [];

  // Variables asignadas a un literal o template en este mismo archivo.
  const vars = new Map<string, string>();
  for (const m of src.matchAll(/\b(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*([`"'][^`"'\n]*)/g)) {
    vars.set(m[1], m[2].replace(/^[`"']/, ""));
  }

  // Incluye `cachedLoc`/`cachedLocIf`: el tipo marcado no puede impedir un `as`
  // deliberado, así que el barrido tiene que mirar esas llamadas también.
  for (const m of src.matchAll(/\bcached(?:Loc)?(?:If)?\s*\(\s*([^,]+),/g)) {
    const arg = m[1].trim();
    // Un `as ClaveLocalizada` sobre un literal es exactamente la evasión que el
    // tipo no puede frenar.
    const conAs = /^[`"']([^`"']*)[`"']\s+as\s+ClaveLocalizada/.exec(arg);
    if (conAs) {
      if (esClaveLocalizada(conAs[1])) {
        hallados.push(`as ClaveLocalizada: ${conAs[1].slice(0, 40)}`);
      }
      continue;
    }
    if (/^["'`]/.test(arg)) {
      const desnudo = arg.replace(/^[`"']/, "");
      if (esClaveLocalizada(desnudo)) hallados.push(arg.slice(0, 60));
      continue;
    }
    // Identificador suelto: ¿es una variable con una clave localizada adentro?
    if (/^\w+$/.test(arg)) {
      const v = vars.get(arg);
      if (v && esClaveLocalizada(v)) hallados.push(`${arg} = ${v.slice(0, 46)}`);
    }
  }
  return hallados;
}

function fuentes(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fuentes(p, out);
    else if (/\.tsx?$/.test(e) && !e.endsWith(".test.ts") && e !== "claves.ts") out.push(p);
  }
  return out;
}

test("ninguna llamada a cached()/cachedIf() construye una clave localizada a mano", () => {
  const infractores: string[] = [];
  for (const archivo of [...fuentes("lib"), ...fuentes("app"), ...fuentes("components")]) {
    for (const h of claveManualEn(readFileSync(archivo, "utf8"))) {
      infractores.push(`${archivo}: ${h}`);
    }
  }
  assert.deepEqual(infractores, [],
    `claves localizadas a mano — tienen que salir de lib/claves.ts:\n${infractores.join("\n")}`);
});

// --- El barrido, visto en rojo ----------------------------------------------
// Un test de barrido que nunca falló no está probado.

test("EN ROJO: detecta la clave escondida en una VARIABLE", () => {
  // El agujero de la primera versión: solo miraba literales pasados en línea. Y
  // es la forma en que uno lo escribiría sin querer, no una rebuscada.
  const escondida = [
    "const key = `card:${type}:${id}`;",
    "return cached(key, TTL.catalog, fn);",
  ].join("\n");
  assert.deepEqual(claveManualEn(escondida), ["key = card:${type}:${id}"]);
});

test("EN ROJO: detecta la clave literal en línea", () => {
  assert.equal(claveManualEn("return cached(`card:${type}:${id}`, TTL.catalog, fn);").length, 1);
});

test("EN ROJO: detecta una variable con `let` y anotación de tipo", () => {
  const src = [
    "let clv: string = `reco:v2:${h}`;",
    "return cached(clv, TTL.reco, fn);",
  ].join("\n");
  assert.equal(claveManualEn(src).length, 1);
});

test("EN ROJO: detecta un `as ClaveLocalizada` sobre un literal", () => {
  // El tipo no lo frena: es una aserción deliberada. El barrido sí.
  const evasion = 'cachedLoc(`card:${type}:${id}` as ClaveLocalizada, TTL.catalog, fn);';
  assert.equal(claveManualEn(evasion).length, 1);
});

test("EN ROJO: el barrido mira también cachedLoc y cachedLocIf", () => {
  assert.equal(claveManualEn("cachedLoc(`top:pop:${p}:${t}`, TTL.catalog, fn);").length, 1);
  assert.equal(claveManualEn("cachedLocIf(`home:v5:${s}`, TTL.home, fn, ok);").length, 1);
});

test("EN VERDE: no marca constructores ni claves sin huella", () => {
  assert.deepEqual(claveManualEn("cached(claveCard(type, id, H), TTL.catalog, fn);"), []);
  assert.deepEqual(claveManualEn("cachedLoc(claveCard(type, id, H), TTL.catalog, fn);"), []);
  assert.deepEqual(claveManualEn("cached(`pv:${type}:${id}`, TTL.providers, fn);"), []);
  const noLocal = ["const k = `videos:${type}:${id}`;", "cached(k, TTL.providers, fn);"].join("\n");
  assert.deepEqual(claveManualEn(noLocal), []);
});

test("EN VERDE: people:directors no es localizada", () => {
  assert.equal(esClaveLocalizada("people:directors"), false);
  assert.equal(esClaveLocalizada("people:popular:3"), true);
});

// ============================================================================
// 5. BARRIDO DE LA TANDA 2: ningún constructor quedó en modo compatible
// ============================================================================
// El barrido de la sección 4 obliga a que las claves salgan de un constructor.
// Este obliga a lo otro: que ese constructor reciba la huella REAL. Sin él, un
// call site nuevo podría pasar `""` y quedarse leyendo el espacio viejo —el Home
// en es-MX y una card en es-ES, sin ningún error a la vista.
//
// Es también lo que reemplaza al `assert.equal(HUELLA_EN_CLAVES, "")` de la
// tanda 1: aquella constante era el interruptor único, y al sacarla hacía falta
// algo que verificara los once call sites de verdad.

// Los constructores se DESCUBREN leyendo lib/claves.ts, no se listan a mano.
// Con la lista escrita a mano, agregar una familia nueva no rompia nada: el
// barrido no la miraba y su call site podia quedarse sin huella para siempre.
// Ahora una familia nueva entra sola al barrido el dia que se exporta.
function constructoresExportados(): string[] {
  const src = readFileSync(join("lib", "claves.ts"), "utf8");
  return [...src.matchAll(/export function (clave\w+)\s*\(/g)].map((m) => m[1]);
}
const CONSTRUCTORES = constructoresExportados();

test("el barrido descubre los constructores solo, y hay once", () => {
  // Si esto falla porque agregaste una familia: NO subas el numero sin mas. Una
  // familia localizada nueva significa un espacio de claves nuevo y, con el,
  // otro arranque frio. El numero esta aca para que esa decision se tome a
  // proposito y no de costado.
  assert.equal(CONSTRUCTORES.length, 11, `constructores en lib/claves.ts: ${CONSTRUCTORES.join(", ")}`);
  // Y que sean los que el resto del archivo prueba, no otros once.
  assert.deepEqual([...CONSTRUCTORES].sort(), [
    "claveCard", "claveCombinadaCache", "claveHome", "clavePeoplePopular",
    "clavePoolCache", "claveReco", "claveRecoCruce", "claveRecoMismo",
    "claveRecoPerfil", "claveSearch", "claveTopPop",
  ]);
});

/** El último argumento de cada llamada a un constructor.
 *
 *  Un scanner de paréntesis balanceados y no una regex: las llamadas cruzan
 *  líneas (lib/pools.ts, lib/reco.ts) y traen templates con paréntesis y comas
 *  adentro — `${hashParams(receta.params)}`, `.join(",")` —, así que una regex
 *  cortaba el argumento en el lugar equivocado. Los strings y los comentarios
 *  se saltean enteros: una coma adentro de `","` no separa argumentos. */
function llamadasAConstructores(src: string): { nombre: string; ultimo: string }[] {
  const out: { nombre: string; ultimo: string }[] = [];
  for (const nombre of CONSTRUCTORES) {
    const re = new RegExp(`\\b${nombre}\\s*\\(`, "g");
    for (const m of src.matchAll(re)) {
      let i = m.index! + m[0].length;   // justo después del "("
      let profundidad = 1;
      const comas: number[] = [];
      const inicio = i;
      while (i < src.length && profundidad > 0) {
        const c = src[i];
        if (c === '"' || c === "'" || c === "`") {
          const cierre = c;
          i++;
          while (i < src.length && src[i] !== cierre) { if (src[i] === "\\") i++; i++; }
        } else if (c === "/" && src[i + 1] === "/") {
          while (i < src.length && src[i] !== "\n") i++;
        } else if (c === "/" && src[i + 1] === "*") {
          i += 2;
          while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
          i++;
        } else if (c === "(" || c === "[" || c === "{") profundidad++;
        else if (c === ")" || c === "]" || c === "}") profundidad--;
        else if (c === "," && profundidad === 1) comas.push(i);
        i++;
      }
      const fin = i - 1;   // el ")" que cerró
      const desde = comas.length ? comas[comas.length - 1] + 1 : inicio;
      out.push({ nombre, ultimo: src.slice(desde, fin).trim() });
    }
  }
  return out;
}

test("los once call sites pasan HUELLA_IDIOMA, ninguno la huella vacía", () => {
  const infractores: string[] = [];
  const usos: Record<string, number> = {};
  let total = 0;
  for (const archivo of [...fuentes("lib"), ...fuentes("app"), ...fuentes("components")]) {
    for (const l of llamadasAConstructores(readFileSync(archivo, "utf8"))) {
      total++;
      usos[l.nombre] = (usos[l.nombre] ?? 0) + 1;
      if (l.ultimo !== "HUELLA_IDIOMA") infractores.push(`${archivo}: ${l.nombre}(… , ${l.ultimo})`);
    }
  }
  assert.deepEqual(infractores, [],
    `constructores sin la huella real:\n${infractores.join("\n")}`);
  // Las once familias, cableadas de una sola vez: es lo que provoca UN arranque
  // frio y no once. El total se afirma para que agregar una familia obligue a
  // decidirlo, no para contar por contar.
  assert.equal(total, 11, `se esperaban 11 llamadas a constructores, hay ${total}`);
  // Un constructor exportado que nadie llama es una familia declarada y sin
  // usar: o falta cablearla, o sobra. Las dos cosas hay que verlas.
  const sinUsar = CONSTRUCTORES.filter((c) => !(usos[c] > 0));
  assert.deepEqual(sinUsar, [], `constructores exportados que nadie llama: ${sinUsar.join(", ")}`);
});

// --- El barrido, visto en rojo ----------------------------------------------

test("EN ROJO: detecta un constructor que quedó con la huella vacía", () => {
  const l = llamadasAConstructores(`return cachedLoc(claveCard(type, id, ""), TTL.catalog, fn);`);
  assert.deepEqual(l, [{ nombre: "claveCard", ultimo: `""` }]);
});

test("EN ROJO: detecta una huella que no es HUELLA_IDIOMA", () => {
  const l = llamadasAConstructores(`claveTopPop(p, t, HUELLA_EN_CLAVES)`);
  assert.equal(l[0].ultimo, "HUELLA_EN_CLAVES");
});

test("EN VERDE: no se confunde con comas dentro de strings ni con saltos de línea", () => {
  const src = [
    "const k = claveSearch(",
    '  q.toLowerCase(), [...providers].sort().join(","), HUELLA_IDIOMA);',
  ].join("\n");
  assert.deepEqual(llamadasAConstructores(src), [{ nombre: "claveSearch", ultimo: "HUELLA_IDIOMA" }]);
});

test("EN VERDE: claveReco no matchea claveRecoMismo ni claveRecoPerfil", () => {
  const src = "claveReco(h, HUELLA_IDIOMA); claveRecoMismo(t, i, HUELLA_IDIOMA);";
  assert.deepEqual(llamadasAConstructores(src).map((l) => l.nombre).sort(),
    ["claveReco", "claveRecoMismo"]);
});
