// Etapa 2 de capacidad (#17): la SECUENCIA del Home con turno distribuido y
// último bueno (informe docs/medidas/2026-09-13-etapa2-diseno-turno-ultimo-bueno.md §5.1).
//
// ============================================================================
// CÓMO SE PRUEBA
// ============================================================================
// `servirConTurno` es puro: recibe las claves, las lecturas, el turno (sobre
// las seis primitivas de lib/turno.ts), el productor, el reloj y `dormir`. Acá
// el backend es la emulación en memoria (lib/turno-memoria.ts, la misma que usa
// producción sin Redis), compartida entre "solicitudes" que hacen de instancias
// distintas, y el reloj es VIRTUAL: `dormir` no espera de verdad, registra a
// quién despertar y un planificador avanza el tiempo al próximo despertar. Así
// vencimientos, renovaciones y esperas son deterministas, sin timers reales.
//
// Las métricas son las reales (lib/metricas.ts): cada solicitud abre su scope.
// Escrito ANTES del módulo: fallaba al importar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { servirConTurno, dormirCancelable, CONSTANTES, type Constantes, type DepsServir } from "./home-servir.ts";
import { crearTurno, type OpsTurno } from "./turno.ts";
import { crearOpsEnMemoria, type Entrada } from "./turno-memoria.ts";
import { crearVueloHome } from "./home-vuelo.ts";
import { withMetricas, anotar, type MetricasRequest } from "./metricas.ts";

type Payload = { hero: string[]; degradado: boolean; de: string };
const K = { fresca: "home:v6:1:n:", ub: "home:ub:v6:n:", gen: "home:gen:v6:n:", degradado: "home:degradado:v6:1:n:", turno: "home:turno:v6:1:n:" };
const tick = () => new Promise<void>((r) => setImmediate(r));

// ----------------------------------------------------------------- el reloj virtual
function relojVirtual(inicio = 1_000_000) {
  let t = inicio;
  const durmiendo: { en: number; r: () => void }[] = [];
  const ahora = () => t;
  // Como `dormirCancelable` de producción: una señal abortada despierta en el
  // acto y saca al durmiente de la lista (ningún temporizador queda vivo).
  const dormir = (ms: number, senal?: AbortSignal) => new Promise<void>((r) => {
    if (senal?.aborted) { r(); return; }
    const d = { en: t + ms, r };
    durmiendo.push(d);
    senal?.addEventListener("abort", () => { const i = durmiendo.indexOf(d); if (i >= 0) { durmiendo.splice(i, 1); r(); } }, { once: true });
  });
  /** Corre `p` avanzando el tiempo al próximo despertar cada vez que nadie tiene nada que hacer. */
  async function correr<T>(p: Promise<T>): Promise<T> {
    let listo = false;
    p.then(() => { listo = true; }, () => { listo = true; });
    let vacias = 0;
    while (!listo) {
      await tick();
      if (listo) break;
      if (!durmiendo.length) {
        if (++vacias > 50) throw new Error(`reloj: nadie duerme y la promesa no termina (t=${t})`);
        continue;
      }
      vacias = 0;
      durmiendo.sort((a, b) => a.en - b.en);
      const s = durmiendo.shift()!;
      t = Math.max(t, s.en);
      s.r();
    }
    return p;
  }
  return { ahora, dormir, correr, avanzar: (ms: number) => { t += ms; }, get t() { return t; }, get durmiendo() { return durmiendo.length; } };
}

// ----------------------------------------------------------------- el mundo: un backend compartido y N solicitudes
function mundo(opts: { constantes?: Partial<Constantes>; inicio?: number } = {}) {
  const store = new Map<string, Entrada>();
  const reloj = relojVirtual(opts.inicio);
  const opsBase = crearOpsEnMemoria(store, reloj.ahora);
  const lecturas: string[][] = [];
  const log: string[] = [];
  const vivo = (k: string) => { const e = store.get(k); return e && (!e.exp || e.exp > reloj.ahora()) ? (e.v as Payload) : null; };
  const leer = async (claves: string[]) => { lecturas.push([...claves]); return claves.map(vivo); };
  const constantes: Constantes = { ...CONSTANTES, ...opts.constantes };

  function deps(nombre: string, extra: Partial<DepsServir<Payload>> & { ops?: OpsTurno; payload?: Payload; fallo?: boolean; tarda?: number } = {}): DepsServir<Payload> {
    const ops = extra.ops ?? opsBase;
    const payload: Payload = extra.payload ?? { hero: [`de-${nombre}`], degradado: !!extra.fallo, de: nombre };
    return {
      claves: K, propietario: nombre, dia: "2026-09-13", ttl: { fresca: 21600, ub: 129600 },
      leer, turno: crearTurno(ops),
      producir: async () => { if (extra.tarda) await reloj.dormir(extra.tarda); return { valor: payload, fallo: !!extra.fallo }; },
      vacio: (motivo) => ({ hero: [], degradado: true, de: `vacio:${motivo}` }),
      ahora: reloj.ahora, dormir: reloj.dormir, constantes, log: (l) => log.push(l),
      ...extra,
    };
  }
  /** Una solicitud = un scope de métricas. Devuelve lo servido y sus métricas. */
  const solicitud = async (d: DepsServir<Payload>) => {
    const { res, metricas } = await withMetricas(() => servirConTurno(d));
    return { valor: res, m: metricas };
  };
  const cuantasComposiciones = () => log.filter((l) => l.startsWith("[home] compone ")).length;
  return { store, reloj, ops: opsBase, leer, lecturas, log, deps, solicitud, vivo, cuantasComposiciones };
}

// ============================================================================
// 1. Lecturas escalonadas y el camino caliente
// ============================================================================
test("HIT: sólo se lee la fresca, no se toca el turno ni se leen ub/degradado", async () => {
  const w = mundo();
  w.store.set(K.fresca, { v: { hero: ["x"], degradado: false, de: "otro" }, exp: 0 });
  const { valor, m } = await w.reloj.correr(w.solicitud(w.deps("A")));
  assert.equal(valor.de, "otro");
  assert.equal(m.home.cache, "hit");
  assert.equal(m.home.origen, "fresca");
  assert.equal(m.home.turno, null, "un HIT no pasa por el turno");
  assert.deepEqual(w.lecturas, [[K.fresca]], "una sola lectura, de una sola copia");
  assert.equal(w.store.has(K.turno), false);
});

