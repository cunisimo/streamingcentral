// Las referencias Unicode incorporadas son las declaradas (huella) y las
// tablas que usa el módulo salen exactamente de ellas (contrato v1, §1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generarTablas } from "./generar-tablas.ts";
import { HUELLAS_REFERENCIAS } from "./huellas.ts";

const DIR = join(process.cwd(), "lib/comunidad/reglas/referencias/unicode-18.0.0");
const bytes = (f: string) => readFileSync(join(DIR, f));
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

test("las tres referencias tienen la huella declarada (bytes exactos)", () => {
  for (const [f, h] of Object.entries(HUELLAS_REFERENCIAS)) assert.equal(sha(bytes(f)), h, f);
});

test("las cabeceras dicen la versión fijada", () => {
  assert.match(bytes("DerivedGeneralCategory.txt").toString("utf8").slice(0, 200), /DerivedGeneralCategory-18\.0\.0\.txt/);
  assert.match(bytes("confusables.txt").toString("utf8").slice(0, 600), /Version: 18\.0\.0/);
  assert.match(bytes("license.txt").toString("utf8").slice(0, 100), /UNICODE LICENSE V3/);
});

test("tablas-unicode.ts es exactamente lo que generan las referencias", () => {
  const esperado = generarTablas(bytes("DerivedGeneralCategory.txt").toString("utf8"), bytes("confusables.txt").toString("utf8"), {
    dgc: HUELLAS_REFERENCIAS["DerivedGeneralCategory.txt"],
    confusables: HUELLAS_REFERENCIAS["confusables.txt"],
  });
  const actual = readFileSync(join(process.cwd(), "lib/comunidad/reglas/tablas-unicode.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(actual, esperado);
});
