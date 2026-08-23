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
// 1. MODO COMPATIBLE: byte a byte lo que producía el código anterior
// ============================================================================
// Si alguna falla, el deploy de la tanda 1 provoca un arranque frío que el plan
// dice explícitamente que no tiene que haber.

test("modo compatible: las once familias producen los bytes de hoy", () => {
  const H = "";   // HUELLA_EN_CLAVES en la tanda 1
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
  for (const archivo of [...fuentes("lib"), ...fuentes("app")]) {
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
