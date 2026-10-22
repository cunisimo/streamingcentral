// REGRESIÓN CONOCIDA sobre el reservado 1 de E1 (ya divulgado). No es una
// medición independiente: sus casos se conocieron al auditar E1 y se usaron
// como referencia para E1.1. El archivo, su sello y su informe fallido
// (docs/medidas/2026-10-22-e1-banco-reservado.md) quedan intactos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluarCaso, type CasoBanco } from "./evaluar.ts";

const casos: CasoBanco[] = JSON.parse(
  readFileSync(join(process.cwd(), "scripts/comunidad/banco-reservado/reservado.json"), "utf8"),
).casos;

// Falso positivo conocido y aceptado por la auditoría de ffa5061: una
// dirección ficticia de la trama ("vive en la calle Corrientes 1234") retiene.
const FALSOS_POSITIVOS_CONOCIDOS = new Set(["R-L-045"]);

test("reservado 1 como regresión: los tres fallos divulgados ya se detectan", () => {
  for (const id of ["R-A-009", "R-A-018", "R-A-029"]) {
    const r = evaluarCaso(casos.find((c) => c.id === id)!);
    assert.ok(r.detectado, `${id}: ${r.decision.resultado}`);
  }
});

test("reservado 1 como regresión: ningún abuso queda sin detectar; legítimas publican salvo el falso positivo conocido", () => {
  const fallos = casos.map(evaluarCaso).filter((r) =>
    r.caso.grupo === "abuso" ? !r.detectado : r.decision.resultado !== "publicar" && !FALSOS_POSITIVOS_CONOCIDOS.has(r.caso.id));
  assert.deepEqual(fallos.map((r) => `${r.caso.id} → ${r.decision.resultado}`), []);
});
