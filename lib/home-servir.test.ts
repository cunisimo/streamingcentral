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
import { conPlazoRedis, plazoRedisActual } from "./plazo-redis.ts";
import { crearOpsEnMemoria, type Entrada } from "./turno-memoria.ts";
import { crearVueloHome } from "./home-vuelo.ts";
import { withMetricas, anotar, type MetricasRequest } from "./metricas.ts";

type Payload = { hero: string[]; degradado: boolean; de: string; reintentarEnMs?: number };
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
    const turno = extra.turno ?? crearTurno(ops);
    return {
      claves: K, propietario: nombre, dia: "2026-09-13", ttl: { fresca: 21600, ub: 129600 },
      leer, leerAcotada: leer, turno,
      producir: async () => { if (extra.tarda) await reloj.dormir(extra.tarda); return { valor: payload, fallo: !!extra.fallo }; },
      vacio: (motivo, extra) => ({ hero: [], degradado: true, de: `vacio:${motivo}`, ...(extra ?? {}) }),
      ahora: reloj.ahora, dormir: reloj.dormir, constantes, log: (l) => log.push(l),
      ...extra,
      // Por defecto la readquisición acotada es el MISMO turno (en memoria no hay red que acotar), bajo el plazo compartido.
      tomarAcotado: extra.tomarAcotado ?? ((p, senal) => conPlazoRedis(senal, () => turno.tomar(p, { senal }))),
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
  assert.ok(c.TOPE_ESPERA_MS + c.COMPOSICION_MAX_MS + c.RESERVA_PUBLICACION_MS <= c.PRESUPUESTO_REQUEST_MS,
    `espera ${c.TOPE_ESPERA_MS} + composición ${c.COMPOSICION_MAX_MS} + publicación ${c.RESERVA_PUBLICACION_MS} > presupuesto ${c.PRESUPUESTO_REQUEST_MS}`);
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

// ============================================================================
// 3.c.1 (#19): la PAUSA compartida ante 429 en la secuencia del Home (informe
// §40.5, §42, §43, §46-§52). El backend en memoria ejecuta TOMAR (pausa dentro
// de la adquisición); `pausa` es la vista local del proceso (lib/tmdb-pausa.ts),
// acá un doble con `vigente()`. Escrito ANTES de la implementación.
// ============================================================================
import { CLAVES_PAUSA } from "./pausa-lua.ts";
import { plazosDelFondo, crearLimpieza } from "./home-servir.ts";

const PAUSA_CFG = { pausa: { clave: CLAVES_PAUSA.pausa } };
/** Un doble de lib/tmdb-pausa.ts: la pausa LOCAL del proceso, con reloj virtual. */
function pausaDePrueba(w: ReturnType<typeof mundo>, o: { localHasta?: number | null } = {}) {
  let localHasta = o.localHasta ?? null;
  const cubos: string[] = [];
  return {
    vigente: () => (localHasta !== null && localHasta > w.reloj.ahora() ? localHasta - w.reloj.ahora() : 0),
    anotarCubo: (c: "pausaNoLeida" | "pausadosUB" | "pausados503") => { cubos.push(c); },
    cubos,
    fijar: (hasta: number | null) => { localHasta = hasta; },
  };
}
/** Escribe la pausa COMPARTIDA en el backend (como lo haría PAUSAR desde otra instancia). */
const pausaCompartida = (w: ReturnType<typeof mundo>, ms: number) => { w.store.set(CLAVES_PAUSA.pausa, { v: "otra:1", exp: w.reloj.ahora() + ms }); };
const dormidas = (w: ReturnType<typeof mundo>) => w.log.filter((l) => l.startsWith("[home] duerme")).length;
/** La señal que el cliente ACOTADO lee al empezar cada comando: el plazo compartido de la operación en curso. */
const senalDelPlazo = () => plazoRedisActual() ?? undefined;
/** La readquisición por un doble del cliente acotado (un intento, plazo compartido), como la cablea lib/home.ts. */
const readquisicionCon = (w: ReturnType<typeof mundo>, doble: { ops: OpsTurno }) =>
  (p: { clave: string; propietario: string; px: number }, senal: AbortSignal) => conPlazoRedis(senal, () => crearTurno(doble.ops, PAUSA_CFG).tomar(p, { senal }));
/** Deps de una solicitud con la pausa cableada; `jitter` fijo para que las cuentas sean exactas. */
function depsPausa(w: ReturnType<typeof mundo>, nombre: string, extra: Parameters<typeof w.deps>[1] = {}, p = pausaDePrueba(w)) {
  return { d: w.deps(nombre, { turno: crearTurno(w.ops, PAUSA_CFG), pausa: p, jitter: () => 100, leerAcotada: w.leer, ...extra }), p };
}

test("🔴 3.c.1 — pausado CON UB: el UB en el acto (origen ultimo-bueno-pausa), 0 composiciones, 0 fondo, turno libre, cubo pausadosUB", async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  pausaCompartida(w, 4000);
  const f = fondoDePrueba(w);
  const { d, p } = depsPausa(w, "A", { programarEnFondo: f.programarEnFondo });
  const r = await w.reloj.correr(w.solicitud(d));
  assert.equal(r.valor.de, "ub");
  assert.equal(r.m.home.origen, "ultimo-bueno-pausa"); assert.equal(r.m.home.turno, "pausado");
  assert.equal(w.cuantasComposiciones(), 0); assert.equal(f.cuantasLlamadas(), 0);
  assert.equal(w.store.has(K.turno), false);
  assert.deepEqual(p.cubos, ["pausadosUB"]);
  assert.equal(r.m.home.pausaMs, 4000);
});

test("🔴 3.c.1 — pausado SIN UB, la pausa termina dentro de la espera (2,3 s): UN sueño de restante + jitter, 2 adquisiciones, 0 lecturas durante el sueño, compone", async () => {
  const w = mundo();
  pausaCompartida(w, 2300);
  const { d } = depsPausa(w, "A");
  const r = await w.reloj.correr(w.solicitud(d));
  assert.equal(r.valor.de, "A"); assert.equal(r.m.home.origen, "propia");
  assert.equal(dormidas(w), 1, "un solo sueño"); assert.match(w.log.find((l) => l.startsWith("[home] duerme"))!, /2400ms/);
  assert.equal(r.m.home.pausaEsperaMs, 2400);
  assert.deepEqual(w.lecturas, [[K.fresca], [K.ub, K.degradado], [K.fresca]], "ninguna lectura durante el sueño");
  assert.equal(w.cuantasComposiciones(), 1);
});

test("🔴 3.c.1 — pausado SIN UB y la pausa sigue (8 s > ESPERA 5 s): 503 `pausa` en el acto con reintentarEnMs = 8000, sin dormir, 1 adquisición, cubo pausados503; nada escrito", async () => {
  const w = mundo();
  pausaCompartida(w, 8000);
  const { d, p } = depsPausa(w, "A");
  const r = await w.reloj.correr(w.solicitud(d));
  assert.equal(r.valor.de, "vacio:pausa"); assert.equal(r.valor.reintentarEnMs, 8000);
  assert.equal(r.m.home.origen, "vacio-pausa"); assert.equal(r.m.home.cache, "vacio");
  assert.equal(dormidas(w), 0); assert.equal(w.cuantasComposiciones(), 0);
  assert.deepEqual(p.cubos, ["pausados503"]);
  assert.equal(w.store.has(K.fresca), false); assert.equal(w.store.has(K.ub), false);
});

test("🔴 3.c.1 — pausa EXTENDIDA durante el sueño (2 s → 4 s más): tras dormir, la readquisición la ve y responde 503 con el restante NUEVO; nunca un segundo sueño", async () => {
  const w = mundo();
  pausaCompartida(w, 2000);
  const { d } = depsPausa(w, "A", { producir: async () => { throw new Error("no debería componer"); } });
  const extender = w.reloj.dormir(2050).then(() => pausaCompartida(w, 4000));
  const r = await w.reloj.correr(Promise.all([w.solicitud(d), extender]).then(([s]) => s));
  assert.equal(r.valor.de, "vacio:pausa");
  assert.ok(r.valor.reintentarEnMs! > 3900 && r.valor.reintentarEnMs! <= 4000, `reintentarEnMs ${r.valor.reintentarEnMs}`);
  assert.equal(dormidas(w), 1);
});

