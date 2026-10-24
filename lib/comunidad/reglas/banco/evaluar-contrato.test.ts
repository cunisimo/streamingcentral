// El evaluador del contrato con datos sintéticos AJENOS a cualquier reservado
// (el generador del contrato y plantillas de esta prueba). Controles:
//   - CS se mide por el disparo de la propia familia y con casos puros;
//   - bloquear un teléfono no aprueba una amenaza;
//   - lo complementario no completa mínimos ni diluye tasas (A1 de bbb8fc7);
//   - un texto fuera de largo, un contexto inválido o un rechazo de formato
//     no aprueban una prueba de contenido (A2 de bbb8fc7);
//   - un banco inválido, incompleto o sin denominador nunca aprueba.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generar } from "../generador.ts";
import { evaluarContrato, REQUISITOS_CONTRATO, type CasoContrato } from "./evaluar-contrato.ts";

const P = "La película tiene buenos actores y una historia que mantiene el interés hasta el final. ";
const g = generar();
let n = 0;
const id = () => `T-${String(++n).padStart(5, "0")}`;

/** Casos generados → casos de contrato (independientes). */
const desdeGenerador = (familia: string, max: number, tipo: "resena" | "nombre" = "resena"): CasoContrato[] =>
  g.filter((c) => c.familia === familia && c.tipo === tipo).slice(0, max).map((c) => ({
    id: id(), tipo: c.tipo, grupo: "abuso", categoria: c.dimension, variante: /^[FS]/.test(familia) ? "ofuscada" : "directa",
    esperado: c.esperado === "publicar" ? "retener" : c.esperado, texto: c.texto, contexto: c.contexto,
    familias: [c.familia!], alcance: "dentro", autoria: "independiente",
  }));
const legitimas = (k: number): CasoContrato[] => g.filter((c) => c.familia === null && c.tipo === "resena").slice(0, k).map((c) => ({
  id: id(), tipo: "resena", grupo: "legitima", categoria: c.dimension, esperado: "publicar", texto: c.texto,
  familias: [], alcance: "dentro", autoria: "independiente",
}));
const nombresLegitimos = (k: number): CasoContrato[] => Array.from({ length: k }, (_, i) => ({
  id: id(), tipo: "nombre", grupo: "legitima", categoria: "nombre", esperado: "publicar", texto: `Lectora de cine ${String.fromCharCode(65 + (i % 26))}${i}`,
  familias: [], alcance: "dentro", autoria: "independiente",
}));
const h2Nombres = (k: number): CasoContrato[] => Array.from({ length: k }, (_, i) => ({
  id: id(), tipo: "nombre", grupo: "abuso", categoria: "odio", variante: "directa", esperado: "retener", texto: `FueraBolitas${i}`,
  familias: ["H2"], alcance: "dentro", autoria: "independiente",
}));
const h3 = (k: number): CasoContrato[] => Array.from({ length: k }, (_, i) => ({
  id: id(), tipo: "resena", grupo: "abuso", categoria: "datos", variante: "directa", esperado: "retener",
  texto: `${P}El acomodador, DNI 27.345.${String(100 + i)}, me echó de la sala.`, familias: ["H3"], alcance: "dentro", autoria: "independiente",
}));

/** Un banco completo, con los mínimos por defecto, que tiene que aprobar. */
const completo = (): CasoContrato[] => [
  ...legitimas(160), ...nombresLegitimos(30),
  ...desdeGenerador("F1", 60), ...desdeGenerador("F2", 15), ...desdeGenerador("F3", 15), ...desdeGenerador("F4", 15),
  ...desdeGenerador("S1", 10), ...desdeGenerador("H1", 30), ...desdeGenerador("H2", 30), ...h2Nombres(10), ...h3(30),
];

test("control positivo: un banco completo y correcto aprueba", () => {
  const inf = evaluarContrato(completo());
  assert.equal(inf.evaluable, true, inf.problemas.join("; "));
  assert.deepEqual(inf.criterios.filter((c) => c.estado !== "cumple").map((c) => `${c.id} ${c.valor}`), []);
  assert.equal(inf.aprobado, true);
});

test("A1 (reproducción de Codex): contactos y legítimas COMPLEMENTARIOS no aprueban como independientes", () => {
  const banco = completo().map((c) =>
    c.grupo === "legitima" || c.familias.some((f) => /^[FS]/.test(f)) ? { ...c, autoria: "complementaria" as const } : c);
  const inf = evaluarContrato(banco);
  assert.equal(inf.aprobado, false);
  assert.equal(inf.evaluable, false);
  assert.match(inf.problemas.join(" "), /reseñas legítimas independientes: hay 0/);
});

