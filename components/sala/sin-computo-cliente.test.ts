// EL CLIENTE NO COMPUTA RESULTADOS (plan de salas, Tarea 4.1, decisión del
// dueño). Quién ganó, si hubo empate y entre cuáles, lo dice `sala_estado` en
// `resultado` (calculado por `sala_computar` en la base). Este barrido falla si
// algún componente de la sala vuelve a contar votos por su cuenta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "components", "sala");
const archivos = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));

// Lo prohibido: leer los votos de la ronda, filtrar/contar por "yes", y
// deducir un ganador o un empate en el cliente.
const PROHIBIDO: [RegExp, string][] = [
  [/mis_votos/, "leer mis_votos (los votos no se miran en el cliente)"],
  [/room_votes/, "tocar room_votes"],
  [/\.filter\(\s*\(?[^)]*\)?\s*=>[^)]*\b(voto|votos|yes)\b/, "filter( sobre votos o \"yes\""],
  [/===\s*["']yes["']/, "comparar contra \"yes\" (contar síes)"],
  [/\b(contarVotos|contarSies|calcularGanador|computarResultado|maxVotos)\b/, "calcular el resultado en el cliente"],
];

test("hay componentes de sala y ninguno cuenta votos ni calcula el resultado", () => {
  assert.ok(archivos.length >= 10, `archivos: ${archivos.join(", ")}`);
  const hallazgos: string[] = [];
  for (const f of archivos) {
    const src = readFileSync(join(DIR, f), "utf8");
    for (const [re, que] of PROHIBIDO) if (re.test(src)) hallazgos.push(`${f}: ${que}`);
  }
  assert.deepEqual(hallazgos, []);
});

test("las pantallas de resultado leen `resultado` de la RPC (ganador_pos / empatadas / tipo), no lo deducen", () => {
  const view = readFileSync(join(DIR, "SalaView.tsx"), "utf8");
  assert.match(view, /r\.tipo === "empate"/);
  assert.match(view, /r\.ganador_pos/);
  const empate = readFileSync(join(DIR, "ResultadoEmpate.tsx"), "utf8");
  assert.match(empate, /resultado\.empatadas/);
  assert.match(empate, /resultado\.ganador_pos/);
  assert.match(empate, /resultado\.desempatado/);
  assert.match(empate, /resultado\.puede_desempatar/, "el botón Desempatar lo habilita la base, no un es_host local");
  const match = readFileSync(join(DIR, "ResultadoMatch.tsx"), "utf8");
  assert.match(match, /puede_otra_tanda/, "Otra tanda la habilita la base");
});

test("EN ROJO: el barrido detecta un conteo de síes escrito de las formas típicas", () => {
  const malos = [
    `const sies = Object.values(ronda.mis_votos).filter((v) => v === "yes").length;`,
    `votos.filter(v => v.voto === "yes")`,
    `if (voto === 'yes') n++`,
    `const g = calcularGanador(titulos)`,
  ];
  for (const m of malos) assert.ok(PROHIBIDO.some(([re]) => re.test(m)), m);
});

test("con ganadora el pie ofrece 'Cerrar sala' y NO 'Otra tanda'; la condición sigue viniendo de la base", () => {
  const match = readFileSync(join(DIR, "ResultadoMatch.tsx"), "utf8");
  // La bifurcación LEE `ganador_pos` (lo calculó la base), no cuenta votos.
  assert.match(match, /const hayGanadora = typeof estado\.resultado\?\.ganador_pos === "number"/);
  assert.match(match, /hayGanadora \? \(/, "el pie decide por la ganadora antes que por puede_otra_tanda");
  assert.match(match, /<CerrarSala roomId=\{roomId\} \/>/, "el organizador puede cerrar sin esperar los 5 min");
  assert.match(match, /estado\.soy\.es_host && <CerrarSala/, "cerrar es sólo del organizador");
  // Las tres pantallas comparten este pie, así que el cambio alcanza a match,
  // a ganador de grupo y al desempate resuelto de una sola vez.
  for (const f of ["ResultadoEmpate.tsx", "ResultadoSinCoincidencias.tsx"]) {
    assert.match(readFileSync(join(DIR, f), "utf8"), /<PieResultado /, `${f} usa el pie compartido`);
  }
  // Cerrar la sala es una sola implementación, la del componente.
  const lobby = readFileSync(join(DIR, "Lobby.tsx"), "utf8");
  assert.match(lobby, /<CerrarSala roomId=\{roomId\} \/>/);
  assert.doesNotMatch(lobby, /sala_cerrar/, "el lobby ya no llama la RPC por su cuenta");
});
