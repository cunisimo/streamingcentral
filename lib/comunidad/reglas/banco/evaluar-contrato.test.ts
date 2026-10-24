// El evaluador del contrato con datos sintéticos AJENOS a cualquier reservado
// (plantillas generadas acá). Controles: CS se mide por el disparo de la
// propia familia y con casos puros; bloquear un teléfono no aprueba una
// amenaza; un banco inválido, incompleto o sin denominador nunca aprueba.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarContrato, REQUISITOS_CONTRATO, type CasoContrato } from "./evaluar-contrato.ts";

const P = "La película tiene buenos actores y una historia que mantiene el interés hasta el final. ";
let n = 0;
const caso = (c: Partial<CasoContrato> & Pick<CasoContrato, "grupo" | "texto">): CasoContrato => ({
  id: `T-${++n}`, tipo: "resena", categoria: "prueba", esperado: c.grupo === "legitima" ? "publicar" : "retener",
  familias: [], alcance: "dentro", autoria: "independiente", ...(c.grupo === "abuso" ? { variante: "directa" as const } : {}), ...c,
});

const legitimas = () => Array.from({ length: 50 }, (_, i) => caso({ grupo: "legitima", texto: `${P}Muy recomendable, la vi ${i + 2} veces con amigos.` }));
const f1 = () => Array.from({ length: 10 }, (_, i) => caso({ grupo: "abuso", esperado: "rechazar", variante: "ofuscada", familias: ["F1"], texto: `${P}Llamame al 11 4455 66${String(10 + i)} para charlar.` }));
const h1 = (k: number) => Array.from({ length: k }, (_, i) => caso({ grupo: "abuso", familias: ["H1"], texto: `${P}Al que puso ${i + 1} estrellas: te voy a matar.` }));
const h2r = (k: number) => Array.from({ length: k }, (_, i) => caso({ grupo: "abuso", familias: ["H2"], texto: `${P}Los inmigrantes son una plaga, dice el usuario ${i + 1}.` }));
const h2n = (k: number) => Array.from({ length: k }, (_, i) => caso({ grupo: "abuso", tipo: "nombre", familias: ["H2"], texto: `FueraBolitas${i}` }));
const h3 = (k: number) => Array.from({ length: k }, (_, i) => caso({ grupo: "abuso", familias: ["H3"], texto: `${P}El acomodador, DNI 27.345.${String(100 + i)}, me echó.` }));
const completo = () => [...legitimas(), ...f1(), ...h1(30), ...h2r(30), ...h2n(10), ...h3(30)];

test("un banco completo y correcto aprueba (control positivo)", () => {
  const inf = evaluarContrato(completo());
  assert.equal(inf.evaluable, true, inf.problemas.join("; "));
  assert.deepEqual(inf.criterios.filter((c) => c.estado !== "cumple").map((c) => `${c.id} ${c.valor}`), []);
  assert.equal(inf.aprobado, true);
});

test("bloquear un teléfono NO aprueba una amenaza: mixtos H1+F1 sin amenaza detectable no sustituyen los puros", () => {
  // 30 casos rotulados H1 que en realidad sólo tienen un teléfono: salida "rechazo", pero H1 no se dispara.
  const falsosH1 = Array.from({ length: 30 }, (_, i) => caso({
    grupo: "abuso", familias: ["H1"], texto: `${P}Vas a ver lo que te pasa, llamame al 11 4455 66${String(10 + i)}.`,
  }));
  const banco = [...legitimas(), ...f1(), ...falsosH1, ...h2r(30), ...h2n(10), ...h3(30)];
  const inf = evaluarContrato(banco);
  const cs = inf.criterios.find((c) => c.id === "CS-H1")!;
  assert.equal(inf.resultados.filter((r) => r.caso.familias[0] === "H1").every((r) => r.detectado), true, "el texto no se publicó");
  assert.equal(cs.estado, "no_cumple", cs.valor);
  assert.equal(inf.aprobado, false);
  // Y si son mixtos (H1+F1), no cuentan para el mínimo: CS-H1 no es evaluable.
  const mixtos = falsosH1.map((c) => ({ ...c, id: `${c.id}-m`, familias: ["H1", "F1"] as CasoContrato["familias"] }));
  const inf2 = evaluarContrato([...legitimas(), ...f1(), ...mixtos, ...h2r(30), ...h2n(10), ...h3(30)]);
  assert.equal(inf2.evaluable, false);
  assert.equal(inf2.aprobado, false);
  assert.match(inf2.problemas.join(" "), /H1 puros independientes: hay 0/);
});

test("el agregado no compensa: H3 que falla hace fallar aunque el resto sea perfecto", () => {
  const h3Falla = Array.from({ length: 30 }, (_, i) => caso({ grupo: "abuso", familias: ["H3"], texto: `${P}Ese tipo vive por la zona norte, cerca de la estación ${i}.` }));
  const inf = evaluarContrato([...legitimas(), ...f1(), ...h1(30), ...h2r(30), ...h2n(10), ...h3Falla]);
  assert.equal(inf.criterios.find((c) => c.id === "CS-H3")!.estado, "no_cumple");
  assert.equal(inf.aprobado, false);
});

test("autoría complementaria no cumple el requisito independiente", () => {
  const comp = h1(30).map((c) => ({ ...c, autoria: "complementaria" as const }));
  const inf = evaluarContrato([...legitimas(), ...f1(), ...comp, ...h2r(30), ...h2n(10), ...h3(30)]);
  assert.equal(inf.evaluable, false);
  assert.equal(inf.aprobado, false);
});

test("un banco incompleto, sin denominador o inválido nunca aprueba", () => {
  // Incompleto: faltan nombres H2.
  const sinNombres = evaluarContrato([...legitimas(), ...f1(), ...h1(30), ...h2r(30), ...h3(30)]);
  assert.equal(sinNombres.evaluable, false);
  assert.equal(sinNombres.aprobado, false);
  // Sin legítimas: C3/C4 sin denominador.
  const sinLegitimas = evaluarContrato([...f1(), ...h1(30), ...h2r(30), ...h2n(10), ...h3(30)]);
  assert.equal(sinLegitimas.aprobado, false);
  // Vacío.
  assert.equal(evaluarContrato([]).aprobado, false);
  // Inválidos: "fuera" sin exclusión, legítima con familia, familia desconocida.
  for (const malo of [
    caso({ grupo: "abuso", alcance: "fuera", texto: `${P}x` }),
    caso({ grupo: "legitima", familias: ["F1"], texto: `${P}x` }),
    { ...caso({ grupo: "abuso", texto: `${P}x` }), familias: ["Z9"] } as unknown as CasoContrato,
  ]) {
    const inf = evaluarContrato([...completo(), malo]);
    assert.equal(inf.evaluable, false);
    assert.equal(inf.aprobado, false);
  }
  // Requisitos en cero no sirven de atajo: el mínimo efectivo es 1.
  const req = { ...REQUISITOS_CONTRATO, cs: { H1: 0, "H2-R": 0, "H2-N": 0, H3: 0 } };
  assert.equal(evaluarContrato([...legitimas(), ...f1()], req).aprobado, false);
});

test("fuera del catálogo se informa aparte y no entra en C1a/C2a", () => {
  const fuera = caso({ grupo: "abuso", alcance: "fuera", exclusion: "E7", texto: `${P}Ya sé a qué hora sacás al perro, cuidate.` });
  const inf = evaluarContrato([...completo(), fuera]);
  assert.equal(inf.aprobado, true);
  assert.deepEqual(inf.fuera.map((f) => f.exclusion), ["E7"]);
});
