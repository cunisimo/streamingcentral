// REGRESIÓN CONOCIDA sobre el reservado 2 de E1.1 (ya divulgado en la
// auditoría de 1f475e3). No es una medición independiente: sus fallos se
// conocieron antes de E1.2. Los archivos, su sello y su informe
// (docs/medidas/2026-10-22-e11-banco-reservado-2.md) quedan intactos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluarCaso, type CasoBanco } from "./evaluar.ts";

const DIR = join(process.cwd(), "scripts/comunidad/banco-reservado-2");
const casos: CasoBanco[] = ["reservado.json", "reservado-sensible.json"]
  .flatMap((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")).casos);

/**
 * Fuera del alcance de reglas determinísticas, documentado y DETENIDO para
 * revisión (no se declara resuelto ni se reclasifica): un correo descripto con
 * paráfrasis ("en el de Google, el que termina en com").
 */
const FUERA_DE_ALCANCE: Readonly<Record<string, string>> = {
  "R2-RA-042": "Correo descripto con paráfrasis, sin '@', 'arroba' ni el nombre del proveedor.",
};

/** Legítimas que desde E1.2 quedan RETENIDAS (no rechazadas): pedido de red entre comillas. */
const RETENIDAS_CONOCIDAS: Readonly<Record<string, string>> = {
  "R2-RL-105": "Diálogo con 'Seguime en Instagram' entre comillas: señal débil, se retiene (A1).",
};

const resultados = casos.map(evaluarCaso);

test("reservado 2 como regresión: todo abuso se detecta salvo lo declarado fuera de alcance", () => {
  const sinDetectar = resultados
    .filter((r) => r.caso.grupo === "abuso" && !r.detectado && !(r.caso.id in FUERA_DE_ALCANCE))
    .map((r) => `${r.caso.id} → ${r.decision.resultado}`);
  assert.deepEqual(sinDetectar, []);
});

test("reservado 2 como regresión: legítimas publican; las retenidas conocidas quedan retenidas, nunca rechazadas", () => {
  const malas = resultados
    .filter((r) => r.caso.grupo === "legitima" && r.decision.resultado !== "publicar" && !(r.caso.id in RETENIDAS_CONOCIDAS))
    .map((r) => `${r.caso.id} → ${r.decision.resultado}`);
  assert.deepEqual(malas, []);
  for (const id of Object.keys(RETENIDAS_CONOCIDAS)) {
    assert.equal(resultados.find((r) => r.caso.id === id)?.decision.resultado, "retener", id);
  }
});

test("lo declarado fuera de alcance sigue sin detectarse (si cambia, hay que revisar la declaración)", () => {
  for (const id of Object.keys(FUERA_DE_ALCANCE)) {
    assert.equal(resultados.find((r) => r.caso.id === id)?.detectado, false, id);
  }
});