test("🔴 3.c.1 — presupuesto con el PLAZO ABSOLUTO (§46): lectura previa de 30 s + pausa de 2 s → 50 − 30 − 2,25 − 2 = 15,75 < 16 → 503 sin dormir; con 29 s cabe y compone", async () => {
  for (const [consumido, esperado] of [[30_000, "vacio:presupuesto-insuficiente"], [29_000, "A"]] as const) {
    const w = mundo();
    const inicio = w.reloj.ahora();
    w.reloj.avanzar(consumido);                                                  // la lectura previa, ANTES de servirConTurno
    pausaCompartida(w, 2000);
    const { d } = depsPausa(w, "A", { plazo: inicio + CONSTANTES.PRESUPUESTO_REQUEST_MS, inicioRuta: inicio });
    const r = await w.reloj.correr(w.solicitud(d));
    assert.equal(r.valor.de, esperado);
    assert.equal(dormidas(w), esperado === "A" ? 1 : 0);
  }
});

test("🔴 3.c.1 — vencimiento del presupuesto interno DURANTE el sueño: el centinela 4d `vacio-cancelada` de hoy, sin readquirir ni componer ni lanzar", async () => {
  const w = mundo();
  pausaCompartida(w, 4000);
  const ctl = new AbortController();
  const { d } = depsPausa(w, "A", { senal: ctl.signal });
  const cortar = w.reloj.dormir(1500).then(() => ctl.abort());
  const r = await w.reloj.correr(Promise.all([w.solicitud(d), cortar]).then(([s]) => s));
  assert.equal(r.valor.de, "vacio:cancelada"); assert.equal(r.m.home.origen, "vacio-cancelada");
  assert.equal(w.cuantasComposiciones(), 0);
  assert.equal(r.m.home.turno, "pausado", "una sola adquisición: no readquirió");
});

test("🔴 3.c.1 — readquisición INDETERMINADA (Redis no responde en T_ADQ_MAX = 2 s): 503 con reintentarEnMs = max(5 s, restante − dormido), sin componer", async () => {
  const w = mundo();
  pausaCompartida(w, 3000);
  // La primera adquisición responde (pausado); la readquisición va a un Redis que no responde: el cliente acotado aborta al vencer el plazo.
  const colgado = clienteTurnoDoble(w, { retries: 0, modo: "colgado", colgadoMs: 1e9, senal: senalDelPlazo });
  const { d } = depsPausa(w, "A", { tomarAcotado: readquisicionCon(w, colgado) });
  const r = await w.reloj.correr(w.solicitud(d));
  assert.equal(r.valor.de, "vacio:pausa-indeterminada"); assert.equal(r.valor.reintentarEnMs, 5000);
  assert.equal(w.cuantasComposiciones(), 0);
});

test("🔴 3.c.1 — precedencia (§43.3): pausa LOCAL vigente + Redis caído → SIN UB no se compone contra TMDB (503 con el restante local); CON UB el UB en el acto; sin pausa local + caído → el degradado de hoy", async () => {
  const caido = { evalTomar: async () => { throw new Error("caido"); }, get: async () => { throw new Error("caido"); } };
  // sin UB, con pausa local de 8 s (no cabe en la espera) → 503 pausa 8000, sin componer
  { const w = mundo(); const p = pausaDePrueba(w, { localHasta: w.reloj.ahora() + 8000 });
    const { d } = depsPausa(w, "A", { turno: crearTurno({ ...w.ops, ...caido }, PAUSA_CFG), producir: async () => { throw new Error("no compone"); } }, p);
    const r = await w.reloj.correr(w.solicitud(d));
    assert.equal(r.valor.de, "vacio:pausa"); assert.equal(r.valor.reintentarEnMs, 8000); assert.equal(r.m.home.turno, "pausado"); }
  // sin UB, con pausa local de 2 s: duerme 2,1 s; al despertar la local venció y Redis sigue caído → el degradado de hoy (compone sin turno, no publica) — NUNCA compuso con la pausa vigente
  { const w = mundo(); const p = pausaDePrueba(w, { localHasta: w.reloj.ahora() + 2000 });
    const { d } = depsPausa(w, "A", { turno: crearTurno({ ...w.ops, ...caido }, PAUSA_CFG), producir: async () => { assert.equal(p.vigente(), 0, "compuso con la pausa local vigente"); return { valor: { hero: [], degradado: false, de: "A" }, fallo: false }; } }, p);
    const r = await w.reloj.correr(w.solicitud(d));
    assert.equal(r.valor.de, "A"); assert.equal(r.m.home.origen, "sin-redis"); assert.equal(dormidas(w), 1); assert.equal(w.store.has(K.fresca), false); }
  // con UB
  { const w = mundo(); w.store.set(K.ub, { v: UB, exp: 0 }); const p = pausaDePrueba(w, { localHasta: w.reloj.ahora() + 2000 });
    const { d } = depsPausa(w, "A", { turno: crearTurno({ ...w.ops, ...caido }, PAUSA_CFG) }, p);
    const r = await w.reloj.correr(w.solicitud(d));
    assert.equal(r.valor.de, "ub"); assert.equal(r.m.home.origen, "ultimo-bueno-pausa"); assert.equal(w.cuantasComposiciones(), 0); }
  // sin pausa local: degradado de hoy (compone sin turno, no publica)
  { const w = mundo();
    const { d } = depsPausa(w, "A", { turno: crearTurno({ ...w.ops, ...caido }, PAUSA_CFG) });
    const r = await w.reloj.correr(w.solicitud(d));
    assert.equal(r.valor.de, "A"); assert.equal(r.m.home.origen, "sin-redis"); assert.equal(w.store.has(K.fresca), false); }
});

test("🔴 3.c.1 — cuatro solicitudes sin UB esperando la misma pausa: UNA composición (SET NX); las otras caen en la espera compartida y reciben la fresca", async () => {
  const w = mundo();
  pausaCompartida(w, 1000);
  const rs = await w.reloj.correr(Promise.all([0, 50, 100, 150].map((j, i) => w.solicitud(depsPausa(w, `S${i}`, { jitter: () => j, tarda: 3000 }).d))));
  assert.equal(w.cuantasComposiciones(), 1);
  assert.equal(rs.filter((r) => r.m.home.origen === "propia").length, 1);
  assert.ok(rs.every((r) => r.valor.de === "S0"), rs.map((r) => `${r.valor.de}/${r.m.home.origen}`).join(" "));
});

test("🔴 3.c.1 — el rescate de la espera compartida (Etapa 2) también usa el plazo absoluto: lectura previa 30 s + espera 5 s → no rescata (vacío espera-agotada), aunque el reloj local diga que sobran 45 s", async () => {
  const w = mundo({ constantes: { TOPE_ESPERA_MS: 45_000 } });
  const inicio = w.reloj.ahora();
  w.reloj.avanzar(30_000);
  await w.ops.setNx(K.turno, "muerto", 5000);
  const { d } = depsPausa(w, "B", { plazo: inicio + CONSTANTES.PRESUPUESTO_REQUEST_MS, inicioRuta: inicio });
  const r = await w.reloj.correr(w.solicitud(d));
  assert.equal(r.valor.de, "vacio:espera-agotada"); assert.equal(w.cuantasComposiciones(), 0);
});

test("🔴 3.c.1 — la pausa aparece DURANTE la composición (429 propio): LIBERAR (no ENFRIAR ni PUBLICAR); con UB → UB `ultimo-bueno-pausa`; sin UB → 503 pausa; nada escrito", async () => {
  for (const conUb of [true, false]) {
    const w = mundo();
    if (conUb) w.store.set(K.ub, { v: UB, exp: 0 });
    const p = pausaDePrueba(w);
    const { d } = depsPausa(w, "A", { producir: async () => { await w.reloj.dormir(1000); p.fijar(w.reloj.ahora() + 3000); return { valor: { hero: [], degradado: true, de: "A" }, fallo: true }; } }, p);
    const r = await w.reloj.correr(w.solicitud(d));
    assert.equal(r.valor.de, conUb ? "ub" : "vacio:pausa");
    assert.equal(r.m.home.enfriado, false); assert.equal(r.m.home.publicacion, null);
    assert.equal(w.store.has(K.turno), false, "liberado"); assert.equal(w.store.has(K.degradado), false, "no enfriado"); assert.equal(w.store.has(K.fresca), false);
    assert.equal(r.m.home.liberacion, "liberado");
  }
});

