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
 * R2-RA-042 ("mi correo es charly_movies en el de Google... Escribime"): de
 * 40288f6 a 2026-10-22.5 se RETENÍA (correo indirecto), más débil que su
 * etiqueta "rechazar". Con el contrato v1 contiene un alias y una intención
 * (F4) y se RECHAZA, que coincide con su etiqueta. La prueba lo fija.
 */
const AHORA_COINCIDE_CON_LA_ETIQUETA: Readonly<Record<string, string>> = {
  "R2-RA-042": "F4 (contrato v1): alias + intención en el ámbito; se rechaza.",
};

/**
 * Falsos positivos del contrato de moderación v1 aplicado literalmente
 * (24/10/2026). Siguen siendo legítimas y cuentan en C3/C4.
 */
const FALSOS_POSITIVOS_CONTRATO_V1: Readonly<Record<string, { salida: string; motivo: string }>> = {
  "R2-RL-087": { salida: "rechazo_contenido", motivo: "F4: '4K' tiene forma de alias (A) y 'tele' es alias de Telegram (§6.M)." },
  "R2-RL-101": { salida: "retener", motivo: "S2: intención ('mandame', en un diálogo) y medio ('celular') en el ámbito." },
  "R2-RL-108": { salida: "retener", motivo: "S2: intención ('contactame', en un diálogo) y medio ('canal') en el ámbito." },
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
    .filter((r) => r.caso.grupo === "legitima" && r.decision.resultado !== "publicar" && !(r.caso.id in RETENIDAS_CONOCIDAS) && !(r.caso.id in FALSOS_POSITIVOS_CONTRATO_V1))
    .map((r) => `${r.caso.id} → ${r.decision.resultado}`);
  assert.deepEqual(malas, []);
  for (const id of Object.keys(RETENIDAS_CONOCIDAS)) {
    assert.equal(resultados.find((r) => r.caso.id === id)?.decision.resultado, "retener", id);
  }
  for (const [id, { salida }] of Object.entries(FALSOS_POSITIVOS_CONTRATO_V1)) {
    assert.equal(resultados.find((r) => r.caso.id === id)?.decision.resultado, salida, id);
  }
});

test("R2-RA-042 ahora coincide con su etiqueta (rechazo por F4)", () => {
  for (const id of Object.keys(AHORA_COINCIDE_CON_LA_ETIQUETA)) {
    assert.equal(resultados.find((r) => r.caso.id === id)?.decision.resultado, "rechazo_contenido", id);
  }
});