test("MISS frío: [ub, degradado] se leen sólo en el MISS; tras adquirir se relee sólo la fresca; se compone y PUBLICA", async () => {
  const w = mundo();
  const { valor, m } = await w.reloj.correr(w.solicitud(w.deps("A")));
  assert.equal(valor.de, "A");
  assert.deepEqual(w.lecturas, [[K.fresca], [K.ub, K.degradado], [K.fresca]]);
  assert.equal(m.home.cache, "miss");
  assert.equal(m.home.turno, "adquirido");
  assert.equal(m.home.origen, "propia");
  assert.equal(m.home.publicacion, "publicado");
  assert.equal(m.home.propietario, "A");
  assert.deepEqual(w.vivo(K.fresca), valor);
  assert.deepEqual(w.vivo(K.ub), valor);
  assert.equal(w.store.get(K.gen)?.v, "2026-09-13:A");
  assert.equal(w.store.has(K.turno), false, "PUBLICAR borra el turno");
  assert.equal(w.cuantasComposiciones(), 1);
  assert.match(w.log[0], /^\[home\] compone home:v6:1:n: A$/);
});

// ============================================================================
// 2. La carrera lectura → turno (corrección del 13/09)
// ============================================================================
test("🔴 lectura → turno: B publica entre la lectura inicial de A y su SET NX → A NO compone, libera y sirve la fresca (fresca-tras-turno)", async () => {
  const w = mundo();
  let producciones = 0;
  // La lectura de [ub, degradado] de A (su segundo paso, ANTES del SET NX) es
  // el punto en el que se intercala la publicación entera de B.
  const leerConB = async (claves: string[]) => {
    const r = await w.leer(claves);
    if (claves[0] === K.ub) await w.reloj.correr(w.solicitud(w.deps("B")));
    return r;
  };
  const dA = w.deps("A", { leer: leerConB, producir: async () => { producciones++; return { valor: { hero: ["A"], degradado: false, de: "A" }, fallo: false }; } });
  const { valor, m } = await w.reloj.correr(w.solicitud(dA));
  assert.equal(valor.de, "B", "A sirve la fresca que publicó B");
  assert.equal(producciones, 0, "A no compuso");
  assert.equal(m.home.turno, "adquirido", "A sí obtuvo el turno (B ya lo había liberado al publicar)");
  assert.equal(m.home.origen, "fresca-tras-turno");
  assert.equal(m.home.cache, "hit");
  assert.equal(m.home.publicacion, null, "A no publicó");
  assert.equal(m.home.composiciones, 0);
  assert.equal(w.store.has(K.turno), false, "A liberó el turno con LIBERAR");
  assert.equal(w.store.get(K.gen)?.v, "2026-09-13:B", "una sola publicación total: la de B");
  assert.equal(w.cuantasComposiciones(), 1, "una sola composición total: la de B");
});

test("🔴 lectura → turno con adquisición RECONCILIADA (SET ejecutó, respuesta perdida): la segunda lectura igual ocurre", async () => {
  const w = mundo();
  let producciones = 0;
  // El SET NX de A ejecuta y luego "se pierde": lanza después de escribir.
  const opsA: OpsTurno = { ...w.ops, setNx: async (k, v, px) => { await w.ops.setNx(k, v, px); throw new Error("respuesta perdida"); } };
  const leerConB = async (claves: string[]) => {
    const r = await w.leer(claves);
    if (claves[0] === K.ub) await w.reloj.correr(w.solicitud(w.deps("B")));
    return r;
  };
  const dA = w.deps("A", { ops: opsA, leer: leerConB, producir: async () => { producciones++; return { valor: { hero: ["A"], degradado: false, de: "A" }, fallo: false }; } });
  const { valor, m } = await w.reloj.correr(w.solicitud(dA));
  assert.equal(m.home.turno, "reconciliado");
  assert.equal(valor.de, "B");
  assert.equal(producciones, 0);
  assert.equal(m.home.origen, "fresca-tras-turno");
  assert.equal(w.store.has(K.turno), false);
  assert.equal(w.cuantasComposiciones(), 1);
});

test("CONTROL lectura → turno: sin la publicación intercalada, A compone", async () => {
  const w = mundo();
  let producciones = 0;
  const dA = w.deps("A", { producir: async () => { producciones++; return { valor: { hero: ["A"], degradado: false, de: "A" }, fallo: false }; } });
  const { m } = await w.reloj.correr(w.solicitud(dA));
  assert.equal(producciones, 1);
  assert.equal(m.home.origen, "propia");
  assert.deepEqual(w.lecturas, [[K.fresca], [K.ub, K.degradado], [K.fresca]]);
});

// ============================================================================
// 3. Ocupado: último bueno, espera, rescate
// ============================================================================
test("ocupado + UB: se sirve el UB en el acto, sin componer ni esperar", async () => {
  const w = mundo();
  await w.ops.setNx(K.turno, "B", 15000);
  w.store.set(K.ub, { v: { hero: ["ub"], degradado: false, de: "ub" }, exp: 0 });
  let producciones = 0;
  const { valor, m } = await w.reloj.correr(w.solicitud(w.deps("A", { producir: async () => { producciones++; return { valor: { hero: [], degradado: false, de: "A" }, fallo: false }; } })));
  assert.equal(valor.de, "ub");
  assert.equal(producciones, 0);
  assert.equal(m.home.cache, "ultimo-bueno");
  assert.equal(m.home.origen, "ultimo-bueno");
  assert.equal(m.home.turno, "ocupado");
  assert.equal(m.home.esperaMs, 0);
  assert.deepEqual(w.lecturas, [[K.fresca], [K.ub, K.degradado]]);
});

test("ocupado sin UB: espera reintentando; cuando el propietario publica, sirve `esperada` sin componer", async () => {
  const w = mundo();
  let producciones = 0;
  const propietario = w.solicitud(w.deps("A", { tarda: 2000 }));
  await tick();   // A ya tomó el turno y está componiendo
  const seguidor = w.solicitud(w.deps("B", { producir: async () => { producciones++; return { valor: { hero: [], degradado: false, de: "B" }, fallo: false }; } }));
  const [a, b] = await w.reloj.correr(Promise.all([propietario, seguidor]));
  assert.equal(a.m.home.origen, "propia");
  assert.equal(b.valor.de, "A");
  assert.equal(b.m.home.origen, "esperada");
  assert.equal(b.m.home.cache, "esperada");
  assert.ok(b.m.home.esperaMs >= 2000 && b.m.home.esperaMs <= 2000 + CONSTANTES.ESPERA_MS, `esperó ${b.m.home.esperaMs} ms`);
  assert.equal(producciones, 0);
  // En la espera se leen las TRES copias por vuelta.
  const enEspera = w.lecturas.filter((l) => l.length === 3);
  assert.ok(enEspera.length >= 1);
  for (const l of enEspera) assert.deepEqual(l, [K.fresca, K.ub, K.degradado]);
});