test("A1: agregar casos complementarios fáciles no diluye las tasas independientes", () => {
  // 1 contacto independiente que NO se detecta (sin datos de contacto reales) hace fallar C1a...
  const falla: CasoContrato = {
    id: id(), tipo: "resena", grupo: "abuso", categoria: "f1", variante: "ofuscada", esperado: "rechazar",
    texto: `${P}Mi número lo saben mis amigos, preguntales a ellos.`, familias: ["F1"], alcance: "dentro", autoria: "independiente",
  };
  const base = [...completo(), falla];
  assert.equal(evaluarContrato(base).criterios.find((c) => c.id === "C1a")!.estado, "no_cumple");
  // ...y 500 complementarios fáciles que sí se detectan no lo salvan.
  const faciles = desdeGenerador("F1", 500).map((c) => ({ ...c, autoria: "complementaria" as const }));
  const inf = evaluarContrato([...base, ...faciles]);
  assert.equal(inf.criterios.find((c) => c.id === "C1a")!.estado, "no_cumple");
  assert.equal(inf.aprobado, false);
  assert.ok(inf.complementario.every((c) => c.estado !== "cumple"), "lo complementario nunca cumple");
});

test("A2 (reproducción de Codex): una reseña de un carácter no aprueba por rechazo de formato", () => {
  const banco = completo();
  const i = banco.findIndex((c) => c.familias[0] === "F1");
  banco[i] = { ...banco[i], texto: "x" };
  const inf = evaluarContrato(banco);
  assert.equal(inf.evaluable, false);
  assert.equal(inf.aprobado, false);
  assert.match(inf.problemas.join(" "), /reseña de 1 caracteres normalizados/);
});

test("A2: largos, espacios, nombres y contextos inválidos se rechazan antes de evaluar", () => {
  const ok = completo();
  const conTexto = (t: string, tipo: "resena" | "nombre" = "resena") => {
    const b = completo();
    const i = b.findIndex((c) => c.tipo === tipo && c.grupo === "abuso");
    b[i] = { ...b[i], texto: t };
    return evaluarContrato(b);
  };
  assert.equal(evaluarContrato(ok).aprobado, true);
  for (const malo of [" ".repeat(200), "a".repeat(601), `${" ".repeat(50)}corto${" ".repeat(50)}`]) {
    assert.equal(conTexto(malo).evaluable, false, JSON.stringify(malo.slice(0, 10)));
  }
  assert.equal(conTexto("x", "nombre").evaluable, false);
  assert.equal(conTexto("Un nombre larguísimo de más de veinticuatro", "nombre").evaluable, false);
  assert.equal(conTexto("Ana\nSur", "nombre").evaluable, false);
  // Contextos: vacío, de más de 3, corto y en un nombre.
  for (const contexto of [{ textosRecientes: [] }, { textosRecientes: [P + "a", P + "b", P + "c", P + "d"] }, { textosRecientes: ["corto"] }]) {
    const b = completo();
    const i = b.findIndex((c) => c.tipo === "resena" && c.grupo === "abuso");
    b[i] = { ...b[i], contexto };
    assert.equal(evaluarContrato(b).evaluable, false, JSON.stringify(contexto).slice(0, 40));
  }
  const b = completo();
  const k = b.findIndex((c) => c.tipo === "nombre");
  b[k] = { ...b[k], contexto: { textosRecientes: [P + "uno"] } };
  assert.equal(evaluarContrato(b).evaluable, false);
});

test("A2: un rechazo de FORMATO (carácter de control) no cuenta como detección y falla C0", () => {
  const b = completo();
  const i = b.findIndex((c) => c.familias[0] === "F1");
  // Largo válido, pero con una marca de dirección: el módulo lo rechaza por formato.
  b[i] = { ...b[i], texto: `${P}Una reseña con un control‮ escondido en el medio.` };
  const inf = evaluarContrato(b);
  assert.equal(inf.evaluable, true);
  const r = inf.resultados.find((x) => x.caso.id === b[i].id)!;
  assert.equal(r.decision.resultado, "rechazo_formato");
  assert.equal(r.detectado, false);
  assert.equal(inf.criterios.find((c) => c.id === "C0")!.estado, "no_cumple");
  assert.equal(inf.criterios.find((c) => c.id === "C1a")!.estado, "no_cumple");
  assert.equal(inf.aprobado, false);
});

