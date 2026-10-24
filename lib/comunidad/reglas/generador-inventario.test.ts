// INVENTARIO del generador contra el contrato (catálogo §8) y las referencias
// Unicode 18.0.0 (auditoría de bbb8fc7, A4). Que todo lo generado pase no
// alcanza: acá se comprueba que estén TODAS las dimensiones prometidas, con
// el conteo de la referencia, y que las muestras tengan su tamaño y salgan de
// la clase correcta.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "./listas.ts";
import { generar, MUESTRA_C, MUESTRA_S, PALABRAS_0_15, PALABRAS_16_99, separadoresDe } from "./generador.ts";
import { CONFUSABLES_DIGITO, CONFUSABLES_LETRA_UTS39, RANGOS_ND } from "./tablas-unicode.ts";

const casos = generar();
const dims = new Set(casos.map((c) => c.dimension));
const conPrefijo = (p: string) => casos.filter((c) => c.dimension.startsWith(p));
const hex = (c: string) => c.codePointAt(0)!.toString(16);
const faltan = (esperadas: string[]) => esperadas.filter((d) => !dims.has(d));

test("D2: un caso por cada tramo de 10 dígitos Nd de Unicode 18.0.0 (77)", () => {
  const tramos = RANGOS_ND.flatMap(([a, b]) => Array.from({ length: Math.floor((b - a + 1) / 10) }, (_, i) => `D2:${(a + 10 * i).toString(16)}`));
  assert.equal(tramos.length, 77);
  assert.deepEqual(faltan(tramos), []);
});

test("D4, D5, D6: superíndices, SUBÍNDICES, circulados y emoji de tecla", () => {
  assert.deepEqual(faltan(["D4:superindice", "D4:subindice", "D5:circulado", "D6:tecla"]), []);
});

test("D7 y D8: cada palabra-número de §6.N (castellano 0–15 y 16–99, inglés)", () => {
  assert.equal(PALABRAS_16_99.length, 4 + 4 + 1 + 11 + 9 + 7 * 10);
  assert.deepEqual(faltan(PALABRAS_0_15.map((w) => `D7:corrida:${w}`)), []);
  assert.deepEqual(faltan(PALABRAS_16_99.map((w) => `D7:compuesto:${w}`)), []);
  assert.deepEqual(faltan(Object.keys(L.PALABRAS_NUMERO_EN).map((w) => `D8:corrida:${w}`)), []);
});

test("D9: cada confusable de dígito de la tabla, contando PUNTOS DE CÓDIGO (incluye los astrales)", () => {
  const esperadas = Object.entries(CONFUSABLES_DIGITO).filter(([c]) => [...c].length === 1 && !/\s/u.test(c)).map(([c, d]) => `D9:${hex(c)}:${d}`);
  const astrales = Object.keys(CONFUSABLES_DIGITO).filter((c) => c.codePointAt(0)! > 0xffff);
  assert.ok(astrales.length > 100, `astrales: ${astrales.length}`);
  assert.equal(esperadas.length, Object.keys(CONFUSABLES_DIGITO).length);
  assert.deepEqual(faltan(esperadas), []);
});

test("S: categorías de Unicode 18.0.0 enumeradas completas y muestras de 64 de la clase correcta", () => {
  const enumerados = [...separadoresDe("Zs"), ...separadoresDe("Pd"), ...separadoresDe("Ps"), ...separadoresDe("Pe"), ...separadoresDe("Me"), "️", "/", "_"];
  // U+2E62 (Ps) y U+2E63 (Pe) son de Unicode 18.0.0: tienen que estar.
  assert.ok(separadoresDe("Ps").includes("⹢") && separadoresDe("Pe").includes("⹣"));
  assert.deepEqual(faltan(enumerados.map((s) => `S:${hex(s)}`)), []);
  for (const cat of ["Po", "Sm", "Mn"] as const) {
    const clase = new Set(separadoresDe(cat).map(hex));
    const muestreados = conPrefijo("S:").filter((c) => c.muestreado && clase.has(c.dimension.slice(2)));
    assert.equal(muestreados.length, MUESTRA_S, cat);
  }
  assert.equal(separadoresDe("Po").some((c) => /[,;:]/.test(c)), false, "Po sin , ; : (S2)");
});