test("🔴 propietario muerto: de 3 seguidores esperando, EXACTAMENTE UNO toma el turno al vencer y compone; los otros sirven lo que publica", async () => {
  const w = mundo();
  await w.ops.setNx(K.turno, "muerto", 15000);   // tomó el turno y no renueva ni publica
  let producciones = 0;
  const seguidor = (n: string) => w.solicitud(w.deps(n, { producir: async () => { producciones++; await w.reloj.dormir(1000); return { valor: { hero: [], degradado: false, de: n }, fallo: false }; } }));
  const rs = await w.reloj.correr(Promise.all([seguidor("S1"), seguidor("S2"), seguidor("S3")]));
  assert.equal(producciones, 1, "un solo rescate");
  const rescatista = rs.filter((r) => r.m.home.origen === "propia");
  assert.equal(rescatista.length, 1);
  assert.equal(rescatista[0].m.home.publicacion, "publicado");
  for (const r of rs.filter((r) => r.m.home.origen !== "propia")) {
    assert.equal(r.m.home.origen, "esperada");
    assert.equal(r.valor.de, rescatista[0].m.home.propietario);
  }
  assert.equal(w.cuantasComposiciones(), 1, "cero líneas `compone` sin turno");
  assert.ok(rs.every((r) => r.m.home.esperaMs >= 15000), "nadie compuso antes de que venciera el turno del muerto");
});

test("espera agotada: propietario vivo que tarda más que el tope → vacío `espera-agotada`, sin componer y sin escribir", async () => {
  const w = mundo();
  await w.ops.setNx(K.turno, "lento", 15000);
  // El propietario sigue vivo: renueva por afuera cada 5 s.
  const renovador = (async () => { for (let i = 0; i < 10; i++) { await w.reloj.dormir(5000); await w.ops.evalRenovar(K.turno, "lento", 15000); } })();
  let producciones = 0;
  const b = w.solicitud(w.deps("B", { producir: async () => { producciones++; return { valor: { hero: [], degradado: false, de: "B" }, fallo: false }; } }));
  const r = await w.reloj.correr(b);
  await w.reloj.correr(renovador);
  assert.equal(r.valor.de, "vacio:espera-agotada");
  assert.equal(r.m.home.cache, "vacio");
  assert.equal(r.m.home.origen, "vacio-espera-agotada");
  assert.equal(producciones, 0);
  assert.ok(r.m.home.esperaMs >= CONSTANTES.TOPE_ESPERA_MS, `esperó ${r.m.home.esperaMs}`);
  assert.equal(w.store.has(K.fresca), false);
  assert.equal(w.store.has(K.ub), false);
});

// ============================================================================
// 4. Fencing: propietario perdido y medianoche
// ============================================================================
test("🔴 propietario perdido no modifica fresca ni UB: PUBLICAR rechazado, sirve lo suyo como propia-sin-publicar", async () => {
  const w = mundo();
  const a = w.solicitud(w.deps("A", { tarda: 40000 }));   // más que TURNO_MS sin que renueve... (renueva, pero el test le borra el turno)
  await tick();
  // A mitad, el turno de A "vence" (el doble lo borra) y B lo toma y publica.
  const intruso = (async () => { await w.reloj.dormir(7000); w.store.delete(K.turno); await w.reloj.correr(w.solicitud(w.deps("B"))); })();
  const ra = await w.reloj.correr(a);
  await w.reloj.correr(intruso);
  assert.equal(ra.m.home.publicacion, "rechazado");
  assert.equal(ra.m.home.origen, "propia-sin-publicar");
  assert.equal(ra.valor.de, "A", "a su propio usuario le sirve lo que compuso");
  assert.equal(w.vivo(K.fresca)?.de, "B", "la fresca sigue siendo la de B");
  assert.equal(w.vivo(K.ub)?.de, "B");
  assert.equal(w.store.get(K.gen)?.v, "2026-09-13:B");
  assert.equal(ra.m.home.turnoPerdido, true, "RENOVAR devolvió 0 y se siguió componiendo sin publicar");
});

test("🔴 propietario viejo que cruza la medianoche no pisa el UB nuevo: PUBLICAR devuelve -1, sólo su fresca", async () => {
  const w = mundo();
  // B ya publicó el UB del día siguiente.
  await w.reloj.correr(w.solicitud(w.deps("B", { dia: "2026-09-14" })));
  w.store.delete(K.fresca);   // la fresca de "hoy" (otra clave en la vida real) no está
  const ra = await w.reloj.correr(w.solicitud(w.deps("A", { dia: "2026-09-13" })));
  assert.equal(ra.m.home.publicacion, "publicada-solo-fresca");
  assert.equal(ra.m.home.origen, "propia");
  assert.equal(w.vivo(K.fresca)?.de, "A");
  assert.equal(w.vivo(K.ub)?.de, "B", "el UB del día nuevo queda intacto");
  assert.equal(w.store.get(K.gen)?.v, "2026-09-14:B");
});

// ============================================================================
// 5. Degradado: UB si hay, y el enfriamiento
// ============================================================================
test("degradado con UB → sirve el UB, no publica, ENFRÍA (turno enfriando:, degradado en su clave)", async () => {
  const w = mundo();
  w.store.set(K.ub, { v: { hero: ["ub"], degradado: false, de: "ub" }, exp: 0 });
  const r = await w.reloj.correr(w.solicitud(w.deps("A", { fallo: true })));
  assert.equal(r.valor.de, "ub");
  assert.equal(r.m.home.origen, "ultimo-bueno");
  assert.equal(r.m.home.degradadoDescartado, true);
  assert.equal(r.m.home.enfriado, true);
  assert.equal(r.m.home.publicacion, null);
  assert.equal(w.store.get(K.turno)?.v, "enfriando:A");
  assert.equal(w.vivo(K.degradado)?.de, "A");
  assert.equal(w.store.has(K.fresca), false, "nada en la fresca");
  assert.equal(w.vivo(K.ub)?.de, "ub", "el UB no se toca");
});

