// Etapa 2 de capacidad (#17): UNA versión canónica del Home para sus cinco
// familias de claves — fresca, último bueno (UB), generación del UB, degradado
// compartido y turno — y turnos separados por versión en un despliegue gradual.
//
// Lo que protege: el UB y el degradado son el MISMO contrato de payload que la
// fresca. Con versiones independientes (`homeub…v1` en la v2 del diseño), subir
// el contenido a v7 dejaba un UB v6 sirviéndose a un cliente que espera v7 —
// exactamente el bug que la versión existe para impedir. Ahora `VERSION_HOME`
// es una sola constante y las cinco claves la toman de ahí (informe de la
// Etapa 2, §4.1). Escrito ANTES de los constructores: fallaba al importar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  claveHome, claveHomeDegradado, claveHomeGeneracion, claveHomeUltimoBueno, claveTurnoHome,
  familiasHome, VERSION_HOME,
} from "./claves.ts";
import { calcularHuella } from "./idioma.ts";

const H = calcularHuella("es-MX", true);

test("VERSION_HOME es 7 y claveHome produce los bytes esperados", () => {
  // (a) del plan RED de la Etapa 2: la fresca no cambiaba ni un byte y un
  // payload `v6` cacheado seguía siendo HIT. Con las supresiones (#24) la
  // versión SUBIÓ a v7 a propósito: un `v6` trae cards con Disney+ en las 20
  // películas suprimidas, y tiene que dejar de servirse al deployar.
  assert.equal(VERSION_HOME, 7);
  assert.equal(claveHome(3523671066, "d,m,n", "", H), "home:es-MX+f.r1:v7:3523671066:d,m,n:");
  assert.equal(claveHome(3523671066, "d,m,n", "", ""), "home:v7:3523671066:d,m,n:");
  // Y el literal de la versión no vive escrito adentro de `claveHome`: sale de la constante.
  const src = readFileSync("lib/claves.ts", "utf8");
  assert.doesNotMatch(src, /`home:\$\{pre\(huella\)\}v\d+:/, "claveHome tiene que derivar la versión de VERSION_HOME");
});

test("las cinco familias del Home comparten el segmento v<VERSION_HOME>", () => {
  // (b): se parsea de cada clave, no se asume.
  const claves = {
    fresca: claveHome(123, "d,m,n", "accion:tv", H),
    ub: claveHomeUltimoBueno("d,m,n", "accion:tv", H),
    gen: claveHomeGeneracion("d,m,n", "accion:tv", H),
    degradado: claveHomeDegradado(123, "d,m,n", "accion:tv", H),
    turno: claveTurnoHome(123, "d,m,n", "accion:tv", H),
  };
  for (const [nombre, clave] of Object.entries(claves)) {
    const m = clave.match(/:v(\d+):/);
    assert.ok(m, `${nombre}: ${clave} no tiene segmento de versión`);
    assert.equal(Number(m![1]), VERSION_HOME, `${nombre}: ${clave}`);
  }
  // Las formas exactas, para poder mirarlas en el panel.
  assert.equal(claves.fresca, "home:es-MX+f.r1:v7:123:d,m,n:accion:tv");
  assert.equal(claves.ub, "home:ub:es-MX+f.r1:v7:d,m,n:accion:tv");
  assert.equal(claves.gen, "home:gen:es-MX+f.r1:v7:d,m,n:accion:tv");
  assert.equal(claves.degradado, "home:degradado:es-MX+f.r1:v7:123:d,m,n:accion:tv");
  assert.equal(claves.turno, "home:turno:es-MX+f.r1:v7:123:d,m,n:accion:tv");
});

test("el UB y su generación NO llevan semilla; el turno y el degradado SÍ", () => {
  // El UB sobrevive a la medianoche (por eso existe); el turno y el degradado
  // coordinan o sustituyen la composición de UNA fresca, que es de un día.
  const a = familiasHome({ semilla: 1, providers: "n", tipos: "", huella: H });
  const b = familiasHome({ semilla: 2, providers: "n", tipos: "", huella: H });
  assert.equal(a.ub, b.ub);
  assert.equal(a.gen, b.gen);
  assert.notEqual(a.fresca, b.fresca);
  assert.notEqual(a.turno, b.turno);
  assert.notEqual(a.degradado, b.degradado);
});

test("subir VERSION_HOME cambia las cinco claves a la vez y ninguna conserva la anterior", () => {
  // (c): la invalidación es conjunta. `familiasHome` acepta la versión como
  // parámetro justamente para poder probar el salto sin recargar el módulo.
  const actual = familiasHome({ semilla: 9, providers: "d,n", tipos: "", huella: H });
  const siguiente = familiasHome({ semilla: 9, providers: "d,n", tipos: "", huella: H, version: VERSION_HOME + 1 });
  for (const familia of ["fresca", "ub", "gen", "degradado", "turno"] as const) {
    assert.match(actual[familia], new RegExp(`:v${VERSION_HOME}:`), familia);
    assert.match(siguiente[familia], new RegExp(`:v${VERSION_HOME + 1}:`), familia);
    assert.doesNotMatch(siguiente[familia], new RegExp(`:v${VERSION_HOME}:`), `${familia} conserva la versión anterior tras subirla`);
    assert.notEqual(actual[familia], siguiente[familia], familia);
  }
  // Y el default de `familiasHome` es la constante: lo que corre en producción.
  assert.deepEqual(familiasHome({ semilla: 9, providers: "d,n", tipos: "", huella: H, version: VERSION_HOME }), actual);
});

test("los turnos de dos versiones son claves distintas: cada versión coordina consigo misma", () => {
  // (d): despliegue gradual con v6 y v7 conviviendo. Ninguna lee ni publica
  // claves de la otra.
  const v6 = familiasHome({ semilla: 9, providers: "d,n", tipos: "", huella: H, version: 6 });
  const v7 = familiasHome({ semilla: 9, providers: "d,n", tipos: "", huella: H, version: 7 });
  assert.notEqual(v6.turno, v7.turno);
  assert.equal(new Set([...Object.values(v6), ...Object.values(v7)]).size, 10, "las diez claves son distintas");
});

test("las cinco claves de una misma combinación no colisionan entre familias", () => {
  const f = familiasHome({ semilla: 5, providers: "m", tipos: "", huella: H });
  assert.equal(new Set(Object.values(f)).size, 5);
  // Ninguna familia nueva es prefijo de la fresca ni al revés: un SCAN por
  // `home:es-MX+f.r1:v6:` (la fresca de hoy) no tiene que traer turnos ni UB.
  for (const k of [f.ub, f.gen, f.degradado, f.turno]) assert.ok(!k.startsWith("home:es-MX"), k);
});