test("C: 200 confusables de letra de TODA la clase de UTS #39 (no sólo 'o')", () => {
  const c = conPrefijo("C:");
  assert.equal(c.length, MUESTRA_C);
  const destinos = new Set(c.map((x) => CONFUSABLES_LETRA_UTS39[String.fromCodePoint(parseInt(x.dimension.split(":")[1], 16))]));
  assert.ok(destinos.size > 10, `destinos distintos: ${[...destinos].join(",")}`);
  assert.ok(c.every((x) => x.muestreado));
});

test("F2, F3, F4: proveedores, terminaciones fuertes, rutas, acortadores, plataformas e intención completos", () => {
  assert.deepEqual(faltan(L.PROVEEDORES_CORREO.flatMap((p) => ["en", "de", "del"].map((pr) => `F2:${pr}:${p}`))), []);
  assert.deepEqual(faltan(L.TLD_FUERTES.flatMap((t) => [`F3-2:${t}`, `F3-5:${t}`, `F3-6:${t}`])), []);
  assert.deepEqual(faltan(L.HOSTS_SIN_TLD.map((h) => `F3:acortador:${h}`)), []);
  assert.equal(conPrefijo("F3-3:").length, 12);
  assert.ok(conPrefijo("F3-4:").filter((c) => c.muestreado).length === 50);
  assert.deepEqual(faltan(L.PLATAFORMAS_CONTRATO.map((p) => `F4:plat:${p}`)), []);
  assert.deepEqual(faltan(L.INTENCION.filter((x) => !L.PEDIDO_PRIVADO.includes(x)).map((i) => `F4:I:${i}`)), []);
});

test("S1–S5 y H1–H3: cada entrada de sus listas de §6", () => {
  assert.deepEqual(faltan(L.PALABRAS_MEDIO.map((m) => `S1:${m}`)), []);
  assert.deepEqual(faltan(L.PEDIDO_PRIVADO.map((f) => `S2:${f}`)), []);
  assert.deepEqual(faltan([...L.REMISION, ...L.REMISION_TILDE].flatMap((v) => L.IDENTIDAD_PERFIL.map((i) => `S3-b:${v}:${i}`))), []);
  assert.deepEqual(faltan(L.VENTA.map((v) => `S5:${v}`)), []);
  assert.deepEqual(faltan(L.H1_DIRECTAS.map((d) => `H1-a:${d}`)), []);
  assert.deepEqual(faltan(L.H1_DANO.flatMap((d) => [`H1-b:te:${d}`, `H1-b:le:${d}`])), []);
  assert.deepEqual(faltan(L.H1_DESEO.map((d) => `H1-d:${d}`)), []);
  assert.deepEqual(faltan(L.H2_GRUPOS.map((g) => `H2-a:${g}`)), []);
  assert.deepEqual(faltan(L.H2_DESHUMANIZACION.map((d) => `H2-b:${d}`)), []);
  assert.deepEqual(faltan(L.H2_INSULTOS.map((i) => `H2-c:${i}`)), []);
  assert.deepEqual(faltan(L.H3_VIAS.map((v) => `H3-b:${v}`)), []);
});

test("pares por familia: producto completo de representantes (F1, F2, F3, F4, H1)", () => {
  assert.equal(conPrefijo("par-F1:").length, 5 * 10 * 3);
  assert.equal(conPrefijo("par-F2:").length, 4 * 4 * 2);
  assert.equal(conPrefijo("par-F3:").length, 5 * 2 * 3);
  assert.equal(conPrefijo("par-F4:").length, 6 * 3 * 2);
  assert.equal(conPrefijo("par-H1:").length, 4 * 4 * 3);
});