test("degradado sin UB → sirve el degradado propio; nunca va a la fresca ni al UB", async () => {
  const w = mundo();
  const r = await w.reloj.correr(w.solicitud(w.deps("A", { fallo: true })));
  assert.equal(r.valor.de, "A");
  assert.equal(r.m.home.origen, "degradado-propio");
  assert.equal(r.m.home.enfriado, true);
  assert.equal(w.store.has(K.fresca), false);
  assert.equal(w.store.has(K.ub), false);
  assert.equal(w.vivo(K.degradado)?.de, "A");
});

for (const conUb of [true, false]) {
  test(`🔴 enfriamiento: ráfaga ESCALONADA (1/s × 40 s, TMDB caído) ${conUb ? "CON" : "SIN"} UB → ≤ ⌈40/15⌉+1 composiciones, las demás ${conUb ? "UB" : "degradado compartido"}, ninguna espera`, async () => {
    const w = mundo();
    if (conUb) w.store.set(K.ub, { v: { hero: ["ub"], degradado: false, de: "ub" }, exp: 0 });
    let producciones = 0;
    const rs: Awaited<ReturnType<typeof w.solicitud>>[] = [];
    const rafaga = (async () => {
      for (let i = 0; i < 40; i++) {
        rs.push(await w.solicitud(w.deps(`R${i}`, { fallo: true, producir: async () => { producciones++; return { valor: { hero: [], degradado: true, de: `R${i}` }, fallo: true }; } })));
        await w.reloj.dormir(1000);
      }
    })();
    await w.reloj.correr(rafaga);
    const cota = Math.ceil(40_000 / CONSTANTES.ENFRIAMIENTO_MS) + 1;
    assert.ok(producciones <= cota, `${producciones} composiciones degradadas, cota ${cota}`);
    assert.ok(producciones >= 2, "al vencer el enfriamiento una vuelve a componer");
    for (const r of rs) {
      assert.equal(r.m.home.esperaMs, 0, "ninguna espera");
      if (r.m.home.origen === "degradado-propio" || r.m.home.degradadoDescartado) continue;
      assert.equal(r.m.home.origen, conUb ? "ultimo-bueno" : "degradado-compartido");
      // Sin UB se sirve el degradado del ÚLTIMO que enfrió antes de esta solicitud.
      const ultimoEnfriado = rs.slice(0, rs.indexOf(r)).reverse().find((x) => x.m.home.enfriado);
      assert.equal(r.valor.de, conUb ? "ub" : ultimoEnfriado?.m.home.propietario ?? "?");
    }
    assert.equal(w.store.has(K.fresca), false);
    if (!conUb) assert.equal(w.store.has(K.ub), false);
  });
}

// ============================================================================
// 6. Redis caído: componer sin coordinar y NO escribir
// ============================================================================
test("🔴 sin-redis: compone, sirve y no escribe; si Redis vuelve a mitad y B publica, lo de B queda", async () => {
  const w = mundo();
  const caido: OpsTurno = { ...w.ops, setNx: async () => { throw new Error("caído"); }, get: async () => { throw new Error("caído"); } };
  let enComposicion: () => void = () => {};
  const dA = w.deps("A", {
    ops: caido,
    producir: async () => { await new Promise<void>((r) => { enComposicion = r; }); return { valor: { hero: ["A"], degradado: false, de: "A" }, fallo: false }; },
  });
  const a = w.solicitud(dA);
  await tick(); await tick();
  // Redis vuelve; B toma el turno y publica.
  await w.reloj.correr(w.solicitud(w.deps("B")));
  enComposicion();
  const ra = await w.reloj.correr(a);
  assert.equal(ra.m.home.turno, "sin-redis");
  assert.equal(ra.m.home.origen, "sin-redis");
  assert.equal(ra.valor.de, "A", "sirve lo suyo");
  assert.equal(ra.m.home.publicacion, null, "no intentó publicar");
  assert.equal(w.vivo(K.fresca)?.de, "B");
  assert.equal(w.vivo(K.ub)?.de, "B");
  assert.equal(w.store.get(K.gen)?.v, "2026-09-13:B");
});

// ============================================================================
// 7. Cancelación
// ============================================================================
test("🔴 cancelación: al abortar la señal en plena composición → LIBERAR (no ENFRIAR, no PUBLICAR), sirve UB o vacío `cancelada`", async () => {
  for (const conUb of [true, false]) {
    const w = mundo();
    if (conUb) w.store.set(K.ub, { v: { hero: ["ub"], degradado: false, de: "ub" }, exp: 0 });
    const c = new AbortController();
    let terminar: () => void = () => {};
    const dA = w.deps("A", {
      senal: c.signal,
      // Como TMDB con la señal: la composición termina degradada apenas se aborta.
      producir: async () => { await new Promise<void>((r) => { terminar = r; }); return { valor: { hero: [], degradado: true, de: "A-cortada" }, fallo: true }; },
    });
    const a = w.solicitud(dA);
    await tick(); await tick();
    assert.equal(w.store.get(K.turno)?.v, "A");
    c.abort(new Error("presupuesto"));
    terminar();
    const r = await w.reloj.correr(a);
    assert.equal(r.m.home.cancelada, true);
    assert.equal(r.m.home.enfriado, false);
    assert.equal(r.m.home.publicacion, null);
    assert.equal(w.store.has(K.turno), false, "liberado");
    assert.equal(w.store.has(K.degradado), false, "no enfrió");
    assert.equal(w.store.has(K.fresca), false);
    assert.equal(r.valor.de, conUb ? "ub" : "vacio:cancelada");
    assert.equal(r.m.home.origen, conUb ? "ultimo-bueno" : "vacio-cancelada");
  }
});

test("cancelación en la espera: la señal corta el bucle; vacío `cancelada` sin componer", async () => {
  const w = mundo();
  await w.ops.setNx(K.turno, "otro", 15000);
  const c = new AbortController();
  let producciones = 0;
  const b = w.solicitud(w.deps("B", { senal: c.signal, producir: async () => { producciones++; return { valor: { hero: [], degradado: false, de: "B" }, fallo: false }; } }));
  const abortador = (async () => { await w.reloj.dormir(1200); c.abort(); })();
  const r = await w.reloj.correr(b);
  await w.reloj.correr(abortador);
  assert.equal(r.valor.de, "vacio:cancelada");
  assert.equal(producciones, 0);
  assert.ok(r.m.home.esperaMs < CONSTANTES.TOPE_ESPERA_MS);
});

