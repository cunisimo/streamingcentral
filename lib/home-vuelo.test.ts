// Etapa 1 de capacidad, segunda mitad: SINGLE-FLIGHT acotado al Home (#17).
//
// ============================================================================
// EL PROBLEMA, MEDIDO EN EL BANCO DE LA ETAPA 0
// ============================================================================
// B3: cinco solicitudes iguales sobre caché fría = CINCO composiciones (3.598
// llamadas a TMDB en vez de 926). `cachedIf` hace leer → producir → guardar sin
// ningún mapa de promesas en vuelo. `crearSingleFlight` existe, está probado y
// se usa en dos lugares (reco.ts, idioma.ts); ninguno es el camino del Home.
//
// ============================================================================
// EL DISEÑO, Y POR QUÉ NO ES "ENVOLVER cachedIf"
// ============================================================================
// El vuelo compartido va en `homePayload` y en ningún otro lado (ver el
// inventario de la Etapa 1 del informe: los contextos de degradación son
// AsyncLocalStorage por request, y un single-flight profundo haría que el
// segundo guardara como sano un payload construido con fallos). En el Home no
// pasa por construcción: se comparte el resultado ENTERO de la resolución del
// líder, con su verdicto de degradación adentro; el que llega segundo no
// produce, no evalúa ningún predicado y no escribe. (En la Etapa 1 esa
// resolución era `cachedLocIf`; desde la Etapa 2 es `servirConTurno`, y acá
// los tests la simulan con `resolverConCache`, que conserva la misma forma
// leer → producir → decidir.)
//
// Dos fases, y la primera es para no crear esperas innecesarias con caché
// caliente: (1) una lectura previa del caché — si hay HIT, se devuelve y no se
// comparte nada; (2) si no, se entra al vuelo por clave: el primero resuelve
// (leer de nuevo → producir → publicar UNA vez), los demás esperan esa misma
// promesa. Métricas: el líder anota `composiciones += 1` y `cache = "miss"`
// (adentro del productor, en su propio scope); cada seguidor anota
// `esperasCompartidas += 1` y `cache = "compartida"` en el SUYO. Nada se deduce
// de HIT/MISS.
//
// Por PROCESO: entre instancias de Vercel coordina el turno de la Etapa 2
// (lib/home-servir.ts), no este vuelo. Escrito ANTES del módulo: fallaba al
// importar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearVueloHome } from "./home-vuelo.ts";
import { resolverConCache, type BackendCache } from "./reparar-y-cachear.ts";
import { withMetricas, anotar, nuevasMetricas, lineaHome, type MetricasRequest } from "./metricas.ts";
import { guardarSinRomper } from "./escritura-cache.ts";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Un backend en memoria con el mismo contrato que `backendCache` de lib/cache.ts,
// contando escrituras; opcionalmente la escritura falla (Etapa PREVIA, #21).
function backend(opts: { escrituraFalla?: boolean } = {}) {
  const guardado = new Map<string, unknown>();
  let escrituras = 0, lecturas = 0;
  const b: BackendCache = {
    async leer<T>(clave: string) { lecturas++; return (guardado.get(clave) as T) ?? null; },
    async escribir<T>(clave: string, valor: T) {
      escrituras++;
      await guardarSinRomper({ clave, escribir: async () => { if (opts.escrituraFalla) throw new Error("Redis caído"); guardado.set(clave, valor); }, avisar: () => {} });
    },
  };
  return { b, guardado, get escrituras() { return escrituras; }, get lecturas() { return lecturas; } };
}

type Payload = { hero: string[]; degradado: boolean; n: number };

// Una "solicitud": abre su scope de métricas (el real) y sirve el Home por el
// vuelo, con un productor que tarda `ms` y puede degradar o fallar.
function armar(opts: { ms?: number; degradado?: boolean; falla?: boolean; escrituraFalla?: boolean } = {}) {
  const be = backend({ escrituraFalla: opts.escrituraFalla });
  let producciones = 0;
  const producir = async (): Promise<Payload> => {
    anotar((m) => { m.home.cache = "miss"; m.home.composiciones += 1; });
    producciones++;
    await dormir(opts.ms ?? 20);
    if (opts.falla) throw new Error("composeHome reventó");
    return { hero: ["a"], degradado: !!opts.degradado, n: producciones };
  };
  const servir = crearVueloHome<Payload>({
    leer: (clave) => be.b.leer<Payload>(clave),
    // Como en lib/home.ts: la resolución es el resolver real, con el productor
    // que le pasa el líder.
    resolver: (clave, prod) => resolverConCache<Payload>({
      clave, ttl: 60, backend: be.b,
      producir: async () => { const valor = await prod(); return { valor, fallo: valor.degradado }; },
    }),
  });
  const solicitud = (clave: string) => withMetricas(() => servir(clave, producir));
  return { solicitud, be, get producciones() { return producciones; } };
}