// ----------------------------------------------------------------- el fondo con dos límites (§47-§52)
/** El adaptador de fondo de prueba con los PLAZOS reales: min(inicioFondo + 50 s, inicioRuta + 55 s), señal que vence ahí. */
function fondoConPlazos(w: ReturnType<typeof mundo>, inicioRuta: number) {
  const tareas: Promise<{ res: void; metricas: MetricasRequest }>[] = [];
  let plazos: ReturnType<typeof plazosDelFondo> | null = null;
  const programarEnFondo = (iniciar: (senal?: AbortSignal, plazoEfectivo?: number) => Promise<void>) => {
    const inicioFondo = w.reloj.ahora();
    plazos = plazosDelFondo(inicioRuta, inicioFondo, CONSTANTES);
    const ctl = new AbortController();
    void w.reloj.dormir(Math.max(0, plazos.plazoEfectivo - inicioFondo)).then(() => ctl.abort());
    tareas.push(withMetricas(() => iniciar(ctl.signal, plazos!.plazoEfectivo)));
    return true;
  };
  return { programarEnFondo, tareas, fondo: () => w.reloj.correr(tareas[0]), plazos: () => plazos! };
}
const opsRegistrando = (w: ReturnType<typeof mundo>, registro: { op: string; t: number }[], o: { liberarFalla?: boolean } = {}): OpsTurno => ({
  ...w.ops,
  evalRenovar: (c, p, px) => { registro.push({ op: "RENOVAR", t: w.reloj.ahora() }); return w.ops.evalRenovar(c, p, px); },
  evalPublicar: (c, a) => { registro.push({ op: "PUBLICAR", t: w.reloj.ahora() }); return w.ops.evalPublicar(c, a); },
  evalEnfriar: (c, a) => { registro.push({ op: "ENFRIAR", t: w.reloj.ahora() }); return w.ops.evalEnfriar(c, a); },
  evalLiberar: (c, p) => { registro.push({ op: "LIBERAR", t: w.reloj.ahora() }); if (o.liberarFalla) throw new Error("redis caido"); return w.ops.evalLiberar(c, p); },
});
const enFondo = (w: ReturnType<typeof mundo>, o: { inicioRuta: number; registro: { op: string; t: number }[]; f: ReturnType<typeof fondoConPlazos>; liberarFalla?: boolean; producir?: () => Promise<{ valor: Payload; fallo: boolean }> }) =>
  depsPausa(w, "A", { turno: crearTurno(opsRegistrando(w, o.registro, { liberarFalla: o.liberarFalla }), PAUSA_CFG), plazo: o.inicioRuta + CONSTANTES.PRESUPUESTO_REQUEST_MS, inicioRuta: o.inicioRuta, programarEnFondo: o.f.programarEnFondo, ...(o.producir ? { producir: o.producir } : {}) }).d;

test("🔴 3.c.1 — plazosDelFondo: a 0,4 s limita el interno (50 s); a 15 s el externo (40 s, no 50); las constantes son las del contrato", () => {
  const c = CONSTANTES;
  assert.equal(c.MAX_DURATION_MS, 60_000); assert.equal(c.MARGEN_CIERRE_MS, 5_000); assert.equal(c.RESERVA_PUBLICACION_MS, 1_000);
  assert.equal((c as unknown as Record<string, unknown>).PUBLICACION_MAX_MS, undefined, "renombrada: es una RESERVA, no un máximo (§48.2)");
  const a = plazosDelFondo(100_000, 100_400, c); assert.equal(a.limitadoPor, "interno"); assert.equal(a.plazoEfectivo - 100_400, 50_000);
  const b = plazosDelFondo(100_000, 115_000, c); assert.equal(b.limitadoPor, "externo"); assert.equal(b.plazoEfectivo - 115_000, 40_000);
});

test("🔴 3.c.1 — fondo iniciado a los 40 s de la ruta (quedan 15 s < 16 + 1): UB ya servido, CERO composición, UN LIBERAR, `fondo no-iniciado-presupuesto`", async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  const inicioRuta = w.reloj.ahora();
  w.reloj.avanzar(40_000);
  const registro: { op: string; t: number }[] = [];
  const f = fondoConPlazos(w, inicioRuta);
  const r = await w.solicitud(enFondo(w, { inicioRuta, registro, f }));
  assert.equal(r.valor.de, "ub"); assert.equal(r.m.home.fondo, "programado");
  const { metricas: mf } = await f.fondo();
  assert.equal(mf.home.fondo, "no-iniciado-presupuesto"); assert.equal(w.cuantasComposiciones(), 0);
  assert.deepEqual(registro.map((x) => x.op), ["LIBERAR"]); assert.equal(w.store.has(K.turno), false);
  assert.equal(mf.home.publicacion, null);
});

test("🔴 3.c.1 — composición de fondo que CRUZA el plazo efectivo: después del plazo cero RENOVAR/ENFRIAR/PUBLICAR; un solo LIBERAR, dentro del margen; nada publicado; UB intacto", async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  const ubAntes = JSON.stringify(w.store.get(K.ub));
  const inicioRuta = w.reloj.ahora();
  w.reloj.avanzar(20_000);                                                      // fondo a +20 s → plazo efectivo +55 s (externo)
  const registro: { op: string; t: number }[] = [];
  const f = fondoConPlazos(w, inicioRuta);
  await w.solicitud(enFondo(w, { inicioRuta, registro, f, producir: async () => { await w.reloj.dormir(36_000); return { valor: { hero: ["A"], degradado: true, de: "A" }, fallo: true }; } }));   // 36 s: devuelve a +56 s (tras el plazo de +55, dentro del margen), degradado
  const { metricas: mf } = await f.fondo();
  const plazo = f.plazos().plazoEfectivo;
  assert.equal(plazo - inicioRuta, 55_000);
  const productivas = registro.filter((x) => x.op !== "LIBERAR");
  assert.ok(productivas.every((x) => x.t < plazo), `productiva en o después del plazo: ${JSON.stringify(registro.map((x) => [x.op, x.t - inicioRuta]))}`);
  assert.ok(productivas.some((x) => x.op === "RENOVAR"), "hubo renovaciones antes del plazo");
  const liberaciones = registro.filter((x) => x.op === "LIBERAR");
  assert.equal(liberaciones.length, 1); assert.ok(liberaciones[0].t < inicioRuta + CONSTANTES.MAX_DURATION_MS);
  assert.equal(mf.home.cancelada, true); assert.equal(mf.home.enfriado, false); assert.equal(mf.home.publicacion, null);
  assert.equal(JSON.stringify(w.store.get(K.ub)), ubAntes); assert.equal(w.store.has(K.fresca), false); assert.equal(w.store.has(K.degradado), false);
  assert.equal(mf.home.liberacion, "liberado");
});

test("🔴 3.c.1 — sin margen (la composición devuelve en o después de inicioRuta + 60 s): CERO LIBERAR, `liberacion omitido-sin-margen`; el turno se recupera por TTL", async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  const inicioRuta = w.reloj.ahora();
  w.reloj.avanzar(20_000);
  const registro: { op: string; t: number }[] = [];
  const f = fondoConPlazos(w, inicioRuta);
  // La señal vence a +55 s pero el productor sólo "detecta" al devolver, a +60 s exacto: sin margen (comparación estricta).
  await w.solicitud(enFondo(w, { inicioRuta, registro, f, producir: async () => { await w.reloj.dormir(40_000); return { valor: { hero: ["A"], degradado: false, de: "A" }, fallo: false }; } }));
  const { metricas: mf } = await f.fondo();
  assert.equal(w.reloj.ahora(), inicioRuta + 60_000);
  assert.deepEqual(registro.filter((x) => x.op === "LIBERAR"), []);
  assert.equal(mf.home.liberacion, "omitido-sin-margen"); assert.equal(mf.home.publicacion, null);
  assert.ok(w.store.has(K.turno), "el turno sigue del proceso: vence por TTL");
});

