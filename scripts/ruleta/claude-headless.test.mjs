// Garantías de la generación con Claude Code headless (sin red ni cuota).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EventEmitter } from "node:events";
import { entornoSuscripcion, leerInicio, leerSondeo, esSuscripcion, sondearAutenticacion, VARIABLES_DE_FACTURACION } from "./claude-headless.mjs";

test("el entorno del hijo no lleva NINGUNA variable de facturación por API, y conserva el resto", () => {
  const env = { PATH: "x", HOME: "y", ANTHROPIC_API_KEY: "secreto", ANTHROPIC_BASE_URL: "http://gw", CLAUDE_CODE_USE_BEDROCK: "1" };
  const { env: limpio, quitadas } = entornoSuscripcion(env);
  for (const v of VARIABLES_DE_FACTURACION) assert.ok(!(v in limpio), v);
  assert.equal(limpio.PATH, "x");
  assert.deepEqual(quitadas.sort(), ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_USE_BEDROCK"]);
  assert.equal(env.ANTHROPIC_API_KEY, "secreto", "no muta el entorno original");
});

test("sólo apiKeySource = \"none\" cuenta como suscripción", () => {
  const init = (src) => `{"type":"system","subtype":"init","apiKeySource":"${src}","model":"claude-sonnet"}\n{"type":"result","is_error":false,"result":"OK"}`;
  assert.equal(esSuscripcion(leerSondeo(init("none"))), true);
  assert.equal(esSuscripcion(leerSondeo(init("ANTHROPIC_API_KEY"))), false);
  assert.equal(esSuscripcion(leerSondeo(init("apiKeyHelper"))), false);
  assert.equal(esSuscripcion(leerSondeo("basura")), false, "sin mensaje de inicio no hay garantía");
  assert.equal(leerInicio(init("none")).model, "claude-sonnet");
});

test("el sondeo arranca el hijo con el entorno limpio y el modelo pedido", async () => {
  let visto;
  const falso = (cmd, argv, opts) => {
    visto = { cmd, argv, opts };
    const h = new EventEmitter();
    h.stdout = new EventEmitter();
    h.stdin = { write() {}, end() { queueMicrotask(() => { h.stdout.emit("data", '{"type":"system","subtype":"init","apiKeySource":"none","model":"m"}\n{"type":"result","is_error":false,"result":"OK"}\n'); h.emit("close", 0); }); } };
    return h;
  };
  process.env.ANTHROPIC_API_KEY_PRUEBA_NO_SE_USA = "1";
  const r = await sondearAutenticacion({ modelo: "sonnet", ejecutar: falso });
  assert.equal(visto.cmd, "claude");
  assert.deepEqual(visto.argv.slice(0, 3), ["-p", "--model", "sonnet"]);
  for (const v of VARIABLES_DE_FACTURACION) assert.ok(!(v in visto.opts.env), v);
  assert.equal(esSuscripcion(r.inicio), true);
});

test("generate-copy: hijo con entorno limpio, sondeo antes del primer lote, ids sólo del lote y corte tras un reintento", () => {
  const s = readFileSync(resolve(import.meta.dirname, "..", "generate-copy.mjs"), "utf8");
  assert.match(s, /env: ENTORNO_HIJO/);
  assert.ok(s.indexOf("sondearAutenticacion({") < s.indexOf("for (const [i, lote] of lotes.entries())"), "el sondeo va antes de los lotes");
  assert.match(s, /if \(!esSuscripcion\(sondeo\.inicio\)\)[\s\S]{0,200}process\.exit\(4\)/);
  assert.match(s, /!delLote\.has\(r\.id\)/, "un id de otro título del pool no puede pisar su texto");
  assert.match(s, /intento < 2/, "como máximo un reintento");
  assert.match(s, /if \(!ok\) \{[\s\S]{0,600}process\.exit\(3\)/, "un lote fallido dos veces detiene la corrida");
  assert.match(s, /--model", MODEL/);
  assert.match(s, /"--max-turns", "4"/);
});

test("el sondeo exige una respuesta REAL exitosa: el mensaje de inicio sale antes de autenticarse", async () => {
  const { leerSondeo } = await import("./claude-headless.mjs");
  const init = '{"type":"system","subtype":"init","apiKeySource":"none","model":"m"}';
  // Caso real del 2026-10-07: init con "none" y después falla la autenticación.
  const vencida = `${init}\n{"type":"result","subtype":"success","is_error":true,"result":"Failed to authenticate: OAuth session expired"}`;
  assert.equal(esSuscripcion(leerSondeo(vencida)), false);
  assert.match(leerSondeo(vencida).error, /OAuth session expired/);
  const bien = `${init}\n{"type":"result","subtype":"success","is_error":false,"result":"OK"}`;
  assert.equal(esSuscripcion(leerSondeo(bien)), true);
  assert.equal(esSuscripcion(leerSondeo(init)), false, "sin resultado no hay garantía");
});

test("generate-copy toma de --ids los datos de títulos que no están en el pool (reemplazos desde la reserva)", () => {
  const s = readFileSync(resolve(import.meta.dirname, "..", "generate-copy.mjs"), "utf8");
  assert.ok(s.includes(".titulos ?? [];") && s.includes("if (!ya.has(t.tmdb_id)) titulos.push(t);"));
});

test("generate-copy no reescribe copy-ruleta.json si el lote no produjo nada", () => {
  const s = readFileSync(resolve(import.meta.dirname, "..", "generate-copy.mjs"), "utf8");
  assert.match(s, /if \(ok\) await guardar\(\);/);
});