const resumen = (m: MetricasRequest) => ({ cache: m.home.cache, comp: m.home.composiciones, esperas: m.home.esperasCompartidas });

// ===========================================================================
// LOS CASOS OBLIGATORIOS
// ===========================================================================

test("🔴 100 solicitudes simultáneas a la MISMA clave con caché fría: exactamente UNA composición, medida con home.composiciones", async () => {
  const h = armar({ ms: 30 });
  const rs = await Promise.all(Array.from({ length: 100 }, () => h.solicitud("home:x")));
  const comps = rs.reduce((a, r) => a + r.metricas.home.composiciones, 0);
  assert.equal(comps, 1, "🔴 hubo más de una composición para la misma clave");
  assert.equal(h.producciones, 1, "el productor corrió más de una vez");
  assert.equal(h.be.escrituras, 1, "🔴 se guardó más de una vez: los seguidores escribieron");
});

test("🔴 las 99 restantes registran ESPERA COMPARTIDA (no HIT, no MISS, no composición), y no se deduce de nada", async () => {
  const h = armar({ ms: 30 });
  const rs = await Promise.all(Array.from({ length: 100 }, () => h.solicitud("home:x")));
  const lider = rs.filter((r) => r.metricas.home.composiciones === 1);
  const seguidores = rs.filter((r) => r.metricas.home.composiciones === 0);
  assert.equal(lider.length, 1);
  assert.equal(seguidores.length, 99);
  assert.deepEqual(resumen(lider[0].metricas), { cache: "miss", comp: 1, esperas: 0 });
  for (const s of seguidores) assert.deepEqual(resumen(s.metricas), { cache: "compartida", comp: 0, esperas: 1 });
});

test("🔴 todas reciben el MISMO resultado correcto", async () => {
  const h = armar({ ms: 30 });
  const rs = await Promise.all(Array.from({ length: 100 }, () => h.solicitud("home:x")));
  for (const r of rs) assert.deepEqual(r.res, { hero: ["a"], degradado: false, n: 1 });
});

test("🔴 dos claves DIFERENTES se componen independientemente: una no bloquea a la otra", async () => {
  const h = armar({ ms: 40 });
  const t0 = Date.now();
  const [a, b] = await Promise.all([h.solicitud("home:a"), h.solicitud("home:b")]);
  assert.equal(h.producciones, 2, "dos claves son dos composiciones");
  assert.deepEqual(resumen(a.metricas), { cache: "miss", comp: 1, esperas: 0 });
  assert.deepEqual(resumen(b.metricas), { cache: "miss", comp: 1, esperas: 0 });
  assert.ok(Date.now() - t0 < 80, "🔴 se serializaron: la segunda esperó a la primera");
});

test("🔴 con caché CALIENTE no hay composición ni espera innecesaria: todas son HIT", async () => {
  const h = armar({ ms: 10 });
  await h.solicitud("home:x");                         // calienta
  const rs = await Promise.all(Array.from({ length: 20 }, () => h.solicitud("home:x")));
  assert.equal(h.producciones, 1);
  for (const r of rs) assert.deepEqual(resumen(r.metricas), { cache: "hit", comp: 0, esperas: 0 });
});

test("🔴 si la composición compartida RECHAZA, todos reciben el rechazo, la entrada en vuelo se limpia y una petición posterior puede reintentar", async () => {
  const h = armar({ ms: 20, falla: true });
  const rs = await Promise.allSettled(Array.from({ length: 10 }, () => h.solicitud("home:x")));
  assert.ok(rs.every((r) => r.status === "rejected"), "algún seguidor no vio el fallo del líder");
  assert.equal(h.producciones, 1);
  // Después del fallo, la clave no queda pegada: se vuelve a intentar.
  await assert.rejects(() => h.solicitud("home:x"));
  assert.equal(h.producciones, 2, "🔴 la entrada en vuelo quedó pegada tras el rechazo");
});

