// Claude Code en modo headless (`claude -p`) para los pasos con LLM del
// pipeline de curado, garantizando que se use la SUSCRIPCIÓN (plan Max) y no
// la API paga de Anthropic.
//
// Dos defensas, porque una sola no alcanza:
//   1. El proceso hijo arranca SIN las variables que harían que Claude Code se
//      autentique o facture por otro lado (API key, token de autenticación,
//      gateway, Bedrock, Vertex). Si el dueño corre el script desde una
//      terminal que las tiene, igual no llegan al hijo.
//   2. Antes de gastar en lotes, un SONDEO mínimo pide el mensaje de inicio en
//      `stream-json` y lee `apiKeySource`: con la suscripción (OAuth) vale
//      "none". Cualquier otro valor detiene todo antes del primer lote.

import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

// Variables que cambian cómo se autentica o a dónde factura Claude Code.
export const VARIABLES_DE_FACTURACION = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_CUSTOM_HEADERS",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
  "AWS_BEARER_TOKEN_BEDROCK",
  "ANTHROPIC_BEDROCK_BASE_URL",
  "ANTHROPIC_VERTEX_BASE_URL",
  "ANTHROPIC_VERTEX_PROJECT_ID",
  "CLAUDE_CODE_API_KEY_HELPER_TTL_MS",
];

/** Copia del entorno sin las variables de facturación. Nunca imprime valores. */
export function entornoSuscripcion(env = process.env) {
  const limpio = { ...env };
  const quitadas = [];
  for (const v of VARIABLES_DE_FACTURACION) {
    if (v in limpio) { delete limpio[v]; quitadas.push(v); }
  }
  return { env: limpio, quitadas };
}

/** Lee el mensaje de inicio de una salida `stream-json`. */
export function leerInicio(salida) {
  for (const linea of salida.split("\n")) {
    if (!linea.trim()) continue;
    try {
      const m = JSON.parse(linea);
      if (m.type === "system" && m.subtype === "init") return { apiKeySource: m.apiKeySource ?? null, model: m.model ?? null };
    } catch { /* línea no JSON */ }
  }
  return null;
}

/** ¿Este inicio garantiza suscripción? Sólo "none" (OAuth, sin API key). */
export const esSuscripcion = (inicio) => inicio?.apiKeySource === "none";

/**
 * Sondeo: una invocación mínima (1 turno, respuesta de una palabra) que sólo
 * sirve para leer `apiKeySource` y el modelo. Consume una porción ínfima del
 * plan.
 */
export function sondearAutenticacion({ modelo = "sonnet", ejecutar = spawn } = {}) {
  const { env, quitadas } = entornoSuscripcion();
  return new Promise((ok, mal) => {
    const hijo = ejecutar("claude", ["-p", "--model", modelo, "--output-format", "stream-json", "--verbose", "--max-turns", "1"], { cwd: tmpdir(), shell: true, env });
    let out = "";
    hijo.stdout.on("data", (c) => (out += c));
    hijo.on("error", (e) => mal(new Error(`No pude ejecutar claude: ${e.message}`)));
    hijo.on("close", () => ok({ inicio: leerInicio(out), quitadas }));
    hijo.stdin.write("Respondé sólo con la palabra OK.");
    hijo.stdin.end();
  });
}