test("🔴 3.c.1 — LIBERAR que rechaza (Redis caído al liberar): un solo intento, sin excepción, `liberacion indeterminado`, la tarea del fondo resuelve, UB intacto", async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  const inicioRuta = w.reloj.ahora();
  w.reloj.avanzar(20_000);
  const registro: { op: string; t: number }[] = [];
  const f = fondoConPlazos(w, inicioRuta);
  await w.solicitud(enFondo(w, { inicioRuta, registro, f, liberarFalla: true, producir: async () => { await w.reloj.dormir(36_000); return { valor: { hero: ["A"], degradado: false, de: "A" }, fallo: false }; } }));
  const { metricas: mf } = await f.fondo();
  assert.equal(registro.filter((x) => x.op === "LIBERAR").length, 1);
  assert.equal(mf.home.liberacion, "indeterminado"); assert.equal(mf.home.publicacion, null);
  assert.deepEqual(w.store.get(K.ub)?.v, UB);
});

test("🔴 3.c.1 — la limpieza es UNA función con guardia por intentos: el productor que rechaza en el fondo pasa por el catch de `iniciar` y por `componer` → un solo LIBERAR", async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  const inicioRuta = w.reloj.ahora();
  const registro: { op: string; t: number }[] = [];
  const f = fondoConPlazos(w, inicioRuta);
  await w.solicitud(enFondo(w, { inicioRuta, registro, f, producir: async () => { await w.reloj.dormir(1000); throw new Error("productor roto"); } }));
  await f.fondo();
  assert.equal(registro.filter((x) => x.op === "LIBERAR").length, 1);
});

test("🔴 3.c.1 — PUBLICAR no se inicia si no queda la reserva (1 s) antes del plazo: composición que termina a plazo − 0,5 s → sin PUBLICAR, LIBERAR, nada escrito", async () => {
  const w = mundo();
  w.store.set(K.ub, { v: UB, exp: 0 });
  const inicioRuta = w.reloj.ahora();
  w.reloj.avanzar(20_000);
  const registro: { op: string; t: number }[] = [];
  const f = fondoConPlazos(w, inicioRuta);
  await w.solicitud(enFondo(w, { inicioRuta, registro, f, producir: async () => { await w.reloj.dormir(34_500); return { valor: { hero: ["A"], degradado: false, de: "A" }, fallo: false }; } }));
  const { metricas: mf } = await f.fondo();
  assert.deepEqual(registro.filter((x) => x.op === "PUBLICAR"), []); assert.equal(registro.filter((x) => x.op === "LIBERAR").length, 1);
  assert.equal(mf.home.publicacion, null); assert.equal(w.store.has(K.fresca), false);
});

test("🔴 3.c.1 — la última renovación se anota con sus DOS instantes (envío y respuesta): el TTL del turno vence 15 s después de la aplicación en Redis, que cae entre ambos", async () => {
  const w = mundo();
  const inicioRuta = w.reloj.ahora();
  const { d } = depsPausa(w, "A", { plazo: inicioRuta + CONSTANTES.PRESUPUESTO_REQUEST_MS, inicioRuta, tarda: 12_000 });
  const r = await w.reloj.correr(w.solicitud(d));
  assert.equal(r.m.home.renovaciones, 2);
  assert.ok(r.m.home.renovacionUltima, "sin instantes de la última renovación");
  assert.equal(r.m.home.renovacionUltima!.envioMs, 10_000);
  assert.ok(r.m.home.renovacionUltima!.respuestaMs >= r.m.home.renovacionUltima!.envioMs);
});

test("3.c.1 — kill switch (sin `pausa` en las deps y turno sin pausa): exactamente el camino de siempre; la pausa compartida escrita en Redis se IGNORA", async () => {
  const w = mundo();
  pausaCompartida(w, 8000);
  const r = await w.reloj.correr(w.solicitud(w.deps("A")));
  assert.equal(r.valor.de, "A"); assert.equal(r.m.home.origen, "propia");
});

test("🔴 3.c.1 — sin señal cableada (deps.senal ausente), una composición en línea que devuelve DESPUÉS del plazo no publica ni enfría: LIBERAR y vacío `cancelada` (el plazo absoluto decide, no sólo la señal)", async () => {
  const w = mundo();
  const inicioRuta = w.reloj.ahora();
  const registro: { op: string; t: number }[] = [];
  const { d } = depsPausa(w, "A", { turno: crearTurno(opsRegistrando(w, registro), PAUSA_CFG), plazo: inicioRuta + CONSTANTES.PRESUPUESTO_REQUEST_MS, inicioRuta, senal: undefined,
    producir: async () => { await w.reloj.dormir(51_000); return { valor: { hero: ["A"], degradado: false, de: "A" }, fallo: false }; } });
  const r = await w.reloj.correr(w.solicitud(d));
  assert.equal(r.valor.de, "vacio:cancelada"); assert.equal(r.m.home.cancelada, true);
  assert.deepEqual(registro.filter((x) => x.op === "PUBLICAR" || x.op === "ENFRIAR"), []);
  assert.equal(registro.filter((x) => x.op === "LIBERAR").length, 1);
  assert.ok(registro.filter((x) => x.op === "RENOVAR").every((x) => x.t < inicioRuta + CONSTANTES.PRESUPUESTO_REQUEST_MS), "ninguna renovación en el plazo ni después");
});

test("🔴 3.c.1 — crearLimpieza (el mecanismo real de servirConTurno): dos llamadas → UN liberar; en o después de inicioRuta + maxDuration → omitido-sin-margen sin llamar; un liberar que rechaza → indeterminado sin lanzar", async () => {
  let llamadas = 0;
  const mk = (ahora: () => number, liberar = async () => { llamadas += 1; return "liberado" as const; }) => crearLimpieza({ ahora, inicioRuta: 100_000, maxDurationMs: 60_000, liberar });
  llamadas = 0;
  const l1 = mk(() => 150_000);
  assert.equal(await l1(), "liberado"); assert.equal(await l1(), "omitido-ya-intentado"); assert.equal(llamadas, 1);
  for (const [t, esperado] of [[159_999, "liberado"], [160_000, "omitido-sin-margen"], [160_001, "omitido-sin-margen"]] as const) {
    llamadas = 0; assert.equal(await mk(() => t)(), esperado, `ahora = límite ${t - 160_000}`); assert.equal(llamadas, esperado === "liberado" ? 1 : 0);
  }
  assert.equal(await mk(() => 150_000, async () => { throw new Error("redis"); })(), "indeterminado");
});

test("🔴 3.c.1 — la pausa VENCIÓ antes de que la composición devolviera, pero alguna llamada fue RECHAZADA por ella (`pausada`): la composición está mutilada → LIBERAR, nunca ENFRIAR ni servir el degradado; con UB → UB; sin UB → 503 pausa (Retry-After mínimo 1 s)", async () => {
  for (const conUb of [true, false]) {
    const w = mundo();
    if (conUb) w.store.set(K.ub, { v: UB, exp: 0 });
    const p = pausaDePrueba(w);   // nunca vigente al volver
    const { d } = depsPausa(w, "A", { producir: async () => { await w.reloj.dormir(1000); return { valor: { hero: [], degradado: true, de: "A" }, fallo: true, pausada: true }; } }, p);
    const r = await w.reloj.correr(w.solicitud(d));
    assert.equal(r.valor.de, conUb ? "ub" : "vacio:pausa");
    if (!conUb) assert.equal(r.valor.reintentarEnMs, 1000);
    assert.equal(r.m.home.origen, conUb ? "ultimo-bueno-pausa" : "vacio-pausa");
    assert.equal(r.m.home.enfriado, false); assert.equal(w.store.has(K.degradado), false, "un Home mutilado por la pausa NO se enfría ni se comparte");
    assert.equal(w.store.has(K.turno), false); assert.equal(w.store.has(K.fresca), false);
  }
});