test("🔴 líder del single-flight local cancelado con seguidores en vuelo: todos reciben lo mismo, UNA composición, y el turno queda libre", async () => {
  for (const conUb of [true, false]) {
    const w = mundo();
    if (conUb) w.store.set(K.ub, { v: { hero: ["ub"], degradado: false, de: "ub" }, exp: 0 });
    const c = new AbortController();
    let producciones = 0;
    let terminar: () => void = () => {};
    const senales = new Map<string, AbortSignal>();
    const vuelo = crearVueloHome<Payload, string>({
      leer: async (clave) => (await w.leer([clave]))[0],
      resolver: (_clave, producir) => {
        const quien = [...senales.keys()].pop()!;   // el que llegó primero al vuelo es el líder
        return servirConTurno(w.deps(quien, { senal: senales.get(quien), producir: async () => ({ valor: await producir(), fallo: true }) }));
      },
    });
    const producirLider = async () => { producciones++; await new Promise<void>((r) => { terminar = r; }); return { hero: [], degradado: true, de: "cortada" }; };
    const producirSeguidor = async () => { producciones++; return { hero: [], degradado: false, de: "seguidor" }; };
    senales.set("L", c.signal);
    const lider = withMetricas(() => vuelo(K.fresca, producirLider));
    await tick(); await tick();
    const seguidores = ["S1", "S2", "S3"].map((n) => withMetricas(() => vuelo(K.fresca, producirSeguidor)));
    await tick();
    c.abort();
    terminar();
    const [rl, ...rs] = await w.reloj.correr(Promise.all([lider, ...seguidores]));
    assert.equal(producciones, 1, "cero composiciones duplicadas");
    assert.equal(rl.metricas.home.cancelada, true);
    for (const r of rs) {
      assert.deepEqual(r.res, rl.res, "el mismo resultado compartido");
      assert.equal(r.metricas.home.cache, "compartida");
      assert.equal(r.metricas.home.esperasCompartidas, 1);
    }
    assert.equal(rl.res.de, conUb ? "ub" : "vacio:cancelada");
    // Una solicitud POSTERIOR adquiere el turno.
    assert.equal(await w.ops.setNx(K.turno, "posterior", 1000), "OK");
  }
});

test("CONTROL: la señal de un SEGUIDOR abortada no cancela el vuelo: el líder sigue y publica", async () => {
  const w = mundo();
  const cSeguidor = new AbortController();
  let terminar: () => void = () => {};
  const vuelo = crearVueloHome<Payload, string>({
    leer: async (clave) => (await w.leer([clave]))[0],
    resolver: (_clave, producir) => servirConTurno(w.deps("L", { producir: async () => ({ valor: await producir(), fallo: false }) })),
  });
  const lider = withMetricas(() => vuelo(K.fresca, async () => { await new Promise<void>((r) => { terminar = r; }); return { hero: ["L"], degradado: false, de: "L" }; }));
  await tick(); await tick();
  const seguidor = withMetricas(() => vuelo(K.fresca, async () => ({ hero: [], degradado: false, de: "S" })));
  await tick();
  cSeguidor.abort();
  terminar();
  const [rl, rs] = await w.reloj.correr(Promise.all([lider, seguidor]));
  assert.equal(rl.metricas.home.publicacion, "publicado");
  assert.equal(rs.res.de, "L");
  assert.equal(w.vivo(K.fresca)?.de, "L");
});

// ============================================================================
// 8. El deadline: la desigualdad de constantes y la promesa reducida
// ============================================================================
test("🔴 la desigualdad del presupuesto se cumple con las constantes del módulo", () => {
  const c = CONSTANTES;
  assert.equal(c.PRESUPUESTO_REQUEST_MS, 60_000 - c.MARGEN_MS);
  assert.ok(c.TOPE_ESPERA_MS + c.COMPOSICION_MAX_MS + c.PUBLICACION_MAX_MS <= c.PRESUPUESTO_REQUEST_MS,
    `espera ${c.TOPE_ESPERA_MS} + composición ${c.COMPOSICION_MAX_MS} + publicación ${c.PUBLICACION_MAX_MS} > presupuesto ${c.PRESUPUESTO_REQUEST_MS}`);
  assert.ok(c.RENOVACION_MS * 3 <= c.TURNO_MS, "dos renovaciones perdidas seguidas tienen que dejar margen");
  assert.equal(c.ENFRIAMIENTO_MS, c.TURNO_MS, "valor inicial del enfriamiento: el del turno (a medir)");
});

test("rescatista tardío: si el presupuesto restante no alcanza para componer, libera y responde vacío en vez de arrancar algo que muere en 504", async () => {
  const w = mundo({ constantes: { TOPE_ESPERA_MS: 45000, COMPOSICION_MAX_MS: 16000, PRESUPUESTO_REQUEST_MS: 50000 } });
  await w.ops.setNx(K.turno, "muerto", 40000);
  let producciones = 0;
  const r = await w.reloj.correr(w.solicitud(w.deps("B", { producir: async () => { producciones++; return { valor: { hero: [], degradado: false, de: "B" }, fallo: false }; } })));
  assert.equal(producciones, 0);
  assert.equal(r.valor.de, "vacio:espera-agotada");
  assert.equal(w.store.has(K.turno), false, "liberó el turno que acababa de tomar");
});

test("🔴 PROMESA REDUCIDA (control): con un Redis que nunca responde, la secuencia NO termina dentro del presupuesto", async () => {
  // Esto fija lo que la Etapa 2 NO promete (§3.8): el SDK reintenta y nada lo
  // cancela por solicitud. Si algún día esto pasara a terminar, hay que
  // revisar el informe antes de celebrarlo.
  const w = mundo();
  const colgado: OpsTurno = { ...w.ops, setNx: () => new Promise(() => {}), get: () => new Promise(() => {}) };
  const c = new AbortController();
  let termino = false;
  w.solicitud(w.deps("A", { ops: colgado, senal: c.signal })).then(() => { termino = true; });
  await tick(); await tick();
  c.abort();
  for (let i = 0; i < 20; i++) await tick();
  assert.equal(termino, false, "sigue colgada aunque la señal abortó: los reintentos de Redis no se cancelan");
});

