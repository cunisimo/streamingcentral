// REGRESIÓN CONOCIDA sobre el reservado 3 (ya ejecutado y divulgado; falló
// C1 y C2 con 2026-10-22.5). NO es una medición independiente: sus casos se
// conocieron antes de implementar el contrato v1. Los archivos, su sello y su
// informe (docs/medidas/2026-10-23-e1-reservado-3-resultado.*) quedan intactos;
// el ejecutor oficial sigue congelado a 2026-10-22.5 y no se vuelve a correr.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluarCaso, type CasoBanco } from "./evaluar.ts";

const DIR = join(process.cwd(), "scripts/comunidad/banco-reservado-3");
const casos: CasoBanco[] = ["reservado.json", "reservado-sensible.json"].flatMap((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")).casos);
const res = casos.map(evaluarCaso);
const sinDetectar = (categoria: string) =>
  res.filter((r) => r.caso.grupo === "abuso" && r.caso.categoria === categoria && !r.detectado).map((r) => r.caso.id).sort();

test("reservado 3 como regresión: ningún contacto claro ni ofuscado queda sin detectar", () => {
  assert.deepEqual(res.filter((r) => r.caso.claro && !r.detectado).map((r) => r.caso.id), []);
  assert.deepEqual(res.filter((r) => r.caso.variante === "ofuscada" && !r.detectado).map((r) => r.caso.id), []);
});

test("reservado 3 como regresión: legítimas publican salvo el falso positivo del contrato v1", () => {
  // R3-L-049: "M3GAN" tiene forma de alias (A) y "pidan" es intención (§6.I): F4 lo rechaza. Cuenta en C3.
  const frenadas = res.filter((r) => r.caso.grupo === "legitima" && r.decision.resultado !== "publicar");
  assert.deepEqual(frenadas.map((r) => `${r.caso.id} → ${r.decision.resultado}`), ["R3-L-049 → rechazo_contenido"]);
});

test("reservado 3 como regresión: lo que sigue sin detectar está fuera de las listas del contrato (fijado)", () => {
  // H2 en oraciones distintas (002, 003, 005) o sin término de §6.H2-b (006).
  assert.deepEqual(sinDetectar("odio"), ["R3-S-002", "R3-S-003", "R3-S-005", "R3-S-006"]);
  // H1 con "lo" sin destinatario de §6.H1-c ("el director" no está; "al director" sí).
  assert.deepEqual(sinDetectar("amenaza"), ["R3-S-011"]);
  // Fuera de capacidad (E7): no se promete.
  assert.equal(sinDetectar("fuera_capacidad").length, 8);
  for (const c of ["datos_personales", "spam", "perfil", "contacto.indirecto", "contacto.partido", "anomalo"]) {
    assert.deepEqual(sinDetectar(c), [], c);
  }
});
