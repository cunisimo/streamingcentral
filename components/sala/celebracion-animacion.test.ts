// La animación del match (decisión del dueño, 23/09: la unión del corazón
// quedaba básica). Barrido TEXTUAL sobre el CSS y el componente: fija las
// propiedades que una lectura humana deja pasar y que, si se pierden, devuelven
// la animación anterior sin que nada falle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8").replace(/\r\n/g, "\n");
const cel = readFileSync(join(process.cwd(), "components/sala/CelebracionMatch.tsx"), "utf8");

/** El bloque de una keyframe, con sus pasos. */
function keyframe(nombre: string): string {
  const i = css.indexOf(`@keyframes ${nombre}{`);
  assert.ok(i >= 0, `falta @keyframes ${nombre}`);
  let nivel = 0;
  for (let j = i; j < css.length; j++) {
    if (css[j] === "{") nivel++;
    else if (css[j] === "}" && --nivel === 0) return css.slice(i, j + 1);
  }
  throw new Error(`@keyframes ${nombre} sin cerrar`);
}

test("las mitades tienen SECUENCIA, no un solo movimiento: anticipación, unión acelerando y pasada de largo", () => {
  for (const [nombre, signo] of [["sala-mitad-izq", 1], ["sala-mitad-der", -1]] as const) {
    const k = keyframe(nombre);
    // Anticipación: el segundo paso se ALEJA más que el primero (±92% → ±100%).
    assert.match(k, new RegExp(`10%\\{transform:translateX\\(${signo > 0 ? "-" : ""}100%\\)`), `${nombre}: sin anticipación`);
    // Unión acelerando: un ease-IN de verdad (el primer par de la curva en 0).
    assert.ok(k.includes("cubic-bezier(.55,0,.85,.35)"), `${nombre}: la unión no acelera`);
    // Se pasa de largo: cruza el centro al lado contrario del que vino.
    assert.match(k, new RegExp(`71%\\{transform:translateX\\(${signo > 0 ? "" : "-"}4%\\)`), `${nombre}: no se pasa de largo`);
    assert.match(k, /100%\{transform:translateX\(0\)/, `${nombre}: no vuelve al centro`);
    // Llegan sólidas: la opacidad termina de subir en el primer paso.
    assert.match(k, /10%\{[^}]*opacity:1/, `${nombre}: sigue siendo un corazón fantasma todo el viaje`);
  }
});

test("las dos mitades NO llegan a la vez (la simetría exacta se lee a robot)", () => {
  assert.match(css, /\.sala-mitad-izq\{animation:sala-mitad-izq 420ms both\}/);
  assert.match(css, /\.sala-mitad-der\{animation:sala-mitad-der 420ms 30ms both\}/, "la derecha llega 30 ms (2 frames) después");
});

test("el impacto es UN pulso con overshoot real, no un latido repetido", () => {
  const k = keyframe("sala-impacto");
  // El tercer par de la curva por encima de 1 es lo que hace que se pase del
  // valor final. La curva anterior, cubic-bezier(.2,.8,.2,1), no podía rebotar.
  assert.ok(k.includes("cubic-bezier(.34,1.56,.64,1)"), "sin overshoot");
  assert.match(k, /40%\{transform:scale\(1\.15\)\}/);
  assert.match(k, /100%\{transform:scale\(1\)\}/);
  assert.match(css, /\.sala-corazon\{animation:sala-impacto 240ms 440ms both\}/, "el pulso empieza después de la unión");
  assert.doesNotMatch(css, /sala-latido/, "el latido repetido dos veces se retiró");
});

test("hay destello y chispas, en el naranja de la marca y saliendo del centro", () => {
  assert.match(css, /\.sala-corazon::after\{[^}]*var\(--accent\)/, "el destello usa el token de marca");
  assert.match(css, /\.sala-chispas i\{[^}]*background:var\(--accent\)/);
  assert.match(keyframe("sala-destello"), /100%\{opacity:0;transform:translate\(-50%,-50%\) scale\(1\.75\)\}/);
  assert.match(keyframe("sala-chispa"), /rotate\(var\(--a\)\) translateY\(var\(--d\)\)/, "las chispas salen en su ángulo");
  assert.match(cel, /const CHISPAS = \[0, 45, 90, 135, 180, 225, 270, 315\]/, "ocho, repartidas");
});

test("SÓLO transform y opacity: nada que dispare layout ni pintura cara", () => {
  const prohibido = /(^|[;{])\s*(width|height|top|left|right|bottom|margin|padding|filter|box-shadow)\s*:/;
  for (const n of ["sala-mitad-izq", "sala-mitad-der", "sala-impacto", "sala-destello", "sala-chispa"]) {
    for (const paso of keyframe(n).split("}").slice(1)) {
      assert.doesNotMatch(paso, prohibido, `${n}: anima una propiedad que no es transform/opacity`);
    }
  }
});

test("toda la animación vive bajo prefers-reduced-motion: no-preference, y el estado base es invisible", () => {
  const i = css.indexOf("@media (prefers-reduced-motion: no-preference){\n  /* La unión del corazón");
  assert.ok(i >= 0, "el bloque de la coreografía no está bajo la media query");
  const bloque = css.slice(i, css.indexOf("\n}\n", i));
  for (const sel of [".sala-mitad-izq{", ".sala-mitad-der{", ".sala-corazon{", ".sala-corazon::after{", ".sala-chispas i{"]) {
    assert.ok(bloque.includes(sel), `${sel} quedó fuera de la media query`);
  }
  // Con `reduce` no se apaga nada: el destello y las chispas nacen en opacity 0.
  assert.match(css, /\.sala-corazon::after\{[^}]*opacity:0/);
  assert.match(css, /\.sala-chispas i\{[^}]*opacity:0/);
});

test("la coreografía entra en la ventana de 600-900 ms", () => {
  const fin = (re: RegExp) => {
    const m = css.match(re)!;
    return Number(m[1]) + Number(m[2] ?? 0);
  };
  const tramos = [
    fin(/\.sala-mitad-der\{animation:sala-mitad-der (\d+)ms (\d+)ms/),
    fin(/\.sala-corazon\{animation:sala-impacto (\d+)ms (\d+)ms/),
    fin(/\.sala-corazon::after\{animation:sala-destello (\d+)ms (\d+)ms/),
    fin(/\.sala-chispas i\{animation:sala-chispa (\d+)ms (\d+)ms/),
  ];
  const total = Math.max(...tramos);
  assert.ok(total >= 600 && total <= 900, `la coreografía dura ${total} ms`);
});

test("🔴 el auto-cierre está DOS veces (TS y CSS) y los dos números tienen que coincidir", () => {
  const ms = Number(cel.match(/DURACION_CELEBRACION_MS = (\d+);/)![1]);
  assert.equal(ms, 2400);
  const seg = Number(css.match(/\.sala-celebracion\{animation:sala-cel-fin \.4s ease calc\(([\d.]+)s - \.4s\)/)![1]);
  assert.equal(seg * 1000, ms, "el fundido del CSS y el temporizador de TS se separaron");
  // Es un techo, no la duración: el overlay se descarta con un toque.
  assert.match(cel, /onClick=\{onFin\}/, "un toque en cualquier parte lo cierra");
  assert.match(cel, /e\.key === "Escape" \|\| e\.key === "Enter"/);
});

test("el confeti baja a 60 en la celebración y NO se toca el default, que comparte el desempate", () => {
  assert.match(cel, /<Confetti count=\{60\} \/>/);
  const confetti = readFileSync(join(process.cwd(), "components/desempate/Confetti.tsx"), "utf8");
  assert.match(confetti, /count = 70/, "el default sigue igual: lo usa DesempateResult");
  const desempate = readFileSync(join(process.cwd(), "components/desempate/DesempateResult.tsx"), "utf8");
  assert.match(desempate, /<Confetti \/>/, "el desempate lo usa sin prop, así que no cambió");
});