// ============================================================================
// 9. Varios: escritura que falla, claves independientes, sinPlataformas
// ============================================================================
test("PUBLICAR que falla por transporte (respuesta perdida sin haber corrido) → indeterminado, se sirve igual, nada inseguro", async () => {
  const w = mundo();
  const ops: OpsTurno = { ...w.ops, evalPublicar: async () => { throw new Error("transporte"); }, get: async (k) => (k === K.gen ? null : w.ops.get(k)) };
  const r = await w.reloj.correr(w.solicitud(w.deps("A", { ops })));
  assert.equal(r.valor.de, "A");
  assert.equal(r.m.home.publicacion, "indeterminado");
  assert.equal(r.m.home.origen, "propia-sin-publicar");
});

test("dos claves distintas no se bloquean: dos composiciones en paralelo", async () => {
  const w = mundo();
  const K2 = { fresca: "home:v6:1:d:", ub: "home:ub:v6:d:", gen: "home:gen:v6:d:", degradado: "home:degradado:v6:1:d:", turno: "home:turno:v6:1:d:" };
  const [a, b] = await w.reloj.correr(Promise.all([
    w.solicitud(w.deps("A", { tarda: 1000 })),
    w.solicitud(w.deps("B", { claves: K2, tarda: 1000 })),
  ]));
  assert.equal(a.m.home.origen, "propia");
  assert.equal(b.m.home.origen, "propia");
  assert.ok(w.reloj.t - 1_000_000 <= 1000 + CONSTANTES.RENOVACION_MS, "pared < suma: no esperaron una a la otra");
});

test("un resultado NO publicable (sin plataformas) se sirve y libera el turno sin publicar ni enfriar", async () => {
  const w = mundo();
  const r = await w.reloj.correr(w.solicitud(w.deps("A", { publicable: () => false })));
  assert.equal(r.valor.de, "A");
  assert.equal(r.m.home.publicacion, null);
  assert.equal(r.m.home.enfriado, false);
  assert.equal(w.store.has(K.turno), false);
  assert.equal(w.store.has(K.fresca), false);
});

test("las métricas del propietario cuentan la composición donde corre (anotar dentro de producir) y el origen", async () => {
  const w = mundo();
  const r = await w.reloj.correr(w.solicitud(w.deps("A", { producir: async () => { anotar((m: MetricasRequest) => { m.home.composiciones += 1; }); return { valor: { hero: [], degradado: false, de: "A" }, fallo: false }; } })));
  assert.equal(r.m.home.composiciones, 1);
  assert.equal(r.m.home.cache, "miss");
});

// ============================================================================
// 10. Auditoría de Codex sobre fb3a3f1: el productor que RECHAZA, y el ciclo de renovación
// ============================================================================
test("🔴 productor que rechaza CON UB: se libera el turno, se sirve el UB y se registra el error; sin PUBLICAR ni ENFRIAR", async () => {
  const w = mundo();
  w.store.set(K.ub, { v: { hero: ["ub"], degradado: false, de: "ub" }, exp: 0 });
  const r = await w.reloj.correr(w.solicitud(w.deps("A", { producir: async () => { throw new Error("composeHome explotó"); } })));
  assert.equal(r.valor.de, "ub");
  assert.equal(r.m.home.origen, "ultimo-bueno");
  assert.equal(r.m.home.errorProductor, true);
  assert.equal(r.m.home.publicacion, null);
  assert.equal(r.m.home.enfriado, false);
  assert.equal(w.store.has(K.turno), false, "LIBERAR: el turno no queda huérfano 15 s");
  assert.equal(w.store.has(K.fresca), false);
  assert.equal(w.store.has(K.degradado), false);
  assert.equal(w.reloj.durmiendo, 0, "ningún temporizador de renovación vivo");
});

test("🔴 productor que rechaza SIN UB: el error se propaga (semántica de siempre: 500 en la ruta), pero el turno queda liberado y sin renovación viva", async () => {
  const w = mundo();
  const p = w.solicitud(w.deps("A", { producir: async () => { throw new Error("composeHome explotó"); } }));
  await assert.rejects(w.reloj.correr(p), /composeHome explotó/);
  assert.equal(w.store.has(K.turno), false, "el turno se liberó igual");
  assert.equal(w.store.has(K.fresca), false);
  assert.equal(w.reloj.durmiendo, 0);
});

test("🔴 el productor rechaza a mitad de una renovación en curso: la renovación termina antes de devolver y no queda nada vivo", async () => {
  const w = mundo();
  w.store.set(K.ub, { v: { hero: ["ub"], degradado: false, de: "ub" }, exp: 0 });
  const renovaciones: number[] = [];
  const ops: OpsTurno = { ...w.ops, evalRenovar: async (k, p, px) => { await w.reloj.dormir(300); renovaciones.push(w.reloj.t); return w.ops.evalRenovar(k, p, px); } };
  const r = await w.reloj.correr(w.solicitud(w.deps("A", { ops, producir: async () => { await w.reloj.dormir(5100); throw new Error("tarde y mal"); } })));
  assert.equal(r.valor.de, "ub");
  assert.equal(w.reloj.durmiendo, 0);
  const cuantas = renovaciones.length;
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(renovaciones.length, cuantas, "ninguna renovación después de devolver");
});

test("🔴 composición rápida (< RENOVACION_MS): al resolver no queda ningún temporizador ni renovación activa, y ninguna renovación corre después", async () => {
  const w = mundo();
  let renovarLlamadas = 0;
  const ops: OpsTurno = { ...w.ops, evalRenovar: async (k, p, px) => { renovarLlamadas++; return w.ops.evalRenovar(k, p, px); } };
  const r = await w.reloj.correr(w.solicitud(w.deps("A", { ops, tarda: 1000 })));
  assert.equal(r.m.home.publicacion, "publicado");
  assert.equal(w.reloj.durmiendo, 0, "el temporizador de 5 s no puede seguir vivo");
  assert.equal(renovarLlamadas, 0);
  // Avanzar el reloj 30 s más: no aparece ninguna renovación tardía.
  const fantasma = w.reloj.correr((async () => { await w.reloj.dormir(30000); })());
  await fantasma;
  assert.equal(renovarLlamadas, 0, "renovación ejecutada después de devolver");
});

