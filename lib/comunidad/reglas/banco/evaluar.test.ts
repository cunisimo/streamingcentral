// El evaluador de bancos (E1.1, auditoría de ffa5061, A4): un banco inválido o
// sin los grupos exigidos es NO EVALUABLE, nunca "cumple" por 0/0; y un error
// técnico no cuenta como detección.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarBanco, validarBanco, type CasoBanco } from "./evaluar.ts";

const LEGITIMA = "Una historia de amistad entre dos jubilados que viajan por la Patagonia. Paisajes hermosos y humor tierno.";
const ABUSO = "Muy buena película, la vi el sábado con amigos. Llamame al 1144556677 y la comentamos un rato largo.";

const base = (): CasoBanco[] => [
  { id: "L1", tipo: "resena", grupo: "legitima", categoria: "general", esperado: "publicar", texto: LEGITIMA },
  { id: "A1", tipo: "resena", grupo: "abuso", categoria: "contacto.telefono", variante: "ofuscada", claro: true, esperado: "rechazar", texto: ABUSO },
  { id: "N1", tipo: "nombre", grupo: "legitima", categoria: "nombre", esperado: "publicar", texto: "Ana" },
];

const estados = (casos: unknown) => evaluarBanco(casos as CasoBanco[]).criterios.map((c) => `${c.id}:${c.estado}`);

test("un banco completo y correcto es evaluable y cumple", () => {
  const inf = evaluarBanco(base());
  assert.equal(inf.evaluable, true);
  assert.ok(inf.criterios.every((c) => c.cumple), JSON.stringify(inf.criterios));
});

test("sin reseñas legítimas: NO evaluable, ningún criterio cumple (antes daba C3/C4 = 0/0 aprobados)", () => {
  const sinLegitimas = base().filter((c) => c.id !== "L1");
  const inf = evaluarBanco(sinLegitimas);
  assert.equal(inf.evaluable, false);
  assert.ok(inf.problemas.some((p) => p.includes("reseñas legítimas")));
  assert.ok(inf.criterios.every((c) => c.estado === "no_evaluable" && !c.cumple));
});

test("sin abuso, sin ofuscadas, sin claros o sin nombres: no evaluable", () => {
  assert.equal(evaluarBanco(base().filter((c) => c.id !== "A1")).evaluable, false);
  assert.equal(evaluarBanco(base().filter((c) => c.id !== "N1")).evaluable, false);
  const sinClaro = base().map((c) => (c.id === "A1" ? { ...c, claro: false } : c));
  assert.ok(validarBanco(sinClaro).some((p) => p.includes("claros")));
  const directa = base().map((c) => (c.id === "A1" ? { ...c, variante: "directa" as const } : c));
  assert.ok(validarBanco(directa).some((p) => p.includes("ofuscadas")));
});

test("banco vacío, que no es lista, ids repetidos o esquema inválido: no evaluable", () => {
  assert.equal(evaluarBanco([]).evaluable, false);
  assert.deepEqual(validarBanco({ casos: [] }), ["el banco no es una lista de casos"]);
  assert.ok(validarBanco([...base(), { ...base()[0] }]).some((p) => p.includes("repetido")));
  const [l, a, n] = base();
  const malos: unknown[] = [
    { ...l, id: "X", tipo: "pelicula" },
    { ...l, id: "X", grupo: "dudosa" },
    { ...l, id: "X", esperado: "aprobar" },
    { ...l, id: "X", texto: 42 },
    { ...l, id: "" },
    { ...l, id: "X", esperado: "rechazar" },
    { ...a, id: "X", esperado: "publicar" },
    { ...a, id: "X", variante: "rara" },
    { ...l, id: "X", variante: "directa" },
    { ...n, id: "X", contexto: { textosRecientes: [] } },
    null,
  ];
  for (const m of malos) {
    assert.ok(validarBanco([...base(), m]).length > 0, JSON.stringify(m));
    assert.equal(evaluarBanco([...base(), m] as CasoBanco[]).evaluable, false, JSON.stringify(m));
  }
  assert.ok(estados([]).every((e) => e.endsWith("no_evaluable")));
});

test("los requisitos de tamaño se aplican", () => {
  const req = { legitimasResena: 2, abusoResena: 1, ofuscadas: 1, claros: 1, nombresLegitimos: 1 };
  assert.ok(validarBanco(base(), req).some((p) => p.includes("reseñas legítimas: hay 1")));
});

test("un error técnico no es una detección: falla C0 y además C1/C2", () => {
  // Un contexto con 4 textos es inválido para evaluarResena → error.
  const conError = base().map((c) =>
    c.id === "A1" ? { ...c, contexto: { textosRecientes: ["a", "b", "c", "d"] } } : c);
  const inf = evaluarBanco(conError);
  assert.equal(inf.evaluable, true);
  const r = inf.resultados.find((x) => x.caso.id === "A1")!;
  assert.equal(r.error, true);
  assert.equal(r.detectado, false);
  const est = Object.fromEntries(inf.criterios.map((c) => [c.id, c.estado]));
  assert.equal(est.C0, "no_cumple");
  assert.equal(est.C1, "no_cumple");
  assert.equal(est.C2, "no_cumple");
});