// ============================================================================
// Auditoría de Codex sobre 6fc63b5, punto 1: con la pausa LOCAL vigente, el
// pedido NO puede quedar esperando los reintentos normales de Redis (medido:
// 23,1 s hasta el 503 con Redis caído). Lecturas y TOMAR con tope propio.
// ============================================================================
const LIMITE_LOCAL = CONSTANTES.T_LECTURA_PAUSA_MS * 2 + CONSTANTES.ESPERA_PAUSA_MAX_MS + CONSTANTES.JITTER_MAX_MS + CONSTANTES.T_ADQ_MAX_MS;

test("🔴 punto 1 — pausa local vigente (8 s) + Redis que NO responde (lecturas y TOMAR colgados): 503 `pausa` en ≤ 2 lecturas acotadas, 0 TMDB, 0 composiciones, sin esperar a Redis", async () => {
  const w = mundo();
  const p = pausaDePrueba(w, { localHasta: w.reloj.ahora() + 8000 });
  let producciones = 0;
  const colgado = () => new Promise<never>(() => {});
  const ops: OpsTurno = { ...w.ops, evalTomar: colgado, get: colgado, setNx: colgado };
  const t0 = w.reloj.ahora();
  const acotado = clienteRedisDoble(w, { retries: 0, modo: "colgado", senal: () => acotado.senalVirtual(CONSTANTES.T_LECTURA_PAUSA_MS) });
  const { d } = depsPausa(w, "A", { leer: () => colgado(), leerAcotada: (c) => acotado.mget(c) as Promise<(Payload | null)[]>, turno: crearTurno(ops, PAUSA_CFG), producir: async () => { producciones++; return { valor: { hero: [], degradado: false, de: "A" }, fallo: false }; } }, p);
  const r = await w.reloj.correr(w.solicitud(d));
  assert.equal(r.valor.de, "vacio:pausa"); assert.equal(r.valor.reintentarEnMs, 8000 - (w.reloj.ahora() - t0));
  assert.equal(producciones, 0, "compuso contra TMDB con la pausa local vigente");
  assert.ok(w.reloj.ahora() - t0 <= 2 * CONSTANTES.T_LECTURA_PAUSA_MS, `tardó ${w.reloj.ahora() - t0} ms: esperó a Redis`);
  assert.equal(r.m.home.turno, "pausado"); assert.equal(r.m.home.pausaMs, 8000);
});

test("🔴 punto 1 — pausa local vigente + Redis LENTO (cada lectura 20 s): el UB no llega dentro del tope → 503 con Retry-After; con el UB dentro del tope (500 ms) → el UB", async () => {
  for (const [demora, esperado] of [[20_000, "vacio:pausa"], [500, "ub"]] as const) {
    const w = mundo();
    w.store.set(K.ub, { v: UB, exp: 0 });
    const p = pausaDePrueba(w, { localHasta: w.reloj.ahora() + 8000 });
    const lento = clienteRedisDoble(w, { retries: 0, modo: "ok", latenciaMs: demora, senal: () => lento.senalVirtual(CONSTANTES.T_LECTURA_PAUSA_MS) });
    const t0 = w.reloj.ahora();
    const { d } = depsPausa(w, "A", { leer: () => new Promise<never>(() => {}), leerAcotada: (c) => lento.mget(c) as Promise<(Payload | null)[]>, producir: async () => { throw new Error("no compone"); } }, p);
    const r = await w.reloj.correr(w.solicitud(d));
    assert.equal(r.valor.de, esperado);
    assert.ok(w.reloj.ahora() - t0 <= 2 * CONSTANTES.T_LECTURA_PAUSA_MS + demora, `demora ${demora}: tardó ${w.reloj.ahora() - t0} ms`);
    if (esperado === "ub") assert.equal(r.m.home.origen, "ultimo-bueno-pausa");
  }
});

test("🔴 punto 1 — pausa local CORTA (2 s) + Redis colgado, sin UB: duerme lo que resta, UNA readquisición acotada por T_ADQ_MAX y 503 `pausa-indeterminada`; todo dentro del límite explícito", async () => {
  const w = mundo();
  const p = pausaDePrueba(w, { localHasta: w.reloj.ahora() + 2000 });
  const colgado = () => new Promise<never>(() => {});
  const ops: OpsTurno = { ...w.ops, evalTomar: colgado, get: colgado, setNx: colgado };
  const t0 = w.reloj.ahora();
  const acotado = clienteRedisDoble(w, { retries: 0, modo: "colgado", senal: () => acotado.senalVirtual(CONSTANTES.T_LECTURA_PAUSA_MS) });
  const turnoColgado = clienteTurnoDoble(w, { retries: 0, modo: "colgado", colgadoMs: 1e9, senal: senalDelPlazo });
  const { d } = depsPausa(w, "A", { leer: () => colgado(), leerAcotada: (c) => acotado.mget(c) as Promise<(Payload | null)[]>, turno: crearTurno(ops, PAUSA_CFG), tomarAcotado: readquisicionCon(w, turnoColgado), producir: async () => { throw new Error("no compone"); } }, p);
  const r = await w.reloj.correr(w.solicitud(d));
  assert.equal(r.valor.de, "vacio:pausa-indeterminada");
  assert.ok(w.reloj.ahora() - t0 <= LIMITE_LOCAL, `tardó ${w.reloj.ahora() - t0} ms > límite ${LIMITE_LOCAL}`);
  assert.equal(dormidas(w), 1);
});

test("punto 1 — pausa local vigente con Redis SANO: fresca presente → HIT; UB presente → UB en el acto; el camino sin pausa no cambia (control: un frío sano compone y publica)", async () => {
  const a = mundo(); a.store.set(K.fresca, { v: UB, exp: 0 });
  const ra = await a.reloj.correr(a.solicitud(depsPausa(a, "A", {}, pausaDePrueba(a, { localHasta: a.reloj.ahora() + 3000 })).d));
  assert.equal(ra.m.home.cache, "hit");
  const b = mundo(); b.store.set(K.ub, { v: UB, exp: 0 });
  const rb = await b.reloj.correr(b.solicitud(depsPausa(b, "A", {}, pausaDePrueba(b, { localHasta: b.reloj.ahora() + 3000 })).d));
  assert.equal(rb.valor.de, "ub"); assert.equal(rb.m.home.origen, "ultimo-bueno-pausa"); assert.equal(b.cuantasComposiciones(), 0);
  const c = mundo();
  const rc = await c.reloj.correr(c.solicitud(depsPausa(c, "A").d));
  assert.equal(rc.valor.de, "A"); assert.equal(rc.m.home.publicacion, "publicado");
});

test("🔴 punto 1 — la pausa local aparece ENTRE la primera lectura y la segunda (Redis ya colgado): la segunda lectura también lleva tope, decidido por lectura y no sólo al entrar", async () => {
  const w = mundo();
  const p = pausaDePrueba(w);
  const colgado = () => new Promise<never>(() => {});
  let lecturas = 0;
  const leer = async (claves: string[]) => { lecturas++; if (lecturas === 1) { p.fijar(w.reloj.ahora() + 8000); return w.leer(claves); } return colgado(); };   // la fresca (sin pausa aún) responde por el cliente principal y la pausa nace ahí; el principal después cuelga
  const acotado = clienteRedisDoble(w, { retries: 0, modo: "colgado", senal: () => acotado.senalVirtual(CONSTANTES.T_LECTURA_PAUSA_MS) });
  const ops: OpsTurno = { ...w.ops, evalTomar: colgado, get: colgado, setNx: colgado };
  const t0 = w.reloj.ahora();
  const { d } = depsPausa(w, "A", { leer, leerAcotada: (c) => acotado.mget(c) as Promise<(Payload | null)[]>, turno: crearTurno(ops, PAUSA_CFG), producir: async () => { throw new Error("no compone"); } }, p);
  const r = await w.reloj.correr(w.solicitud(d));
  assert.equal(r.valor.de, "vacio:pausa");
  assert.ok(w.reloj.ahora() - t0 <= CONSTANTES.T_LECTURA_PAUSA_MS, `tardó ${w.reloj.ahora() - t0} ms: la lectura del UB esperó a Redis`);
});