test("🔴 las métricas NO cambian después de la línea terminal (ninguna renovación en vuelo le anota a la solicitud ya devuelta)", async () => {
  const w = mundo();
  // Una renovación que tarda 2 s en responder, y una composición que termina a los 5,5 s: la
  // renovación de los 5 s está EN VUELO cuando termina la composición.
  const ops: OpsTurno = { ...w.ops, evalRenovar: async (k, p, px) => { await w.reloj.dormir(2000); return w.ops.evalRenovar(k, p, px); } };
  const r = await w.reloj.correr(w.solicitud(w.deps("A", { ops, tarda: 5500 })));
  const foto = JSON.stringify(r.m);
  const fantasma = w.reloj.correr((async () => { await w.reloj.dormir(30000); })());
  await fantasma;
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(JSON.stringify(r.m), foto, "las métricas cambiaron después de devolver");
  assert.equal(w.reloj.durmiendo, 0);
});

test("las renovaciones largas legítimas siguen funcionando: composición de 12 s → 2 renovaciones, turno vivo hasta publicar", async () => {
  const w = mundo();
  const r = await w.reloj.correr(w.solicitud(w.deps("A", { tarda: 12000 })));
  assert.equal(r.m.home.renovaciones, 2);
  assert.equal(r.m.home.publicacion, "publicado");
  assert.equal(r.m.home.turnoPerdido, false);
  assert.equal(w.reloj.durmiendo, 0);
});

test("dormirCancelable (el `dormir` real): una señal abortada lo despierta en el acto y limpia el temporizador", async () => {
  const c = new AbortController();
  const t0 = Date.now();
  const p = dormirCancelable(5000, c.signal);
  c.abort();
  await p;
  assert.ok(Date.now() - t0 < 200, "no esperó los 5 s");
  // Ya abortada: resuelve sin programar nada.
  const t1 = Date.now();
  await dormirCancelable(5000, c.signal);
  assert.ok(Date.now() - t1 < 200);
});

// ============================================================================
// Etapa 3.b — "último bueno primero": el líder con UB responde el UB en el acto
// y compone en fondo (diseño §33). Sin UB, sin fondo disponible, con el kill
// switch apagado o con el registro rechazado: EXACTAMENTE el camino de hoy.
// ============================================================================

/** Un programador de fondo de prueba: registra la tarea en su PROPIO scope de métricas (como el adaptador real). */
function fondoDePrueba(w: ReturnType<typeof mundo>, o: { registra?: boolean; lanza?: boolean; senal?: AbortSignal } = {}) {
  const tareas: Promise<{ res: void; metricas: MetricasRequest }>[] = [];
  let llamadas = 0;
  const programarEnFondo = (iniciar: (senal?: AbortSignal) => Promise<void>) => {
    llamadas++;
    if (o.lanza) throw new Error("waitUntil no disponible");
    if (o.registra === false) return false;
    tareas.push(withMetricas(() => iniciar(o.senal)));
    return true;
  };
  return { programarEnFondo, tareas, cuantasLlamadas: () => llamadas, fondo: () => w.reloj.correr(tareas[0]) };
}
const UB: Payload = { hero: ["ub"], degradado: false, de: "ub" };

test("🔴 3.b — líder con UB y fondo registrado: responde el UB en el acto (sin esperar la composición), origen ultimo-bueno-fondo, y UNA composición en fondo que publica", { timeout: 4000 }, async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  const f = fondoDePrueba(w);
  const r = await w.solicitud(w.deps("A", { tarda: 5000, programarEnFondo: f.programarEnFondo }));   // sin correr el reloj: si esperara la composición, no volvería
  assert.equal(r.valor.de, "ub");
  assert.equal(r.m.home.cache, "ultimo-bueno");
  assert.equal(r.m.home.origen, "ultimo-bueno-fondo");
  assert.equal(r.m.home.fondo, "programado");
  assert.equal(r.m.home.turno, "adquirido");
  assert.equal(r.m.home.publicacion, null, "la solicitud no publica nada: publica el fondo");
  assert.equal(f.cuantasLlamadas(), 1);
  assert.equal(w.store.has(K.fresca), false, "todavía no hay fresca: el fondo no terminó");
  const { metricas: mf } = await f.fondo();
  assert.equal(w.cuantasComposiciones(), 1, "una sola composición");
  assert.equal(w.vivo(K.fresca)?.de, "A", "el fondo publicó la fresca");
  assert.equal(mf.home.publicacion, "publicado");
  assert.equal(mf.home.propietario, "A", "correlación por propietario");
  assert.equal(w.store.has(K.turno), false);
  assert.equal(w.reloj.durmiendo, 0);
});

test("🔴 3.b — las métricas de la solicitud quedan CONGELADAS: iguales antes y después de que termine el fondo", { timeout: 4000 }, async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  const f = fondoDePrueba(w);
  const r = await w.solicitud(w.deps("A", { tarda: 6000, programarEnFondo: f.programarEnFondo }));
  const foto = JSON.stringify(r.m);
  const { metricas: mf } = await f.fondo();
  for (let i = 0; i < 10; i++) await tick();
  assert.equal(JSON.stringify(r.m), foto, "el fondo anotó en las métricas de la solicitud");
  assert.equal(mf.home.publicacion, "publicado");
  assert.equal(mf.home.renovaciones, 1, "la renovación se contó en el fondo, no en la solicitud");
  assert.equal(r.m.home.renovaciones, 0);
});

test("🔴 3.b — dos solicitudes concurrentes con UB: las dos reciben el UB en el acto, UNA composición, sin cruce de métricas", { timeout: 4000 }, async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  const f = fondoDePrueba(w);
  const a = await w.solicitud(w.deps("A", { tarda: 5000, programarEnFondo: f.programarEnFondo }));
  const b = await w.solicitud(w.deps("B", { tarda: 5000, programarEnFondo: f.programarEnFondo }));
  assert.equal(a.valor.de, "ub"); assert.equal(b.valor.de, "ub");
  assert.equal(a.m.home.origen, "ultimo-bueno-fondo");
  assert.equal(b.m.home.origen, "ultimo-bueno", "B no lideró: UB de siempre");
  assert.equal(b.m.home.turno, "ocupado");
  assert.equal(b.m.home.fondo, null);
  assert.equal(f.cuantasLlamadas(), 1, "sólo el líder programa");
  assert.notEqual(a.m.home.propietario, b.m.home.propietario);
  await f.fondo();
  assert.equal(w.cuantasComposiciones(), 1);
  assert.equal(w.vivo(K.fresca)?.de, "A");
});

