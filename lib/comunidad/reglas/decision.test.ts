// La combinación de reglas: prioridad, motivos, versión y, sobre todo, que
// NINGÚN fallo termine en "publicar" (revisión §3.3, "Fallos").
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarCon, evaluarNombre, evaluarResena, MOTIVO_ERROR, MOTIVO_RETENCION_RESENA } from "./decision.ts";
import { plegar } from "./plegado.ts";
import { REGLAS_NOMBRE, REGLAS_RESENA } from "./reglas.ts";
import type { ContextoResena, Disparo, Regla } from "./tipos.ts";
import { VERSION_REGLAS } from "./version.ts";

const LEGITIMA = "Una historia de amistad entre dos jubilados que viajan por la Patagonia. Paisajes hermosos y humor tierno.";
const ctx: ContextoResena = { textosRecientes: [] };

const fija = (id: string, d: Disparo | null): Regla<ContextoResena> => ({ id, version: 1, evaluar: () => d });

test("sin disparos publica, con la versión de reglas", () => {
  const d = evaluarResena(LEGITIMA, ctx);
  assert.deepEqual(d, { resultado: "publicar", versionReglas: VERSION_REGLAS, disparadas: [], motivoUsuario: "" });
});

test("gana el más restrictivo: contenido > formato > retener > publicar", () => {
  const r = (reglas: Regla<ContextoResena>[]) => evaluarCon(LEGITIMA, ctx, reglas, "ret").resultado;
  const ret = fija("a", { resultado: "retener", motivo: "m" });
  const fmt = fija("b", { resultado: "rechazo_formato", motivo: "m" });
  const con = fija("c", { resultado: "rechazo_contenido", motivo: "m" });
  assert.equal(r([ret, fija("z", null)]), "retener");
  assert.equal(r([ret, fmt]), "rechazo_formato");
  assert.equal(r([fmt, con, ret]), "rechazo_contenido");
});

test("una retención no revela la regla; un rechazo dice qué corregir", () => {
  const d = evaluarResena("Lo hicieron esos negros de mierda de la productora. " + LEGITIMA, ctx);
  assert.equal(d.resultado, "retener");
  assert.equal(d.motivoUsuario, MOTIVO_RETENCION_RESENA);
  assert.doesNotMatch(d.motivoUsuario, /odio/i);
  assert.deepEqual(d.disparadas, [{ regla: "odio.lista", version: 2, resultado: "retener" }]);
  const r = evaluarResena("Llamame al 1144556677. " + LEGITIMA, ctx);
  assert.match(r.motivoUsuario, /número de teléfono/);
});

test("excepción inyectada en CADA regla de reseña → error, nunca publicar", () => {
  for (let i = 0; i < REGLAS_RESENA.length; i++) {
    const reglas = REGLAS_RESENA.map((r, k) => (k === i ? { ...r, evaluar: () => { throw new Error("falla " + r.id); } } : r));
    const d = evaluarCon(LEGITIMA, ctx, reglas, "ret");
    assert.equal(d.resultado, "error", `regla ${REGLAS_RESENA[i].id}`);
    assert.equal(d.motivoUsuario, MOTIVO_ERROR);
  }
});

test("excepción inyectada en CADA regla de nombre → error", () => {
  for (let i = 0; i < REGLAS_NOMBRE.length; i++) {
    const reglas = REGLAS_NOMBRE.map((r, k) => (k === i ? { ...r, evaluar: () => { throw new Error("x"); } } : r));
    assert.equal(evaluarCon<unknown>("Ana", undefined, reglas, "ret").resultado, "error", REGLAS_NOMBRE[i].id);
  }
});

test("un disparo inválido es error, también uno que diga 'publicar'", () => {
  const malos = [
    { resultado: "publicar", motivo: "x" },
    { resultado: "aprobar", motivo: "x" },
    { resultado: "retener", motivo: "" },
    { resultado: "retener" },
    "retener",
    42,
  ];
  for (const m of malos) {
    const d = evaluarCon(LEGITIMA, ctx, [fija("mala", m as unknown as Disparo)], "ret");
    assert.equal(d.resultado, "error", JSON.stringify(m));
  }
});

test("fallo del plegado o lista vacía de reglas → error", () => {
  const deps = { plegar: () => { throw new Error("plegado roto"); } };
  assert.equal(evaluarResena(LEGITIMA, ctx, deps).resultado, "error");
  assert.equal(evaluarNombre("Ana", deps).resultado, "error");
  assert.equal(evaluarCon(LEGITIMA, ctx, [], "ret").resultado, "error");
  // El plegado real sí funciona con el mismo texto.
  assert.equal(evaluarResena(LEGITIMA, ctx, { plegar }).resultado, "publicar");
});

test("contexto inválido → error: falta, no es lista, más de 3 o no son textos", () => {
  const invalidos: unknown[] = [
    undefined, null, {}, { textosRecientes: "x" },
    { textosRecientes: ["a", "b", "c", "d"] }, { textosRecientes: [1] },
  ];
  for (const c of invalidos) {
    assert.equal(evaluarResena(LEGITIMA, c as ContextoResena).resultado, "error", JSON.stringify(c));
  }
});

test("un texto que no es string → error", () => {
  assert.equal(evaluarResena(undefined as unknown as string, ctx).resultado, "error");
  assert.equal(evaluarNombre(null as unknown as string).resultado, "error");
});

test("ids de regla únicos, con versión entera", () => {
  for (const conjunto of [REGLAS_RESENA, REGLAS_NOMBRE]) {
    const ids = conjunto.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(conjunto.every((r) => Number.isInteger(r.version) && r.version >= 1));
  }
});
