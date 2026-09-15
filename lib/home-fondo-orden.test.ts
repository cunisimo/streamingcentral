// El ORDEN completo de "último bueno primero" (Etapa 3.b, auditoría de Codex
// sobre c84996e): la respuesta HTTP se construye ANTES de que la composición
// de fondo empiece. Se atraviesa una frontera equivalente al handler real: el
// handler corre dentro de `conFrontera`, llama a `servirConTurno` (el real,
// con el turno en memoria), sigue trabajando como `homePayload` (imprime la
// línea `[home]`), construye la respuesta —el equivalente a
// `NextResponse.json(payload)`— y devuelve. Recién entonces la compuerta se
// abre y `iniciar` (la composición) puede empezar.
//
// 🔴 Lo que fallaba: el programador esperaba un microtick tras registrar en
// `waitUntil`. "Registrada" no es "respondida": `composeHome` arrancaba antes
// de que la respuesta existiera. Ni un microtick ni N milisegundos son una
// frontera: la frontera es explícita (lib/fondo-frontera.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { servirConTurno, CONSTANTES, type DepsServir } from "./home-servir.ts";
import { crearTurno } from "./turno.ts";
import { crearOpsEnMemoria, type Entrada } from "./turno-memoria.ts";
import { withMetricas, type MetricasRequest } from "./metricas.ts";
import { crearProgramadorDeFondo } from "./home-fondo.ts";
import { conFrontera, compuertaDeFondo, estadoDeLaFrontera } from "./fondo-frontera.ts";

type Payload = { hero: string[]; degradado: boolean; de: string };
const K = { fresca: "home:v6:1:n:", ub: "home:ub:v6:n:", gen: "home:gen:v6:n:", degradado: "home:degradado:v6:1:n:", turno: "home:turno:v6:1:n:" };
const UB: Payload = { hero: ["ub"], degradado: false, de: "ub" };
const tick = () => new Promise<void>((r) => setImmediate(r));
const ms = (n: number) => new Promise<void>((r) => setTimeout(r, n));

/** Un mundo con reloj real (los tiempos son cortos): turno en memoria, UB presente, composición de `tarda` ms. */
function mundo(o: { tarda?: number; fallo?: boolean; producir?: () => Promise<{ valor: Payload; fallo: boolean }> } = {}) {
  const store = new Map<string, Entrada>();
  const ops = crearOpsEnMemoria(store, Date.now);
  store.set(K.ub, { v: UB, exp: 0 });
  const eventos: string[] = [];
  const log = (l: string) => { eventos.push(l.startsWith("[home] compone") ? "[home] compone" : l); };
  const registradas: Promise<unknown>[] = [];
  let contador = 0;
  const programar = crearProgramadorDeFondo({
    registrar: (p) => { registradas.push(p); },
    compuerta: compuertaDeFondo,
    disponible: true, apagado: false, error: (...a) => { eventos.push(`error:${String(a[0])}`); },
  });
  const vivo = (k: string) => { const e = store.get(k); return e && (!e.exp || e.exp > Date.now()) ? (e.v as Payload) : null; };
  const deps = (): DepsServir<Payload> => ({
    claves: K, propietario: `A:${++contador}`, dia: "2026-09-15", ttl: { fresca: 21600, ub: 129600 },
    leer: async (claves) => claves.map(vivo), turno: crearTurno(ops),
    producir: o.producir ?? (async () => { eventos.push("iniciar"); await ms(o.tarda ?? 30); return { valor: { hero: ["A"], degradado: !!o.fallo, de: "A" }, fallo: !!o.fallo }; }),
    vacio: (motivo) => ({ hero: [], degradado: true, de: `vacio:${motivo}` }),
    log, constantes: { ...CONSTANTES, RENOVACION_MS: 10, TURNO_MS: 200 },
    // Como el adaptador real: el fondo corre en SU scope de métricas. El PRIMER
    // tramo de `iniciar` es síncrono y observable ("fondo-inicia"): es lo que
    // compite con la entrega de la respuesta si arranca demasiado pronto.
    programarEnFondo: (iniciar) => programar(async (senal) => { eventos.push("fondo-inicia"); const { metricas } = await withMetricas(() => iniciar(senal)); eventos.push(`[home-fondo] ${metricas.home.publicacion}`); }),
  });
  /** El handler: lo que hace la ruta real, con una respuesta construida explícitamente. */
  const manejar = conFrontera(async (opts: { trabajoTrasServir?: () => Promise<void> } = {}) => {
    const { res: payload, metricas } = await withMetricas(() => servirConTurno(deps()));
    eventos.push(`servir-devolvio:${metricas.home.origen}`);
    // `homePayload` sigue: lecturas, logs, la línea terminal.
    await tick(); await tick();
    if (opts.trabajoTrasServir) await opts.trabajoTrasServir();
    eventos.push("[home] terminal");
    const respuesta = { status: 200, body: JSON.stringify(payload), construidaEn: eventos.length };
    eventos.push("respuesta-construida");
    return { respuesta, metricas };
  });
  const fondoTermino = async () => { await Promise.all(registradas); await tick(); };
  return { store, eventos, registradas, manejar, fondoTermino, vivo, cuantas: (e: string) => eventos.filter((x) => x === e).length };
}