test("🔴 degradación durante la composición: todos reciben el payload degradado y NINGUNO lo guarda como sano", async () => {
  const h = armar({ ms: 20, degradado: true });
  const rs = await Promise.all(Array.from({ length: 50 }, () => h.solicitud("home:x")));
  for (const r of rs) assert.equal(r.res.degradado, true);
  assert.equal(h.be.guardado.size, 0, "🔴 alguien guardó el degradado");
  assert.equal(h.be.escrituras, 0, "ni siquiera se intentó guardar");
  assert.equal(h.producciones, 1);
  // La siguiente vuelve a intentar componer (no hay nada guardado).
  await h.solicitud("home:x");
  assert.equal(h.producciones, 2);
});

test("🔴 una escritura fallida en Redis sigue entregando el payload a TODOS (#21 preservado)", async () => {
  const h = armar({ ms: 20, escrituraFalla: true });
  const rs = await Promise.all(Array.from({ length: 30 }, () => h.solicitud("home:x")));
  for (const r of rs) assert.deepEqual(r.res, { hero: ["a"], degradado: false, n: 1 });
  assert.equal(h.producciones, 1);
  assert.equal(h.be.escrituras, 1, "se intentó guardar una vez (el líder) y falló sin romper");
  assert.equal(h.be.guardado.size, 0);
});

test("🔴 CONTROL: sin el vuelo compartido, 100 solicitudes son 100 composiciones", async () => {
  // Es la regla de docs/MANTENIMIENTO.md 8.b: si prendido y apagado dan lo
  // mismo, el interruptor no existe.
  const be = backend();
  let producciones = 0;
  const solicitud = () => withMetricas(() => resolverConCache<Payload>({
    clave: "home:x", ttl: 60, backend: be.b,
    producir: async () => { anotar((m) => { m.home.composiciones += 1; }); producciones++; await dormir(30); return { valor: { hero: ["a"], degradado: false, n: producciones }, fallo: false }; },
  }));
  const rs = await Promise.all(Array.from({ length: 100 }, solicitud));
  assert.equal(rs.reduce((a, r) => a + r.metricas.home.composiciones, 0), 100);
});

// ===========================================================================
// LAS MÉTRICAS: los cuatro estados, diferenciados y en la línea
// ===========================================================================

test("🔴 el modelo admite `cache = \"compartida\"` y la línea [home] lo muestra distinto de HIT y de MISS", () => {
  const m = nuevasMetricas();
  m.home.cache = "compartida"; m.home.esperasCompartidas = 1; m.redis.modo = "redis";
  const linea = lineaHome(m, 12);
  assert.match(linea, /cache COMPARTIDA/);
  assert.match(linea, /0 composiciones/);
  assert.match(linea, /1 espera compartida/);
});

// ===========================================================================
// QUE PRODUCCIÓN ENTRE POR ACÁ, Y POR NINGÚN OTRO LADO
// ===========================================================================

