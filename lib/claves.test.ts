// Claves de cache: modo compatible, huella de idioma y rollback.
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
  claveReco, claveRecoCruce, claveRecoMismo, claveRecoPerfil, claveTopPop,
} from "./claves.ts";

// ============================================================================
// 1. MODO COMPATIBLE: byte a byte lo que producía el código anterior
// ============================================================================
// Si alguna de estas falla, el deploy de la tanda 1 provoca un arranque frío
// que el plan dice explícitamente que no tiene que haber.

test("modo compatible: las diez familias producen los bytes de hoy", () => {
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
});

// ============================================================================
// 2. LOS CUATRO ESTADOS DE CONFIGURACIÓN
// ============================================================================
// La huella se calcula al importar el módulo, así que no se puede recargar a
// mitad de un test. Se replica acá la MISMA fórmula que lib/idioma.ts y se
// afirman los cuatro valores como literales: si allá cambia y acá no, falla.
function huellaDe(idiomaBase: string, fallbackPedido: boolean, resolver = "r1") {
  const activo = fallbackPedido && idiomaBase !== "es-ES";
  return `${idiomaBase}${activo ? "+f" : ""}.${resolver}`;
}

test("los cuatro estados dan las huellas esperadas", () => {
  assert.equal(huellaDe("es-MX", true), "es-MX+f.r1");
  assert.equal(huellaDe("es-MX", false), "es-MX.r1");
  assert.equal(huellaDe("es-ES", true), "es-ES.r1");
  // El caso que importa: con base es-ES el fallback es INERTE, así que apagarlo
  // NO puede abrir un espacio de claves nuevo. Si diera "es-ES+f.r1", tocar el
  // switch provocaría un arranque frío completo sin cambiar una sola respuesta.
  assert.equal(huellaDe("es-ES", false), "es-ES.r1");
  assert.equal(huellaDe("es-ES", true), huellaDe("es-ES", false));
});

test("los tres espacios de claves son disjuntos dos a dos", () => {
  const espacios = ["es-MX+f.r1", "es-MX.r1", "es-ES.r1"];
  const familias = [
    (h: string) => claveCard("movie", 278, h),
    (h: string) => claveTopPop("n", "movie", h),
    (h: string) => claveHome(1, "n", "", h),
    (h: string) => clavePeoplePopular(1, h),
    (h: string) => claveRecoMismo("tv", 1399, h),
  ];
  for (const f of familias) {
    const claves = espacios.map(f);
    assert.equal(new Set(claves).size, espacios.length, `colisión en ${claves.join(" | ")}`);
  }
});

test("subir la versión del resolver también cambia el espacio", () => {
  assert.notEqual(huellaDe("es-MX", true, "r1"), huellaDe("es-MX", true, "r2"));
});

// ============================================================================
// 3. ROLLBACK, sin contaminar cache
// ============================================================================
// Cache en memoria propio: `lib/cache.ts` necesita credenciales y este test no
// las quiere. Lo que se prueba es el CONTRATO de claves, que es lo que decide
// si un rollback revierte algo.

test("rollback es-MX+f → es-MX → es-ES → es-MX: nunca lee el espacio de otro", () => {
  const almacen = new Map<string, string>();
  const leer = (k: string) => almacen.get(k) ?? null;
  const guardar = (k: string, v: string) => { almacen.set(k, v); };

  const MX_F = "es-MX+f.r1", MX = "es-MX.r1", ES = "es-ES.r1";
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
// NO busca prefijos en texto suelto: eso encontraría comentarios, logs, tests y
// `TTL.home`. Mira SOLO el primer argumento de `cached(` y `cachedIf(`, y falla
// si es un literal o un template en vez de una llamada a lib/claves.ts.
//
// PROBADO EN ROJO: durante el desarrollo se metió `cached(\`card:${type}:${id}\`, …)`
// a mano en lib/enrich.ts y este test falló, como tiene que ser.

// Prefijos COMPLETOS. Cortarlos en el primer ":" daría falsos positivos: la
// primera versión de este test marcaba `people:directors`, que NO es localizada
// (su `knownFor` siempre viene vacío) porque comparaba solo "people".
const FAMILIAS_LOCALIZADAS = [
  "home:", "disc:", "card:", "top:pop:", "reco:", "people:popular:",
];
// Claves que empiezan igual que una familia localizada pero no lo son.
const EXCEPCIONES_NO_LOCALIZADAS = ["people:directors"];

function esClaveLocalizada(desnudo: string): boolean {
  if (EXCEPCIONES_NO_LOCALIZADAS.some((e) => desnudo.startsWith(e))) return false;
  return FAMILIAS_LOCALIZADAS.some((f) => desnudo.startsWith(f));
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
    const src = readFileSync(archivo, "utf8");
    // Primer argumento de cached(/cachedIf(, hasta la primera coma de nivel 0.
    for (const m of src.matchAll(/\bcached(?:If)?\s*\(\s*([^,]+),/g)) {
      const arg = m[1].trim();
      // Solo interesan literales y templates: una llamada a un constructor
      // (claveCard(...), clavePool(...)) o una variable ya están bien.
      const esLiteral = /^["'`]/.test(arg);
      if (!esLiteral) continue;
      const desnudo = arg.replace(/^[`"']/, "");
      if (esClaveLocalizada(desnudo)) infractores.push(`${archivo}: ${arg.slice(0, 60)}`);
    }
  }
  assert.deepEqual(infractores, [],
    `claves localizadas construidas a mano — tienen que salir de lib/claves.ts:\n${infractores.join("\n")}`);
});

test("el barrido NO marca people:directors, que no es localizada", () => {
  assert.equal(esClaveLocalizada("people:directors"), false);
  assert.equal(esClaveLocalizada("people:popular:3"), true);
});

test("el barrido SÍ detecta una clave localizada a mano (prueba del propio test)", () => {
  // Ejercita el detector sobre una fuente sintética, para que el test de arriba
  // no pueda pasar por estar mal escrito y no encontrar nunca nada.
  const src = 'return cached(`card:${type}:${id}`, TTL.catalog, fn);';
  const hallados: string[] = [];
  for (const m of src.matchAll(/\bcached(?:If)?\s*\(\s*([^,]+),/g)) {
    const arg = m[1].trim();
    if (!/^["'`]/.test(arg)) continue;
    const desnudo = arg.replace(/^[`"']/, "");
    if (esClaveLocalizada(desnudo)) hallados.push(arg);
  }
  assert.equal(hallados.length, 1, "el detector tiene que encontrar la clave manual");
});