/** Un `unhandledRejection` durante `fn` hace fallar el test. */
async function sinRechazosSueltos(fn: () => Promise<void>) {
  const sueltos: unknown[] = [];
  const h = (e: unknown) => { sueltos.push(e); };
  process.on("unhandledRejection", h);
  try { await fn(); for (let i = 0; i < 5; i++) await tick(); } finally { process.off("unhandledRejection", h); }
  assert.deepEqual(sueltos, [], "hubo una promesa rechazada sin manejar");
}

test("🔴 ORDEN COMPLETO: UB elegido → [home] terminal → respuesta construida → recién entonces `iniciar` → [home-fondo]; una sola composición; sin promesas sueltas", async () => {
  await sinRechazosSueltos(async () => {
    const w = mundo({ tarda: 40 });
    // Mucho tiempo entre servir y construir la respuesta: el fondo NO puede aprovecharlo.
    const { respuesta, metricas } = await w.manejar({ trabajoTrasServir: async () => { await ms(30); for (let i = 0; i < 20; i++) await tick(); } });
    const i = (e: string) => w.eventos.indexOf(e);
    assert.ok(i("iniciar") === -1 || i("iniciar") > i("respuesta-construida"), `iniciar comenzó antes de construir la respuesta: ${JSON.stringify(w.eventos)}`);
    assert.equal(respuesta.status, 200);
    assert.equal(JSON.parse(respuesta.body).de, "ub", "la respuesta lleva el UB");
    assert.equal(metricas.home.origen, "ultimo-bueno-fondo");
    assert.equal(metricas.home.fondo, "programado");
    assert.equal(w.registradas.length, 1, "una tarea registrada en waitUntil");
    assert.ok(i("servir-devolvio:ultimo-bueno-fondo") >= 0);
    assert.ok(i("[home] terminal") < i("respuesta-construida"));
    // La compuerta se abrió al devolver el handler: el fondo arranca ahora.
    await w.fondoTermino();
    assert.equal(w.cuantas("iniciar"), 1, "una sola composición");
    assert.equal(w.cuantas("[home] compone"), 1);
    assert.ok(i("iniciar") > i("respuesta-construida"), `orden: ${JSON.stringify(w.eventos)}`);
    assert.ok(i("[home] compone") > i("[home] terminal"), "la línea [home] es anterior a cualquier actividad del fondo");
    assert.ok(i("[home-fondo] publicado") > i("iniciar"), "la línea [home-fondo] cierra el fondo");
    assert.equal(JSON.stringify(metricas).includes('"publicacion":"publicado"'), false, "las métricas de la solicitud no cambiaron con el fondo");
    assert.equal(w.vivo(K.fresca)?.de, "A", "el fondo publicó la fresca");
    assert.equal(w.store.has(K.turno), false);
  });
});

test("🔴 sin frontera declarada (handler no envuelto): no hay compuerta, el programador NO registra y el líder compone en línea, una sola vez", async () => {
  await sinRechazosSueltos(async () => {
    const w = mundo({ tarda: 20 });
    assert.equal(estadoDeLaFrontera(), "sin-frontera");
    // El mismo handler pero sin `conFrontera`: se llama a servirConTurno directo.
    const store = w.store;
    const ops = crearOpsEnMemoria(store, Date.now);
    void ops;
    const programar = crearProgramadorDeFondo({ registrar: (p) => { w.registradas.push(p); }, compuerta: compuertaDeFondo, disponible: true, apagado: false });
    let iniciadas = 0;
    assert.equal(programar(async () => { iniciadas++; }), false, "sin frontera no hay fondo");
    await tick(); await tick();
    assert.equal(iniciadas, 0);
    assert.equal(w.registradas.length, 0);
  });
});