// ============================================================================
// Auditoría de Codex sobre d322282 (único bloqueo): el tope de lectura tiene
// que CANCELAR el trabajo, no ignorar su resultado. Un doble fiel al cliente
// de Upstash 1.38.0: reintentos con backoff (e^i × 50 ms), `retries` y una
// señal POR PETICIÓN (función); con la señal abortada el request lanza sin
// reintentar. Cada intento se registra con su instante y se anota en las
// métricas del scope, como el `backoff` instrumentado de producción.
// ============================================================================
function clienteRedisDoble(w: ReturnType<typeof mundo>, o: { retries: number; senal?: () => AbortSignal; modo: "caido" | "colgado" | "ok"; latenciaMs?: number }) {
  const intentos: { t: number; claves: string[] }[] = [];
  let enVuelo = 0;
  const backoff = (i: number) => Math.round(Math.exp(i) * 50);
  const mget = async (claves: string[]): Promise<unknown[]> => {
    const senal = o.senal?.();
    for (let i = 0; i <= o.retries; i++) {
      intentos.push({ t: w.reloj.ahora(), claves }); enVuelo += 1;
      anotar((m) => { m.redis.intentosHttp += 1; });
      try {
        if (o.modo === "ok") { if (o.latenciaMs) { await w.reloj.dormir(o.latenciaMs, senal); if (senal?.aborted) { enVuelo -= 1; throw new DOMException("timeout", "TimeoutError"); } } enVuelo -= 1; return await w.leer(claves); }
        if (o.modo === "colgado") { await w.reloj.dormir(1e9, senal); enVuelo -= 1; if (senal?.aborted) throw new DOMException("abortada", "TimeoutError"); return await w.leer(claves); }
        enVuelo -= 1; throw new TypeError("fetch failed");                        // caído: la conexión se rechaza en el acto
      } catch (e) {
        if (senal?.aborted) throw e;                                                // función de señal: el SDK lanza sin reintentar
        if (i < o.retries) await w.reloj.dormir(backoff(i));
        else throw e;
      }
    }
    throw new Error("inalcanzable");
  };
  /** Una señal de timeout sobre el reloj VIRTUAL (AbortSignal.timeout usa timers reales). */
  const senalVirtual = (ms: number) => { const c = new AbortController(); void w.reloj.dormir(ms).then(() => c.abort(new DOMException("timeout", "TimeoutError"))); return c.signal; };
  return { mget, intentos, enVuelo: () => enVuelo, senalVirtual };
}

test("🔴 (auditoría sobre d322282) pausa local conocida + Redis CAÍDO: después de que el Home respondió no queda ninguna lectura viva de esa solicitud, no aparecen intentos tardíos, ninguna métrica cerrada cambia y no hay rechazos sueltos", async () => {
  const sueltos: unknown[] = []; const h = (e: unknown) => { sueltos.push(e); }; process.on("unhandledRejection", h);
  try {
    const w = mundo();
    const p = pausaDePrueba(w, { localHasta: w.reloj.ahora() + 8000 });
    // El cliente PRINCIPAL (6 intentos, 4,3 s de backoff) es el que usaría `deps.leer` de siempre.
    const principal = clienteRedisDoble(w, { retries: 5, modo: "caido" });
    // El cliente ACOTADO: un solo intento y señal de 1 s por petición.
    const acotado = clienteRedisDoble(w, { retries: 0, modo: "caido", senal: () => acotado.senalVirtual(CONSTANTES.T_LECTURA_PAUSA_MS) });
    const colgado = () => new Promise<never>(() => {});
    const ops: OpsTurno = { ...w.ops, evalTomar: colgado, get: colgado, setNx: colgado };
    const t0 = w.reloj.ahora();
    const { d } = depsPausa(w, "A", {
      leer: (claves) => principal.mget(claves) as Promise<(Payload | null)[]>,
      leerAcotada: (claves) => acotado.mget(claves) as Promise<(Payload | null)[]>,
      turno: crearTurno(ops, PAUSA_CFG), producir: async () => { throw new Error("no compone"); },
    }, p);
    const r = await w.reloj.correr(w.solicitud(d));
    const tRespuesta = w.reloj.ahora();
    const metricasCerradas = JSON.stringify(r.m);
    assert.equal(r.valor.de, "vacio:pausa"); assert.ok(tRespuesta - t0 <= 2 * CONSTANTES.T_LECTURA_PAUSA_MS, `respondió en ${tRespuesta - t0} ms`);
    const intentosAntes = principal.intentos.length + acotado.intentos.length;
    // Diez segundos después de la respuesta: nada vivo, nada nuevo, nada anotado.
    await w.reloj.correr(w.reloj.dormir(10_000));
    assert.equal(principal.enVuelo() + acotado.enVuelo(), 0, "queda una lectura viva atribuible a la solicitud");
    const tardios = [...principal.intentos, ...acotado.intentos].filter((i) => i.t > tRespuesta);
    assert.deepEqual(tardios, [], `intentos de Redis DESPUÉS de la respuesta: ${JSON.stringify(tardios.map((i) => i.t - t0))}`);
    assert.equal(principal.intentos.length + acotado.intentos.length, intentosAntes);
    assert.equal(JSON.stringify(r.m), metricasCerradas, "una métrica ya cerrada cambió después de la respuesta");
    assert.equal(principal.intentos.length, 0, "el cliente principal (con reintentos) no participa en el camino pausado");
    assert.equal(acotado.intentos.length, 2, "una lectura de la fresca y una de [UB, degradado], un intento cada una");
    for (let i = 0; i < 5; i++) await new Promise((x) => setImmediate(x));
    assert.deepEqual(sueltos, []);
  } finally { process.off("unhandledRejection", h); }
});

test("🔴 (auditoría sobre d322282) Redis COLGADO con pausa local: la señal por petición corta la lectura al segundo y la lectura NO sigue viva ni anota después", async () => {
  const w = mundo();
  const p = pausaDePrueba(w, { localHasta: w.reloj.ahora() + 8000 });
  const acotado = clienteRedisDoble(w, { retries: 0, modo: "colgado", senal: () => acotado.senalVirtual(CONSTANTES.T_LECTURA_PAUSA_MS) });
  const colgado = () => new Promise<never>(() => {});
  const t0 = w.reloj.ahora();
  const { d } = depsPausa(w, "A", { leer: () => colgado(), leerAcotada: (claves) => acotado.mget(claves) as Promise<(Payload | null)[]>, producir: async () => { throw new Error("no compone"); } }, p);
  const r = await w.reloj.correr(w.solicitud(d));
  const tRespuesta = w.reloj.ahora();
  assert.equal(r.valor.de, "vacio:pausa"); assert.equal(tRespuesta - t0, 2 * CONSTANTES.T_LECTURA_PAUSA_MS);
  const cerradas = JSON.stringify(r.m);
  await w.reloj.correr(w.reloj.dormir(10_000));
  assert.equal(acotado.enVuelo(), 0); assert.equal(acotado.intentos.length, 2); assert.equal(JSON.stringify(r.m), cerradas);
});

test("control: SIN pausa local el camino usa `leer` de siempre (el cliente principal con su política) y nunca `leerAcotada`", async () => {
  const w = mundo();
  const principal = clienteRedisDoble(w, { retries: 5, modo: "ok" });
  const acotado = clienteRedisDoble(w, { retries: 0, modo: "ok" });
  const r = await w.reloj.correr(w.solicitud(depsPausa(w, "A", { leer: (c) => principal.mget(c) as Promise<(Payload | null)[]>, leerAcotada: (c) => acotado.mget(c) as Promise<(Payload | null)[]> }).d));
  assert.equal(r.valor.de, "A"); assert.ok(principal.intentos.length >= 3); assert.equal(acotado.intentos.length, 0);
});

