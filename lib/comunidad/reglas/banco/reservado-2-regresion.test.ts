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
 * Abusos detectados con una salida MÁS DÉBIL que su etiqueta. Antes de la
 * corrección de 40288f6, R2-RA-042 estaba declarado "fuera de alcance" y una
 * prueba exigía que siguiera sin detectarse; esa declaración se retiró (A2 de
 * la auditoría). Ahora `contacto.email_indirecto` lo RETIENE: no reconstruye
 * la dirección, detecta el intento. La etiqueta del reservado ("rechazar") no
 * se cambia; la diferencia queda a la vista y no se excluye de ninguna métrica.
 */
const DETECTADOS_MAS_DEBILES: Readonly<Record<string, string>> = {
  "R2-RA-042": "Correo descripto con paráfrasis ('mi correo es charly_movies en el de Google'): se retiene, etiqueta 'rechazar'.",
};

/** Legítimas que desde E1.2 quedan RETENIDAS (no rechazadas): pedido de red entre comillas. */
const RETENIDAS_CONOCIDAS: Readonly<Record<string, string>> = {
  "R2-RL-105": "Diálogo con 'Seguime en Instagram' entre comillas: señal débil, se retiene (A1).",
};

const resultados = casos.map(evaluarCaso);

test("reservado 2 como regresión: todo abuso se detecta, sin excepciones", () => {
  const sinDetectar = resultados
    .filter((r) => r.caso.grupo === "abuso" && !r.detectado)
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

test("los detectados con salida más débil quedan retenidos (si cambia, hay que revisar la declaración)", () => {
  for (const id of Object.keys(DETECTADOS_MAS_DEBILES)) {
    assert.equal(resultados.find((r) => r.caso.id === id)?.decision.resultado, "retener", id);
  }
});