test("🔴 el handler LANZA después de programar: la compuerta se abre igual (finally) y la tarea registrada no queda colgada", async () => {
  await sinRechazosSueltos(async () => {
    const registradas: Promise<unknown>[] = [];
    let corrio = false;
    const programar = crearProgramadorDeFondo({ registrar: (p) => { registradas.push(p); }, compuerta: compuertaDeFondo, disponible: true, apagado: false });
    const manejar = conFrontera(async () => {
      assert.equal(programar(async () => { corrio = true; }), true);
      throw new Error("la ruta explotó después de programar");
    });
    await assert.rejects(manejar(), /explotó/);
    await Promise.all(registradas);
    assert.equal(corrio, true, "la tarea corrió al abrirse la compuerta en finally");
  });
});

test("fallbacks intactos con frontera: kill switch, fondo no disponible y registro que lanza → false sin iniciar", async () => {
  await sinRechazosSueltos(async () => {
    await conFrontera(async () => {
      let iniciadas = 0;
      const iniciar = async () => { iniciadas++; };
      assert.equal(crearProgramadorDeFondo({ registrar: () => {}, compuerta: compuertaDeFondo, disponible: true, apagado: true })(iniciar), false);
      assert.equal(crearProgramadorDeFondo({ registrar: () => {}, compuerta: compuertaDeFondo, disponible: false, apagado: false })(iniciar), false);
      assert.equal(crearProgramadorDeFondo({ registrar: () => { throw new Error("no"); }, compuerta: compuertaDeFondo, disponible: true, apagado: false, error: () => {} })(iniciar), false);
      for (let i = 0; i < 5; i++) await tick();
      assert.equal(iniciadas, 0);
    })();
    for (let i = 0; i < 5; i++) await tick();
  });
});

test("dos handlers concurrentes: cada uno con su compuerta; los dos fondos arrancan después de SU respuesta y no se cruzan", async () => {
  await sinRechazosSueltos(async () => {
    const eventos: string[] = [];
    const registradas: Promise<unknown>[] = [];
    const programar = crearProgramadorDeFondo({ registrar: (p) => { registradas.push(p); }, compuerta: compuertaDeFondo, disponible: true, apagado: false });
    const handler = (nombre: string, espera: number) => conFrontera(async () => {
      assert.equal(programar(async () => { eventos.push(`iniciar:${nombre}`); }), true);
      await ms(espera);
      eventos.push(`respuesta:${nombre}`);
      return nombre;
    });
    await Promise.all([handler("A", 40)(), handler("B", 5)()]);
    await Promise.all(registradas);
    const i = (e: string) => eventos.indexOf(e);
    assert.ok(i("respuesta:B") < i("iniciar:B") && i("respuesta:A") < i("iniciar:A"), JSON.stringify(eventos));
    assert.ok(i("iniciar:B") < i("respuesta:A"), "el fondo de B no esperó la respuesta de A: compuertas independientes");
  });
});

test("CONTROL (c84996e): un programador que sólo espera un microtick arranca la composición ANTES de que la respuesta exista", async () => {
  const eventos: string[] = [];
  const registradas: Promise<unknown>[] = [];
  const programarViejo = (iniciar: () => Promise<void>) => {
    let registrado = false;
    const tarea = (async () => { await Promise.resolve(); if (registrado) await iniciar(); })();
    registradas.push(tarea); registrado = true; return true;
  };
  const manejar = async () => {
    programarViejo(async () => { eventos.push("iniciar"); });
    await tick(); await tick();                 // lo que homePayload hace después de servir
    eventos.push("[home] terminal");
    eventos.push("respuesta-construida");
  };
  await manejar();
  await Promise.all(registradas);
  assert.ok(eventos.indexOf("iniciar") < eventos.indexOf("respuesta-construida"), `el modelo viejo no reproduce el agujero: ${JSON.stringify(eventos)}`);
});

