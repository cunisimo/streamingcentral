// El programador de fondo de la Etapa 3.b ("último bueno primero"), módulo
// PURO con `waitUntil` inyectado (diseño §33.2).
//
// 🔴 LA REGLA: `iniciar` no se invoca hasta que la tarea quedó REGISTRADA en
// el fondo. Si el fondo no está (fuera de Vercel), el kill switch está
// apagado, o el registro lanza, `programarEnFondo` devuelve `false` SIN haber
// iniciado nada: el que llama compone en línea, y no queda ni una tarea
// huérfana ni una segunda composición. La tarea registrada SIEMPRE resuelve:
// un rechazo de `iniciar` se contiene y se loguea; un fallo del log también.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearProgramadorDeFondo } from "./home-fondo.ts";

const tick = () => new Promise<void>((r) => setImmediate(r));

function arnes(o: { disponible?: boolean; apagado?: boolean; registrar?: (p: Promise<unknown>) => void; compuerta?: () => Promise<void> | null } = {}) {
  const registradas: Promise<unknown>[] = [];
  const errores: unknown[][] = [];
  const programar = crearProgramadorDeFondo({
    registrar: o.registrar ?? ((p) => { registradas.push(p); }),
    // Compuerta ya abierta (la respuesta ya construida) salvo que el test diga otra cosa;
    // el orden real con la compuerta cerrada está en home-fondo-orden.test.ts.
    compuerta: o.compuerta ?? (() => Promise.resolve()),
    disponible: o.disponible ?? true,
    apagado: o.apagado ?? false,
    error: (...a) => { errores.push(a); },
  });
  let iniciadas = 0;
  const iniciar = async () => { iniciadas++; };
  return { programar, registradas, errores, iniciar, cuantas: () => iniciadas };
}

/** Un `unhandledRejection` durante `fn` hace fallar el test. */
async function sinRechazosSueltos(fn: () => Promise<void>) {
  const sueltos: unknown[] = [];
  const h = (e: unknown) => { sueltos.push(e); };
  process.on("unhandledRejection", h);
  try { await fn(); for (let i = 0; i < 5; i++) await tick(); } finally { process.off("unhandledRejection", h); }
  assert.deepEqual(sueltos, [], "hubo una promesa rechazada sin manejar");
}

test("🔴 perezoso: `iniciar` NO corre en el mismo tick del registro; corre recién después de que la tarea quedó registrada", async () => {
  const a = arnes();
  let cuandoSeRegistro = -1;
  a.programar = crearProgramadorDeFondo({ registrar: (p) => { a.registradas.push(p); cuandoSeRegistro = a.cuantas(); }, compuerta: () => Promise.resolve(), disponible: true, apagado: false, error: () => {} });
  assert.equal(a.programar(a.iniciar), true);
  assert.equal(cuandoSeRegistro, 0, "al registrar, `iniciar` todavía no había corrido");
  assert.equal(a.cuantas(), 0, "tampoco en el mismo tick");
  await a.registradas[0];
  assert.equal(a.cuantas(), 1, "corrió una vez, después del registro");
});

test("🔴 compuerta CERRADA: la tarea queda registrada pero `iniciar` no corre hasta que la compuerta se abre (la respuesta ya construida)", async () => {
  let abrir: () => void = () => {};
  const a = arnes({ compuerta: () => new Promise<void>((r) => { abrir = r; }) });
  assert.equal(a.programar(a.iniciar), true);
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(a.cuantas(), 0, "ni veinte ticks alcanzan: sólo la compuerta");
  abrir();
  await a.registradas[0];
  assert.equal(a.cuantas(), 1);
});

test("🔴 sin compuerta (ningún handler declaró la frontera): devuelve false, no registra y no inicia", async () => {
  const a = arnes({ compuerta: () => null });
  assert.equal(a.programar(a.iniciar), false);
  await tick(); await tick();
  assert.equal(a.registradas.length, 0);
  assert.equal(a.cuantas(), 0);
});

test("🔴 fondo no disponible (fuera de Vercel): devuelve false, no registra y no inicia", async () => {
  const a = arnes({ disponible: false });
  assert.equal(a.programar(a.iniciar), false);
  await tick(); await tick();
  assert.equal(a.registradas.length, 0);
  assert.equal(a.cuantas(), 0);
});

test("🔴 kill switch apagado (HOME_UB_PRIMERO=0): devuelve false aunque el fondo esté disponible", async () => {
  const a = arnes({ apagado: true });
  assert.equal(a.programar(a.iniciar), false);
  await tick(); await tick();
  assert.equal(a.registradas.length, 0);
  assert.equal(a.cuantas(), 0);
});

test("🔴 el registro lanza (waitUntil rechaza sincrónicamente): false, `iniciar` CERO veces, ninguna promesa rechazada, el error queda logueado", async () => {
  await sinRechazosSueltos(async () => {
    const a = arnes({ registrar: () => { throw new Error("waitUntil no disponible"); } });
    assert.equal(a.programar(a.iniciar), false);
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(a.cuantas(), 0, "`iniciar` no puede haber corrido: nadie la sostiene");
    assert.equal(a.errores.length, 1);
    assert.match(String(a.errores[0][0]), /registro/);
  });
});

test("🔴 `iniciar` rechaza: la tarea registrada resuelve igual (contenida) y el error queda logueado", async () => {
  await sinRechazosSueltos(async () => {
    const a = arnes();
    assert.equal(a.programar(async () => { throw new Error("composición explotó"); }), true);
    await assert.doesNotReject(a.registradas[0]);
    assert.equal(a.errores.length, 1);
    assert.match(String(a.errores[0][1]), /composición explotó/);
  });
});

test("🔴 un fallo del propio log no rompe la tarea ni rechaza", async () => {
  await sinRechazosSueltos(async () => {
    const programar = crearProgramadorDeFondo({ registrar: () => {}, compuerta: () => Promise.resolve(), disponible: true, apagado: false, error: () => { throw new Error("el log explotó"); } });
    let corrio = false;
    // El registrador no guarda la promesa: la tomamos por el efecto (corrió) y por la ausencia de rechazos.
    assert.equal(programar(async () => { corrio = true; throw new Error("y la composición también"); }), true);
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(corrio, true);
  });
});

test("una sola composición por registro: dos llamadas a programar son dos tareas (cada líder registra la suya, nunca dos por el mismo líder)", async () => {
  const a = arnes();
  assert.equal(a.programar(a.iniciar), true);
  assert.equal(a.programar(a.iniciar), true);
  await Promise.all(a.registradas);
  assert.equal(a.cuantas(), 2);
});

test("CONTROL (el defecto de §32.10): una interfaz que recibe la promesa ya iniciada compone aunque el registro falle", async () => {
  // Modelo del diseño descartado: `enFondo(tarea)` con la tarea creada ANTES de registrar.
  let iniciadas = 0;
  const enFondoViejo = (tarea: Promise<void>) => { void tarea; throw new Error("waitUntil no disponible"); };
  const tarea = (async () => { iniciadas++; })();
  assert.throws(() => enFondoViejo(tarea));
  await tarea;
  assert.equal(iniciadas, 1, "el modelo viejo deja una composición huérfana aunque el registro haya fallado");
});
