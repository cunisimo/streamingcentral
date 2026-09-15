// Guard de fuente sobre `SearchView`: el `onChange` del buscador tiene que
// INVALIDAR en el mismo handler que acepta el texto (auditoría de Codex sobre
// 708bce0, hallazgo 1). Un `onChange` limitado a `setQ` deja un render de
// React entre el texto nuevo y la invalidación, y una respuesta vieja que
// llegue ahí se acepta. La lógica está probada en busqueda-adaptador.test.ts;
// acá se fija que la vista la use por las dos puertas correctas.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const fuente = fs.readFileSync(path.join(import.meta.dirname, "SearchView.tsx"), "utf8").replace(/\r/g, "");

/** El texto balanceado de `onChange={…}` del input del buscador (el que lleva `ref={inputRef}`). */
function handlerDelInput(): string {
  const i = fuente.search(/<input\s+ref=\{inputRef\}/);
  assert.ok(i >= 0, "no está el input del buscador");
  const cierre = fuente.indexOf("/>", i);
  const j = fuente.indexOf("onChange={", i);
  assert.ok(j >= 0 && j < cierre, "el input del buscador no tiene onChange");
  let k = j + "onChange=".length; let prof = 0;
  for (; k < fuente.length; k++) {
    if (fuente[k] === "{") prof++;
    else if (fuente[k] === "}" && --prof === 0) break;
  }
  return fuente.slice(j, k + 1);
}

test("🔴 el onChange del buscador escribe en el adaptador en el MISMO handler, no sólo setQ", () => {
  const h = handlerDelInput();
  assert.match(h, /setQ\(/, "el handler tiene que seguir actualizando q");
  assert.match(h, /adaptador\.current!?\.escribir\(/, `el handler sólo hace setQ: la invalidación queda para el efecto — ${h}`);
  assert.doesNotMatch(fuente, /onChange=\{\(e\) => \{ setQ\(e\.target\.value\); setExplore\(null\); \}\}/, "el cableado de 708bce0 no puede volver");
});

test("la vista usa el adaptador (evento + efecto + restaurar + desmontar) y NO llama al controlador directo", () => {
  assert.match(fuente, /import \{ crearAdaptadorBusqueda \} from "\.\/busqueda-adaptador"/);
  assert.match(fuente, /adaptador\.current!?\.efecto\(\{/, "el useEffect delega en `efecto`");
  assert.match(fuente, /adaptador\.current!?\.restaurar\(/, "volver de una ficha pasa por `restaurar`");
  assert.match(fuente, /adaptador\.current\?\.desmontar\(\)/);
  assert.doesNotMatch(fuente, /cambiarTermino\(/, "el controlador se maneja sólo a través del adaptador");
  assert.doesNotMatch(fuente, /qRestaurado/, "la marca de restauración vive en el adaptador, no en la vista");
});