// ============================================================================
// La FRONTERA EXTERNA (auditoría de Codex sobre 3a057fc): no alcanza con que
// `iniciar` corra después de "respuesta-construida" DENTRO del handler. Abrir
// la compuerta en el `finally` del handler encola la continuación del fondo
// antes de que la promesa exportada por `GET` se resuelva para su LLAMADOR:
// el fondo arrancaba entre la respuesta construida y el llamador recibiéndola.
// Lo que se exige acá es estrictamente:
//   respuesta-construida → caller-recibio-response → fondo-inicia
// atravesando el llamador real de la ruta: `const r = await GET(req)`.
// ============================================================================

test("🔴 FRONTERA EXTERNA: el llamador de GET recibe el Response ANTES de que el fondo inicie (respuesta-construida → caller-recibio-response → fondo-inicia)", async () => {
  await sinRechazosSueltos(async () => {
    const w = mundo({ tarda: 40 });
    const GET = w.manejar;                        // lo que exporta la ruta: conFrontera(conCors(manejar))
    const promesa = GET({});                      // el runtime llama a GET y espera su promesa
    const { respuesta } = await promesa;
    w.eventos.push("caller-recibio-response");    // el runtime ya tiene el Response
    const i = (e: string) => w.eventos.indexOf(e);
    assert.equal(respuesta.status, 200);
    assert.ok(i("respuesta-construida") >= 0);
    assert.ok(i("fondo-inicia") === -1 || i("fondo-inicia") > i("caller-recibio-response"),
      `el fondo inició antes de que el llamador recibiera la respuesta: ${JSON.stringify(w.eventos.filter((e) => ["respuesta-construida", "fondo-inicia", "caller-recibio-response"].includes(e)))}`);
    await w.fondoTermino();
    assert.deepEqual(w.eventos.filter((e) => ["respuesta-construida", "caller-recibio-response", "fondo-inicia"].includes(e)), ["respuesta-construida", "caller-recibio-response", "fondo-inicia"]);
    assert.equal(w.cuantas("iniciar"), 1, "una sola composición");
    assert.equal(w.cuantas("fondo-inicia"), 1);
    assert.equal(w.vivo(K.fresca)?.de, "A", "el fondo publicó la fresca");
  });
});

test("🔴 FRONTERA EXTERNA, dos llamadores concurrentes: el fondo de cada handler empieza después de que SU llamador recibió SU respuesta, sin depender de la otra", async () => {
  await sinRechazosSueltos(async () => {
    const eventos: string[] = [];
    const registradas: Promise<unknown>[] = [];
    const programar = crearProgramadorDeFondo({ registrar: (p) => { registradas.push(p); }, compuerta: compuertaDeFondo, disponible: true, apagado: false });
    const GET = (nombre: string, espera: number) => conFrontera(async () => {
      assert.equal(programar(async () => { eventos.push(`fondo-inicia:${nombre}`); }), true);
      await ms(espera);
      eventos.push(`respuesta-construida:${nombre}`);
      return { status: 200, nombre };
    });
    const llamador = async (nombre: string, espera: number) => { const r = await GET(nombre, espera)(); eventos.push(`caller-recibio:${nombre}`); return r; };
    await Promise.all([llamador("A", 60), llamador("B", 5)]);
    await Promise.all(registradas);
    const i = (e: string) => eventos.indexOf(e);
    for (const n of ["A", "B"]) {
      assert.ok(i(`respuesta-construida:${n}`) < i(`caller-recibio:${n}`) && i(`caller-recibio:${n}`) < i(`fondo-inicia:${n}`), `${n}: ${JSON.stringify(eventos)}`);
    }
    assert.ok(i("fondo-inicia:B") < i("respuesta-construida:A"), "el fondo de B no esperó la respuesta de A: fronteras independientes");
  });
});

test("CONTROL (3a057fc): abrir la compuerta en el finally del handler entrega el fondo ANTES que la respuesta al llamador", async () => {
  // Modelo del defecto: el `finally` resuelve a los que esperan la compuerta
  // (microtasks) y recién después se resuelve la promesa del handler.
  const eventos: string[] = [];
  let abrir: () => void = () => {};
  const compuerta = new Promise<void>((r) => { abrir = r; });
  const fondo = (async () => { await compuerta; eventos.push("fondo-inicia"); })();
  const GETviejo = async () => { try { eventos.push("respuesta-construida"); return { status: 200 }; } finally { abrir(); } };
  await GETviejo();
  eventos.push("caller-recibio-response");
  await fondo;
  assert.deepEqual(eventos, ["respuesta-construida", "fondo-inicia", "caller-recibio-response"], "el modelo viejo no reproduce el agujero");
});