test("🔴 3.b — fondo NO disponible (programarEnFondo devuelve false): el líder compone EN LÍNEA, una sola composición, cero tareas", { timeout: 4000 }, async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  const f = fondoDePrueba(w, { registra: false });
  const r = await w.reloj.correr(w.solicitud(w.deps("A", { tarda: 5000, programarEnFondo: f.programarEnFondo })));
  assert.equal(r.valor.de, "A", "la fresca recién compuesta, como hoy");
  assert.equal(r.m.home.origen, "propia");
  assert.equal(r.m.home.publicacion, "publicado");
  assert.equal(r.m.home.fondo, null);
  assert.equal(f.cuantasLlamadas(), 1);
  assert.equal(f.tareas.length, 0);
  assert.equal(w.cuantasComposiciones(), 1);
});

test("🔴 3.b — el registro del fondo LANZA: el líder compone en línea, una sola composición, cero duplicados, ninguna promesa suelta", { timeout: 4000 }, async () => {
  const sueltos: unknown[] = [];
  const h = (e: unknown) => { sueltos.push(e); };
  process.on("unhandledRejection", h);
  try {
    const w = mundo();
    w.store.set(K.ub, { v: UB, exp: 0 });
    const f = fondoDePrueba(w, { lanza: true });
    const r = await w.reloj.correr(w.solicitud(w.deps("A", { tarda: 5000, programarEnFondo: f.programarEnFondo })));
    assert.equal(r.valor.de, "A");
    assert.equal(r.m.home.publicacion, "publicado");
    assert.equal(w.cuantasComposiciones(), 1);
    for (let i = 0; i < 5; i++) await tick();
  } finally { process.off("unhandledRejection", h); }
  assert.deepEqual(sueltos, []);
});

test("🔴 3.b — sin UB: programarEnFondo NO se llama y el camino es el de hoy (bloqueante)", { timeout: 4000 }, async () => {
  const w = mundo();
  const f = fondoDePrueba(w);
  const r = await w.reloj.correr(w.solicitud(w.deps("A", { tarda: 5000, programarEnFondo: f.programarEnFondo })));
  assert.equal(r.valor.de, "A");
  assert.equal(f.cuantasLlamadas(), 0, "sin UB no hay nada que servir primero");
  assert.equal(r.m.home.fondo, null);
});

test("🔴 3.b — fondo DEGRADADO: ENFRIAR + degradado compartido, fresca NO publicada, UB byte a byte intacto", { timeout: 4000 }, async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  const ubAntes = JSON.stringify(w.store.get(K.ub));
  const f = fondoDePrueba(w);
  const r = await w.solicitud(w.deps("A", { tarda: 3000, fallo: true, programarEnFondo: f.programarEnFondo }));
  assert.equal(r.valor.de, "ub");
  const { metricas: mf } = await f.fondo();
  assert.equal(mf.home.enfriado, true);
  assert.equal(mf.home.degradadoDescartado, true);
  assert.equal(mf.home.publicacion, null);
  assert.equal(w.store.has(K.fresca), false);
  assert.equal(w.store.has(K.degradado), true);
  assert.equal(JSON.stringify(w.store.get(K.ub)), ubAntes, "el UB no se tocó");
});

test("🔴 3.b — el PRODUCTOR RECHAZA en el fondo (producir inyectado): error anotado en el fondo, renovación detenida, turno liberado, UB intacto, la tarea resuelve", { timeout: 4000 }, async () => {
  const sueltos: unknown[] = [];
  const h = (e: unknown) => { sueltos.push(e); };
  process.on("unhandledRejection", h);
  try {
    const w = mundo();
    w.store.set(K.ub, { v: UB, exp: 0 });
    const ubAntes = JSON.stringify(w.store.get(K.ub));
    const f = fondoDePrueba(w);
    const r = await w.solicitud(w.deps("A", { programarEnFondo: f.programarEnFondo, producir: async () => { await w.reloj.dormir(5500); throw new Error("composeHome explotó en fondo"); } }));
    assert.equal(r.valor.de, "ub");
    assert.equal(r.m.home.errorProductor, false, "la solicitud ya respondió: el error es del fondo");
    await assert.doesNotReject(f.fondo());
    const { metricas: mf } = await f.tareas[0];
    assert.equal(mf.home.errorProductor, true);
    assert.equal(mf.home.publicacion, null);
    assert.equal(w.store.has(K.turno), false, "LIBERAR");
    assert.equal(w.store.has(K.fresca), false);
    assert.equal(JSON.stringify(w.store.get(K.ub)), ubAntes);
    assert.equal(w.reloj.durmiendo, 0, "ninguna renovación viva");
    for (let i = 0; i < 5; i++) await tick();
  } finally { process.off("unhandledRejection", h); }
  assert.deepEqual(sueltos, []);
});

test("🔴 3.b — fondo CANCELADO por su señal: LIBERAR, sin PUBLICAR ni ENFRIAR, UB intacto, cancelada anotada en el fondo", { timeout: 4000 }, async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  const ubAntes = JSON.stringify(w.store.get(K.ub));
  const ctl = new AbortController();
  const f = fondoDePrueba(w, { senal: ctl.signal });
  const r = await w.solicitud(w.deps("A", { programarEnFondo: f.programarEnFondo, producir: async () => { await w.reloj.dormir(2000); ctl.abort(); await w.reloj.dormir(100); return { valor: { hero: ["A"], degradado: false, de: "A" }, fallo: false }; } }));
  assert.equal(r.valor.de, "ub");
  const { metricas: mf } = await f.fondo();
  assert.equal(mf.home.cancelada, true);
  assert.equal(mf.home.publicacion, null);
  assert.equal(mf.home.enfriado, false);
  assert.equal(w.store.has(K.turno), false);
  assert.equal(w.store.has(K.fresca), false);
  assert.equal(JSON.stringify(w.store.get(K.ub)), ubAntes);
});

test("3.b — sin programarEnFondo en las deps (o kill switch en el adaptador): comportamiento actual, el líder compone en línea aunque haya UB", async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  const r = await w.reloj.correr(w.solicitud(w.deps("A", { tarda: 5000 })));
  assert.equal(r.valor.de, "A");
  assert.equal(r.m.home.origen, "propia");
});
