// Supresiones negativas de disponibilidad: lo que TMDB afirma y el dueño
// comprobó que NO está.
//
// EL CASO. TMDB listaba `movie:2118` (L.A. Confidential) en Disney+ AR y el
// dueño verificó dentro de Disney+ que no está. Medido el 2026-09-20: 20 de 100
// películas licenciadas de Disney+ AR en el mismo estado. Las excepciones
// positivas (`lib/excepciones-disponibilidad.ts`) no sirven: sólo AGREGAN cuando
// TMDB no sabe nada. Esto RESTA una plataforma concreta que TMDB sí afirma.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUPRESIONES, suprimirPlataformas, type SupresionManual,
} from "./supresiones-disponibilidad.ts";
import type { PlatformCode } from "./types";

const SUP = (o: Partial<SupresionManual> = {}): SupresionManual => ({
  clave: "movie:2118", region: "AR", plataforma: "d",
  verificado: "2026-09-20",
  evidencia: "verificación manual del dueño dentro de Disney+",
  activa: true, proximaRevision: "2026-10-20",
  ...o,
});

// ============================================================================
// 1. La función pura
// ============================================================================

test("Disney+ + Paramount+ → queda Paramount+", () => {
  const r = suprimirPlataformas("movie:2118", "AR", ["d", "pp"] as PlatformCode[], [SUP()]);
  assert.deepEqual(r, ["pp"]);
});

test("sólo Disney+ → queda vacío", () => {
  const r = suprimirPlataformas("movie:2118", "AR", ["d"] as PlatformCode[], [SUP()]);
  assert.deepEqual(r, []);
});

test("otra película no cambia, y devuelve el MISMO array", () => {
  const entrada: PlatformCode[] = ["d", "pp"];
  const r = suprimirPlataformas("movie:949", "AR", entrada, [SUP()]);
  assert.equal(r, entrada, "sin nada que quitar tiene que devolver la misma referencia");
  assert.deepEqual(entrada, ["d", "pp"]);
});

test("otra región no cambia", () => {
  const entrada: PlatformCode[] = ["d"];
  const r = suprimirPlataformas("movie:2118", "MX", entrada, [SUP()]);
  assert.equal(r, entrada);
});

test("otro tipo con el mismo id no cambia", () => {
  // La clave es `tipo:id`: `tv:2118` es otra obra.
  const entrada: PlatformCode[] = ["d"];
  assert.equal(suprimirPlataformas("tv:2118", "AR", entrada, [SUP()]), entrada);
});

test("NO muta el array de entrada cuando sí quita", () => {
  const entrada: PlatformCode[] = ["d", "pp"];
  const r = suprimirPlataformas("movie:2118", "AR", entrada, [SUP()]);
  assert.notEqual(r, entrada, "tiene que ser una copia");
  assert.deepEqual(entrada, ["d", "pp"], "mutó el array cacheado de providersOf");
});

test("una supresión inactiva no se aplica", () => {
  const entrada: PlatformCode[] = ["d"];
  assert.equal(suprimirPlataformas("movie:2118", "AR", entrada, [SUP({ activa: false })]), entrada);
});

test("no vence sola: una fecha de próxima revisión pasada sigue suprimiendo", () => {
  // 🔴 Decisión del dueño: la supresión se levanta con una verificación
  // positiva directa, nunca por calendario. `proximaRevision` es un
  // recordatorio, no un vencimiento. Por eso la función NI RECIBE la fecha.
  const r = suprimirPlataformas("movie:2118", "AR", ["d"] as PlatformCode[],
    [SUP({ proximaRevision: "2020-01-01" })]);
  assert.deepEqual(r, []);
});

test("quita SÓLO la plataforma suprimida: dos supresiones distintas del mismo título", () => {
  const r = suprimirPlataformas("movie:1", "AR", ["d", "pp", "n"] as PlatformCode[],
    [SUP({ clave: "movie:1" }), SUP({ clave: "movie:1", plataforma: "n" })]);
  assert.deepEqual(r, ["pp"]);
});

test("con una lista vacía es identidad", () => {
  const entrada: PlatformCode[] = [];
  assert.equal(suprimirPlataformas("movie:2118", "AR", entrada, [SUP()]), entrada);
});

// ============================================================================
// 2. El registro real
// ============================================================================

const IDS_2026_09_20 = [
  949, 281957, 311, 2251, 787, 194662, 10591, 49530, 1645, 10315,
  2118, 8247, 86834, 43347, 9631, 634, 241, 340837, 10731, 8092,
];

test("las 20 entradas de Disney+ AR del 2026-09-20 están, una por película", () => {
  const claves = SUPRESIONES
    .filter((s) => s.plataforma === "d" && s.region === "AR" && s.verificado === "2026-09-20")
    .map((s) => s.clave);
  assert.deepEqual([...claves].sort(), IDS_2026_09_20.map((id) => `movie:${id}`).sort());
});

test("cada entrada es válida y completa", () => {
  const FECHA = /^\d{4}-\d{2}-\d{2}$/;
  for (const s of SUPRESIONES) {
    assert.match(s.clave, /^(movie|tv):\d+$/, `${s.clave}: clave inválida`);
    assert.equal(s.region, "AR", `${s.clave}: región desconocida`);
    assert.match(s.verificado, FECHA, `${s.clave}: fecha de verificación inválida`);
    assert.match(s.proximaRevision, FECHA, `${s.clave}: fecha de revisión inválida`);
    assert.ok(s.proximaRevision > s.verificado, `${s.clave}: la revisión tiene que ser posterior`);
    assert.ok(s.evidencia.length > 20, `${s.clave}: la evidencia no dice dónde se verificó`);
    assert.equal(typeof s.activa, "boolean");
  }
});

test("las 20 del 2026-09-20 dicen que las verificó el dueño dentro de Disney+, y están activas", () => {
  for (const s of SUPRESIONES.filter((x) => x.verificado === "2026-09-20")) {
    assert.equal(s.evidencia, "verificación manual del dueño dentro de Disney+");
    assert.equal(s.activa, true, `${s.clave} está inactiva`);
  }
});

test("no hay entradas duplicadas (misma clave, región y plataforma)", () => {
  const vistas = new Set<string>();
  for (const s of SUPRESIONES) {
    const k = `${s.clave}|${s.region}|${s.plataforma}`;
    assert.ok(!vistas.has(k), `duplicada: ${k}`);
    vistas.add(k);
  }
});

test("el registro se aplica por defecto: movie:2118 pierde Disney+ y conserva Paramount+", () => {
  assert.deepEqual(suprimirPlataformas("movie:2118", "AR", ["d", "pp"] as PlatformCode[]), ["pp"]);
});