test("bloquear un teléfono NO aprueba una amenaza; los mixtos no sustituyen los puros", () => {
  const falsosH1 = Array.from({ length: 30 }, (_, i): CasoContrato => ({
    id: id(), tipo: "resena", grupo: "abuso", categoria: "h1", variante: "directa", esperado: "retener",
    texto: `${P}Vas a ver lo que te pasa, llamame al 11 4455 66${String(10 + i)}.`, familias: ["H1"], alcance: "dentro", autoria: "independiente",
  }));
  const sinH1 = completo().filter((c) => c.familias[0] !== "H1");
  const inf = evaluarContrato([...sinH1, ...falsosH1]);
  assert.ok(inf.resultados.filter((r) => falsosH1.some((f) => f.id === r.caso.id)).every((r) => r.detectado), "el texto no se publicó");
  assert.equal(inf.criterios.find((c) => c.id === "CS-H1")!.estado, "no_cumple");
  assert.equal(inf.aprobado, false);
  const mixtos = falsosH1.map((c) => ({ ...c, id: `${c.id}-m`, familias: ["H1", "F1"] as CasoContrato["familias"] }));
  const inf2 = evaluarContrato([...sinH1, ...mixtos]);
  assert.equal(inf2.evaluable, false);
  assert.match(inf2.problemas.join(" "), /H1 puros independientes: hay 0/);
});

test("el agregado no compensa: H3 que falla hace fallar aunque el resto sea perfecto", () => {
  const h3Falla = Array.from({ length: 30 }, (_, i): CasoContrato => ({
    id: id(), tipo: "resena", grupo: "abuso", categoria: "h3", variante: "directa", esperado: "retener",
    texto: `${P}Ese tipo vive por la zona norte, cerca de la estación número ${i}.`, familias: ["H3"], alcance: "dentro", autoria: "independiente",
  }));
  const inf = evaluarContrato([...completo().filter((c) => c.familias[0] !== "H3"), ...h3Falla]);
  assert.equal(inf.criterios.find((c) => c.id === "CS-H3")!.estado, "no_cumple");
  assert.equal(inf.aprobado, false);
});

test("autoría complementaria en lo sensible no cumple el requisito independiente", () => {
  const b = completo().map((c) => (c.familias[0] === "H1" ? { ...c, autoria: "complementaria" as const } : c));
  const inf = evaluarContrato(b);
  assert.equal(inf.evaluable, false);
  assert.equal(inf.aprobado, false);
});

test("un banco incompleto, sin denominador o inválido nunca aprueba; requisitos en cero no son un atajo", () => {
  assert.equal(evaluarContrato(completo().filter((c) => !(c.tipo === "nombre" && c.grupo === "abuso"))).aprobado, false);
  assert.equal(evaluarContrato(completo().filter((c) => c.grupo !== "legitima")).aprobado, false);
  assert.equal(evaluarContrato([]).aprobado, false);
  const P0 = `${P}Texto de prueba con largo suficiente para validar el esquema.`;
  for (const malo of [
    { id: id(), tipo: "resena", grupo: "abuso", categoria: "x", variante: "directa", esperado: "retener", texto: P0, familias: [], alcance: "fuera", autoria: "independiente" },
    { id: id(), tipo: "resena", grupo: "legitima", categoria: "x", esperado: "publicar", texto: P0, familias: ["F1"], alcance: "dentro", autoria: "independiente" },
    { id: id(), tipo: "resena", grupo: "abuso", categoria: "x", variante: "directa", esperado: "retener", texto: P0, familias: ["Z9"], alcance: "dentro", autoria: "independiente" },
    { id: id(), tipo: "resena", grupo: "abuso", categoria: "x", variante: "directa", esperado: "retener", texto: P0, familias: ["H1"], alcance: "dentro", exclusion: "E7", autoria: "independiente" },
  ] as unknown as CasoContrato[]) {
    const inf = evaluarContrato([...completo(), malo]);
    assert.equal(inf.evaluable, false, JSON.stringify(malo).slice(0, 80));
  }
  const cero = { legitimasResena: 0, nombresLegitimos: 0, abusoResena: 0, abusoDentroF: 0, ofuscadasDentro: 0, cs: { H1: 0, "H2-R": 0, "H2-N": 0, H3: 0 } };
  assert.equal(evaluarContrato(legitimas(5), cero).aprobado, false);
  assert.ok(REQUISITOS_CONTRATO.legitimasResena >= 150 && REQUISITOS_CONTRATO.abusoResena >= 150);
});

test("fuera del catálogo se informa aparte y no entra en C1a/C2a", () => {
  const fuera: CasoContrato = {
    id: id(), tipo: "resena", grupo: "abuso", categoria: "e7", variante: "directa", esperado: "retener",
    texto: `${P}Ya sé a qué hora sacás al perro, cuidate.`, familias: [], alcance: "fuera", exclusion: "E7", autoria: "independiente",
  };
  const inf = evaluarContrato([...completo(), fuera]);
  assert.equal(inf.aprobado, true);
  assert.deepEqual(inf.fuera.map((f) => f.exclusion), ["E7"]);
});
