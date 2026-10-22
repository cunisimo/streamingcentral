// E1 no conecta nada: el módulo de reglas no importa red, base, variables de
// entorno ni el conjunto reservado, y no hace ninguna llamada externa.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CASOS_DESARROLLO } from "./banco/desarrollo.ts";
import { evaluarBanco } from "./banco/evaluar.ts";

const DIR = join(process.cwd(), "lib/comunidad/reglas");

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? archivos(p) : p.endsWith(".ts") ? [p] : [];
  });
}

const fuentes = archivos(DIR).filter((p) => !p.endsWith(".test.ts"));

test("sólo importa módulos locales del propio directorio", () => {
  for (const p of fuentes) {
    const texto = readFileSync(p, "utf8");
    const imports = [...texto.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    for (const i of imports) assert.ok(i.startsWith("./") || i.startsWith("../"), `${p}: ${i}`);
    for (const i of imports) assert.ok(!i.includes("supabase") && !i.includes("banco-reservado"), `${p}: ${i}`);
  }
});

test("sin fetch, variables de entorno ni clientes de red en el código", () => {
  for (const p of fuentes) {
    const texto = readFileSync(p, "utf8");
    assert.doesNotMatch(texto, /\bfetch\s*\(|process\.env|XMLHttpRequest|WebSocket|node:(?:http|https|net|dns)/, p);
  }
});

test("evaluar el banco entero no hace ninguna llamada de red", () => {
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = (() => { llamadas++; throw new Error("red prohibida en E1"); }) as typeof fetch;
  try {
    const informe = evaluarBanco(CASOS_DESARROLLO);
    assert.ok(informe.resultados.length > 0);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(llamadas, 0);
});