// ============================================================================
// Auditoría sobre 1403ae4: la READQUISICIÓN tras la pausa corta no puede dejar
// trabajo vivo después de responder. Un doble del cliente de Redis PARA EL
// TURNO, con la política del cliente principal (reintentos + backoff del SDK)
// o la del acotado (un intento, señal por petición leída al empezar cada
// comando, como el `signal` como función de @upstash/redis 1.38.0: si aborta,
// lanza y no reintenta).
// ============================================================================
function clienteTurnoDoble(w: ReturnType<typeof mundo>, o: { retries: number; modo: "caido" | "colgado" | "ok" | "aplica-y-falla"; colgadoMs?: number; senal?: () => AbortSignal | undefined; aplicaAntesDeColgar?: boolean }) {
  const intentos: { t: number; op: string; clave: string; fin?: number; resultado?: string }[] = [];
  let enVuelo = 0;
  const backoff = (i: number) => Math.round(Math.exp(i) * 50);
  const comando = <R>(op: string, clave: string, real: () => Promise<R>) => async (): Promise<R> => {
    const senal = o.senal?.();
    for (let i = 0; i <= o.retries; i++) {
      const intento = { t: w.reloj.ahora(), op, clave } as (typeof intentos)[number];
      intentos.push(intento); enVuelo += 1;
      try {
        if (o.modo === "ok") { enVuelo -= 1; intento.fin = w.reloj.ahora(); const r = await real(); intento.resultado = JSON.stringify(r); return r; }
        // El comando LLEGÓ y aplicó, pero la respuesta se perdió (sólo los que escriben; el GET responde).
        if (o.modo === "aplica-y-falla") { const r = await real(); enVuelo -= 1; intento.fin = w.reloj.ahora(); if (op === "GET") { intento.resultado = JSON.stringify(r); return r; } throw new TypeError("fetch failed"); }
        if (o.modo === "colgado") {
          // El comando puede haber LLEGADO a Redis (y aplicado) aunque la respuesta tarde.
          let r: R | undefined; if (o.aplicaAntesDeColgar) r = await real();
          await w.reloj.dormir(o.colgadoMs ?? 6000, senal);
          enVuelo -= 1; intento.fin = w.reloj.ahora();
          if (senal?.aborted) throw new DOMException("abortada", "AbortError");
          if (r === undefined) r = await real();
          intento.resultado = JSON.stringify(r); return r;
        }
        enVuelo -= 1; intento.fin = w.reloj.ahora();
        throw new TypeError("fetch failed");
      } catch (e) {
        if (senal?.aborted) throw e;
        if (i < o.retries) await w.reloj.dormir(backoff(i)); else throw e;
      }
    }
    throw new Error("inalcanzable");
  };
  const ops: OpsTurno = {
    ...w.ops,
    setNx: (k, v, px) => comando("SETNX", k, () => w.ops.setNx(k, v, px))(),
    evalTomar: (claves, args) => comando("TOMAR", claves[0], () => w.ops.evalTomar(claves, args))(),
    get: (k) => comando("GET", k, () => w.ops.get(k))(),
    evalLiberar: (k, prop) => comando("LIBERAR", k, () => w.ops.evalLiberar(k, prop))(),
  };
  return { ops, intentos, enVuelo: () => enVuelo };
}

/** Lo que pasó DESPUÉS de `tRespuesta`: iniciado después, o iniciado antes y terminado después. */
const residualDe = (intentos: { t: number; op: string; fin?: number }[], tRespuesta: number) => ({
  tardios: intentos.filter((i) => i.t > tRespuesta).map((i) => `${i.op}@+${i.t - tRespuesta}`),
  terminadosDespues: intentos.filter((i) => i.t <= tRespuesta && (i.fin === undefined || i.fin > tRespuesta)).map((i) => `${i.op}@+${(i.fin ?? Infinity) - tRespuesta}`),
});

test("🔴 (auditoría sobre 1403ae4) pausa corta (2 s) + Redis CAÍDO: tras el 503 de la readquisición no aparece ningún TOMAR/GET/LIBERAR tardío, nada queda en vuelo, las métricas cerradas no cambian y no hay rechazos sueltos", async () => {
  const sueltos: unknown[] = []; const h = (e: unknown) => { sueltos.push(e); }; process.on("unhandledRejection", h);
  try {
    const w = mundo();
    pausaCompartida(w, 2000);
    const p = pausaDePrueba(w, { localHasta: w.reloj.ahora() + 2000 });
    const lector = clienteRedisDoble(w, { retries: 0, modo: "caido", senal: () => lector.senalVirtual(CONSTANTES.T_LECTURA_PAUSA_MS) });
    // El cliente PRINCIPAL para el turno: 6 intentos y 4,3 s de backoff por comando (la política vigente).
    const principal = clienteTurnoDoble(w, { retries: 5, modo: "caido" });
    // El cliente ACOTADO para la readquisición: un intento por comando, bajo el plazo compartido.
    const acotado = clienteTurnoDoble(w, { retries: 0, modo: "caido", senal: senalDelPlazo });
    const t0 = w.reloj.ahora();
    const { d } = depsPausa(w, "A", {
      leerAcotada: (claves) => lector.mget(claves) as Promise<(Payload | null)[]>,
      turno: crearTurno(principal.ops, PAUSA_CFG), tomarAcotado: readquisicionCon(w, acotado),
      producir: async () => ({ valor: { hero: ["A"], degradado: false, de: "A" }, fallo: false }),
    }, p);
    const r = await w.reloj.correr(w.solicitud(d));
    const tRespuesta = w.reloj.ahora();
    const cerradas = JSON.stringify(r.m);
    assert.equal(dormidas(w), 1, "un solo sueño");
    assert.ok(tRespuesta - t0 <= 2000 + 100 + CONSTANTES.T_ADQ_MAX_MS + 1, `respondió en ${tRespuesta - t0} ms`);
    await w.reloj.correr(w.reloj.dormir(10_000));
    const res = residualDe([...principal.intentos, ...acotado.intentos], tRespuesta);
    assert.equal(principal.enVuelo() + acotado.enVuelo(), 0, "queda un comando del turno en vuelo");
    assert.deepEqual(res.tardios, [], `comandos del turno DESPUÉS de responder: ${JSON.stringify(res.tardios)}`);
    assert.deepEqual(res.terminadosDespues, []);
    assert.equal(JSON.stringify(r.m), cerradas, "una métrica cerrada cambió después de responder");
    assert.equal(w.store.has(K.turno), false);
    // Redis caído y la pausa ya vencida: `sin-redis` → el degradado de hoy (compone sin turno), como en §43.3; por el acotado, UN TOMAR y UN GET, y el principal no participa.
    assert.equal(r.valor.de, "A"); assert.equal(r.m.home.origen, "sin-redis");
    assert.deepEqual(acotado.intentos.map((i) => i.op), ["TOMAR", "GET"]);
    assert.equal(principal.intentos.length, 0, "el cliente principal (con reintentos) no participa en la readquisición");
    for (let i = 0; i < 5; i++) await new Promise((x) => setImmediate(x));
    assert.deepEqual(sueltos, []);
  } finally { process.off("unhandledRejection", h); }
});