const sinComentarios = (rel: string) => readFileSync(rel, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const home = sinComentarios("lib/home.ts");

test("🔴 homePayload sirve el Home por el vuelo compartido, con la lectura previa y la resolución real", () => {
  assert.match(home, /crearVueloHome<HomePayload, ClaveLocalizada, ClavesHome>\(/, "lib/home.ts no crea el vuelo del Home con la clave tipada y las cinco claves como contexto");
  assert.match(home, /leer:\s*\(clave\) => backendCache\.leer<HomePayload>\(clave\)/, "la lectura previa no usa el backend real");
  // Etapa 2: el líder resuelve por la secuencia con turno (lib/home-servir.ts),
  // que decide qué se publica; `cachedLocIf` escribiría la fresca sin fencing.
  assert.match(home, /resolver:\s*\(_clave, producir, claves\) => servirConTurno<HomePayload>\(/, "el vuelo no resuelve por la secuencia con turno, con las cinco claves del contexto");
  assert.doesNotMatch(home, /cachedLocIf\s*\(/, "volvió cachedLocIf en el Home");
  assert.match(home, /servirHome\(key, producirHome, claves\)/, "homePayload no entra por el vuelo con las cinco claves");
});

test("🔴 el single-flight NO se agrega a cached/cachedIf/cachedLocIf ni a otros llamadores", () => {
  // Los dos usos que ya existían (reco.ts, idioma.ts) son de `titleDetails` y
  // no del Home; se listan explícitos para que un tercero aparezca en rojo.
  const cache = sinComentarios("lib/cache.ts");
  assert.doesNotMatch(cache, /crearSingleFlight|crearVueloHome/, "🔴 el vuelo entró en lib/cache.ts: sería global");
  for (const rel of ["lib/enrich.ts", "lib/pools.ts", "lib/top.ts", "lib/curated.ts", "lib/reviews.ts", "lib/reparar-y-cachear.ts", "lib/ultimos.ts", "lib/roulette.ts"]) {
    assert.doesNotMatch(sinComentarios(rel), /crearSingleFlight|crearVueloHome/, `🔴 vuelo compartido en ${rel}`);
  }
  assert.doesNotMatch(sinComentarios("lib/reco.ts"), /crearVueloHome/);
  assert.doesNotMatch(sinComentarios("lib/idioma.ts"), /crearVueloHome/);
});

// ===========================================================================
// Auditoría de Codex sobre fb3a3f1, punto 3: el contexto del vuelo viaja con la
// solicitud, no en un mapa global que nadie borra
// ===========================================================================
// lib/home.ts tenía `clavesEnVuelo`, un Map de módulo clave fresca → cinco
// claves que crecía con cada combinación pedida y nunca se vaciaba. Ahora el
// vuelo acepta un CONTEXTO por solicitud y se lo pasa al resolver; la clave de
// coordinación sigue siendo únicamente la fresca. El líder aporta el contexto
// que se usa; los seguidores reciben el resultado del líder.
test("🔴 el vuelo pasa el contexto del LÍDER al resolver; la clave de coordinación sigue siendo la fresca", async () => {
  const be = backend();
  const vistos: string[] = [];
  const servir = crearVueloHome<Payload, string, { claves: string[] }>({
    leer: (clave) => be.b.leer<Payload>(clave),
    resolver: async (clave, prod, contexto) => { vistos.push(`${clave}|${contexto.claves.join(",")}`); await dormir(20); return prod(); },
  });
  const producir = async (): Promise<Payload> => ({ hero: [], degradado: false, n: 1 });
  const rs = await Promise.all([
    servir("home:x", producir, { claves: ["home:x", "ub:x"] }),
    servir("home:x", producir, { claves: ["home:x", "ub:x-seguidor"] }),
    servir("home:y", producir, { claves: ["home:y", "ub:y"] }),
  ]);
  assert.equal(rs.length, 3);
  assert.deepEqual(vistos.sort(), ["home:x|home:x,ub:x", "home:y|home:y,ub:y"], "un resolver por clave, con el contexto del líder");
});

test("🔴 no queda estado acumulado tras finalizar: cero vuelos en curso con la misma clave y con claves distintas", async () => {
  const be = backend();
  const servir = crearVueloHome<Payload, string, { n: number }>({
    leer: (clave) => be.b.leer<Payload>(clave),
    resolver: async (_clave, prod) => { await dormir(10); return prod(); },
  });
  const producir = async (): Promise<Payload> => ({ hero: [], degradado: false, n: 1 });
  const enCurso = Promise.all(Array.from({ length: 20 }, (_, i) => servir(`home:${i % 4}`, producir, { n: i })));
  await dormir(1);   // la lectura previa es asíncrona: recién después se entra al vuelo
  assert.ok(servir.enVuelo() > 0 && servir.enVuelo() <= 4, `en vuelo: ${servir.enVuelo()}`);
  await enCurso;
  assert.equal(servir.enVuelo(), 0, "quedó estado acumulado después de terminar");
  // Y una solicitud posterior con la misma clave NO reusa nada: vuelve a resolver.
  let resueltas = 0;
  const servir2 = crearVueloHome<Payload, string, null>({ leer: () => Promise.resolve(null), resolver: async (_c, prod) => { resueltas++; return prod(); } });
  await servir2("home:z", producir, null);
  await servir2("home:z", producir, null);
  assert.equal(resueltas, 2);
  assert.equal(servir2.enVuelo(), 0);
});

test("🔴 lib/home.ts ya no retiene un mapa global de claves en vuelo", () => {
  assert.doesNotMatch(home, /clavesEnVuelo/, "volvió el Map global que nunca se vacía");
  assert.match(home, /servirHome\(key, producirHome, claves\)/, "las cinco claves tienen que viajar como contexto de la solicitud");
});