test("🔴 (auditoría sobre 1403ae4) pausa corta (2 s) + Redis COLGADO que responde tarde (6 s): la readquisición indeterminada NO deja un TOMAR que se complete después, ni un LIBERAR tardío, ni toca las métricas cerradas", async () => {
  const sueltos: unknown[] = []; const h = (e: unknown) => { sueltos.push(e); }; process.on("unhandledRejection", h);
  try {
    const w = mundo();
    pausaCompartida(w, 2000);
    const p = pausaDePrueba(w, { localHasta: w.reloj.ahora() + 2000 });
    const lector = clienteRedisDoble(w, { retries: 0, modo: "colgado", senal: () => lector.senalVirtual(CONSTANTES.T_LECTURA_PAUSA_MS) });
    const principal = clienteTurnoDoble(w, { retries: 5, modo: "colgado", colgadoMs: 6000 });
    const acotado = clienteTurnoDoble(w, { retries: 0, modo: "colgado", colgadoMs: 6000, senal: senalDelPlazo });
    const t0 = w.reloj.ahora();
    const { d } = depsPausa(w, "A", {
      leerAcotada: (claves) => lector.mget(claves) as Promise<(Payload | null)[]>,
      turno: crearTurno(principal.ops, PAUSA_CFG), tomarAcotado: readquisicionCon(w, acotado),
      producir: async () => { throw new Error("no compone"); },
    }, p);
    const r = await w.reloj.correr(w.solicitud(d));
    const tRespuesta = w.reloj.ahora();
    const cerradas = JSON.stringify(r.m);
    assert.equal(r.valor.de, "vacio:pausa-indeterminada");
    assert.ok(tRespuesta - t0 <= 2 * CONSTANTES.T_LECTURA_PAUSA_MS + 2000 + 100 + CONSTANTES.T_ADQ_MAX_MS + 1, `respondió en ${tRespuesta - t0} ms`);
    await w.reloj.correr(w.reloj.dormir(10_000));
    const res = residualDe([...principal.intentos, ...acotado.intentos], tRespuesta);
    assert.equal(principal.enVuelo() + acotado.enVuelo(), 0, "queda un comando del turno en vuelo");
    assert.deepEqual(res.tardios, [], `comandos del turno DESPUÉS de responder: ${JSON.stringify(res.tardios)}`);
    assert.deepEqual(res.terminadosDespues, [], `comandos terminados DESPUÉS de responder: ${JSON.stringify(res.terminadosDespues)}`);
    assert.equal(JSON.stringify(r.m), cerradas, "una métrica cerrada cambió después de responder");
    assert.equal(w.cuantasComposiciones(), 0);
    // UN solo TOMAR, abortado por el plazo a los T_ADQ_MAX; ningún GET ni LIBERAR; el turno nunca quedó tomado.
    assert.deepEqual(acotado.intentos.map((i) => `${i.op}:${i.fin! - i.t}`), [`TOMAR:${CONSTANTES.T_ADQ_MAX_MS}`]);
    assert.equal(principal.intentos.length, 0);
    assert.equal(w.store.has(K.turno), false);
    for (let i = 0; i < 5; i++) await new Promise((x) => setImmediate(x));
    assert.deepEqual(sueltos, []);
  } finally { process.off("unhandledRejection", h); }
});

test("🔴 (1403ae4) TOMAR aplicado en Redis pero no reconciliable dentro del plazo: \`indeterminado\` → 503, SIN limpieza tardía; el turno queda y vence por su TTL (TURNO_MS), y recién entonces otro lo toma", async () => {
  const w = mundo();
  pausaCompartida(w, 2000);
  const p = pausaDePrueba(w, { localHasta: w.reloj.ahora() + 2000 });
  // El TOMAR llega a Redis y aplica, pero la respuesta nunca vuelve: el plazo lo aborta.
  const acotado = clienteTurnoDoble(w, { retries: 0, modo: "colgado", colgadoMs: 1e9, aplicaAntesDeColgar: true, senal: senalDelPlazo });
  const { d } = depsPausa(w, "A", { tomarAcotado: readquisicionCon(w, acotado), producir: async () => { throw new Error("no compone"); } }, p);
  const r = await w.reloj.correr(w.solicitud(d));
  const tRespuesta = w.reloj.ahora();
  assert.equal(r.valor.de, "vacio:pausa-indeterminada");
  assert.equal(r.m.home.turno, "sin-redis");
  // El turno quedó tomado por A (fencing intacto) con su TTL: nadie lo limpia después de responder.
  const e = w.store.get(K.turno)!;
  assert.equal(e.v, "A"); assert.equal(e.exp, tRespuesta - CONSTANTES.T_ADQ_MAX_MS + CONSTANTES.TURNO_MS);
  await w.reloj.correr(w.reloj.dormir(10_000));
  assert.deepEqual(acotado.intentos.map((i) => i.op), ["TOMAR"]);
  assert.equal(acotado.enVuelo(), 0);
  assert.equal(w.store.get(K.turno)?.v, "A", "el turno sigue tomado: la recuperación es el TTL, no una limpieza tardía");
  // Mientras dura el TTL, otro ve \`ocupado\` (espera compartida); vencido, adquiere y compone.
  await w.reloj.correr(w.reloj.dormir(CONSTANTES.TURNO_MS));
  assert.equal(w.vivo(K.turno), null);
  const rb = await w.reloj.correr(w.solicitud(depsPausa(w, "B").d));
  assert.equal(rb.valor.de, "B"); assert.equal(rb.m.home.turno, "adquirido"); assert.equal(rb.m.home.publicacion, "publicado");
});

test("(1403ae4) reconciliación SEGURA dentro del plazo: el TOMAR aplica y su respuesta se pierde, el GET llega a tiempo → adquirido (reconciliado) y compone; dos comandos, ninguno después de responder", async () => {
  const w = mundo();
  pausaCompartida(w, 2000);
  const p = pausaDePrueba(w, { localHasta: w.reloj.ahora() + 2000 });
  const acotado = clienteTurnoDoble(w, { retries: 0, modo: "aplica-y-falla", senal: senalDelPlazo });
  const { d } = depsPausa(w, "A", { tomarAcotado: readquisicionCon(w, acotado) }, p);
  const r = await w.reloj.correr(w.solicitud(d));
  const tRespuesta = w.reloj.ahora();
  assert.equal(r.valor.de, "A"); assert.equal(r.m.home.turno, "reconciliado"); assert.equal(r.m.home.publicacion, "publicado");
  assert.deepEqual(acotado.intentos.map((i) => i.op), ["TOMAR", "GET"]);
  await w.reloj.correr(w.reloj.dormir(10_000));
  assert.deepEqual(residualDe(acotado.intentos, tRespuesta), { tardios: [], terminadosDespues: [] });
});

test("controles (1403ae4): Redis SANO tras la pausa corta → readquisición y composición normales por el acotado; pausa LARGA → 503 inmediato sin readquirir; SIN pausa → el camino de siempre nunca llama a tomarAcotado; UB presente → UB en el acto", async () => {
  // Redis sano: pausa de 2 s, un sueño, readquisición adquirida, compone y publica.
  { const w = mundo(); pausaCompartida(w, 2000);
    const sano = clienteTurnoDoble(w, { retries: 0, modo: "ok", senal: senalDelPlazo });
    const r = await w.reloj.correr(w.solicitud(depsPausa(w, "A", { tomarAcotado: readquisicionCon(w, sano) }).d));
    assert.equal(r.valor.de, "A"); assert.equal(dormidas(w), 1); assert.equal(r.m.home.turno, "adquirido"); assert.equal(r.m.home.publicacion, "publicado");
    assert.deepEqual(sano.intentos.map((i) => i.op), ["TOMAR"]); }
  // Pausa larga (8 s > ESPERA_PAUSA_MAX): 503 en el acto, sin dormir ni readquirir.
  { const w = mundo(); pausaCompartida(w, 8000);
    const r = await w.reloj.correr(w.solicitud(depsPausa(w, "A", { tomarAcotado: async () => { throw new Error("no debía readquirir"); } }).d));
    assert.equal(r.valor.de, "vacio:pausa"); assert.equal(r.valor.reintentarEnMs, 8000); assert.equal(dormidas(w), 0); }
  // Sin pausa: MISS frío de siempre, `tomarAcotado` no participa.
  { const w = mundo();
    const r = await w.reloj.correr(w.solicitud(w.deps("A", { tomarAcotado: async () => { throw new Error("no debía readquirir"); } })));
    assert.equal(r.valor.de, "A"); assert.equal(r.m.home.turno, "adquirido"); assert.equal(r.m.home.publicacion, "publicado"); }
  // UB presente con pausa corta: el UB ya, sin sueño ni readquisición.
  { const w = mundo(); w.store.set(K.ub, { v: UB, exp: 0 }); pausaCompartida(w, 2000);
    const r = await w.reloj.correr(w.solicitud(depsPausa(w, "A", { tomarAcotado: async () => { throw new Error("no debía readquirir"); } }).d));
    assert.equal(r.valor.de, "ub"); assert.equal(r.m.home.origen, "ultimo-bueno-pausa"); assert.equal(dormidas(w), 0); }
});
