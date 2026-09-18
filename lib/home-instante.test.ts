// Etapa 2 (#17), auditoría final de Codex sobre 82842a5: UN solo instante por
// solicitud del Home.
//
// `homePayload` consultaba el reloj tres veces: `homeKey` → `dailySeed()`,
// `clavesDelHome` → otro `dailySeed()`, y el resolver → `hoyAR()`. Si la
// medianoche argentina caía entre dos de esas lecturas, la clave de
// coordinación, la fresca/turno/degradado del contexto y el `dia` de la
// generación podían pertenecer a días distintos: se rompía la identidad de
// coordinación (dos solicitudes del mismo instante con claves distintas
// esquivan el single-flight), los logs mentían y el fencing diario —lo que la
// Etapa 2 protege justo en ese límite— quedaba débil.
//
// Ahora hay UN instante (`instanteHome`) capturado al entrar, y de él salen el
// día, la semilla, las cinco claves y la clave del vuelo (= `claves.fresca`).
// Todo en un módulo puro para poder forzar el cruce de medianoche sin tocar el
// reloj global. Escrito ANTES del módulo: fallaba al importar contra 82842a5.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clavesDelHome, instanteHome } from "./home-instante.ts";
import { claveHome, claveHomeDegradado, claveHomeGeneracion, claveHomeUltimoBueno, claveTurnoHome } from "./claves.ts";
import { dailySeed, hoyAR } from "./fecha.ts";
import { HUELLA_IDIOMA } from "./idioma.ts";
import { servirConTurno } from "./home-servir.ts";
import { crearTurno } from "./turno.ts";
import { crearOpsEnMemoria, type Entrada } from "./turno-memoria.ts";

// Argentina es UTC−3: 02:59:59Z del 14 es 23:59:59 del 13 en AR; 03:00:00Z es 00:00:00 del 14.
const ANTES = new Date("2026-09-14T02:59:59Z");
const DESPUES = new Date("2026-09-14T03:00:00Z");

test("🔴 un instante = un día y su semilla, los mismos que hoyAR/dailySeed para esa fecha", () => {
  const a = instanteHome(ANTES);
  assert.equal(a.dia, "2026-09-13");
  assert.equal(a.dia, hoyAR(ANTES));
  assert.equal(a.semilla, dailySeed(ANTES));
  const d = instanteHome(DESPUES);
  assert.equal(d.dia, "2026-09-14");
  assert.notEqual(d.semilla, a.semilla);
});

test("🔴 las cinco claves y el día salen del MISMO instante: fresca/turno/degradado con la misma semilla; ub/gen sin ella", () => {
  const a = instanteHome(ANTES);
  const c = clavesDelHome(a, "d,m,n", "");
  const H = HUELLA_IDIOMA;
  // Byte a byte contra los constructores con la semilla del instante.
  assert.equal(c.fresca, claveHome(a.semilla, "d,m,n", "", H));
  assert.equal(c.turno, claveTurnoHome(a.semilla, "d,m,n", "", H));
  assert.equal(c.degradado, claveHomeDegradado(a.semilla, "d,m,n", "", H));
  assert.equal(c.ub, claveHomeUltimoBueno("d,m,n", "", H));
  assert.equal(c.gen, claveHomeGeneracion("d,m,n", "", H));
  for (const k of [c.fresca, c.turno, c.degradado]) assert.ok(k.includes(`:${a.semilla}:`), k);
  for (const k of [c.ub, c.gen]) assert.ok(!k.includes(`:${a.semilla}:`), k);
  assert.equal(c.dia, a.dia);
  assert.equal(c.semilla, a.semilla);
});

test("🔴 cruce de medianoche ENTRE lecturas del reloj: con un solo instante no puede pasar", () => {
  // Lo que pasaba en 82842a5, reproducido: cada lectura del reloj podía caer
  // de un lado distinto de la medianoche.
  const claveDeAyer = claveHome(dailySeed(ANTES), "d,m,n", "", HUELLA_IDIOMA);
  const turnoDeHoy = claveTurnoHome(dailySeed(DESPUES), "d,m,n", "", HUELLA_IDIOMA);
  assert.ok(!turnoDeHoy.includes(`:${dailySeed(ANTES)}:`), "dos lecturas del reloj = dos semillas: el turno no coordina la fresca");
  // Con el instante capturado una vez, las cinco claves comparten semilla aunque
  // el reloj YA haya cruzado: no hay segunda lectura.
  const instante = instanteHome(ANTES);
  const c = clavesDelHome(instante, "d,m,n", "");
  assert.equal(c.fresca, claveDeAyer);
  assert.ok(c.turno.includes(`:${instante.semilla}:`));
  assert.equal(c.dia, "2026-09-13");
});

function mundo() {
  const store = new Map<string, Entrada>();
  const ops = crearOpsEnMemoria(store);
  const turno = crearTurno(ops);
  const vivo = (k: string) => { const e = store.get(k); return e ? e.v : null; };
  const leer = async (ks: string[]) => ks.map((k) => vivo(k) as { de: string } | null);
  return { store, turno, leer, vivo };
}

test("🔴 una solicitud iniciada ANTES de medianoche conserva el día anterior aunque la composición termine después", async () => {
  const w = mundo();
  const instante = instanteHome(ANTES);            // capturado al entrar
  const c = clavesDelHome(instante, "d,m,n", "");
  let relojDuranteLaComposicion = ANTES;
  const valor = await servirConTurno<{ de: string }>({
    claves: c, propietario: "A", dia: c.dia, ttl: { fresca: 60, ub: 60 }, leer: w.leer, turno: w.turno,
    producir: async () => { relojDuranteLaComposicion = DESPUES; return { valor: { de: "A" }, fallo: false }; },
    vacio: () => ({ de: "vacio" }),
  });
  assert.equal(valor.de, "A");
  assert.equal(hoyAR(relojDuranteLaComposicion), "2026-09-14", "el reloj cruzó durante la composición");
  // Y sin embargo lo publicado es coherente con el instante capturado:
  assert.equal(w.vivo(c.gen), "2026-09-13:A", "la generación lleva el día del instante, no el del reloj al terminar");
  assert.ok(w.store.has(c.fresca), "la fresca es la de la semilla de ayer (la que se pidió)");
  assert.equal(w.store.has(c.turno), false);
});

test("🔴 una solicitud iniciada DESPUÉS usa coherentemente el nuevo día: otra fresca, otro turno, gen nueva; el UB es compartido", async () => {
  const w = mundo();
  const ayer = clavesDelHome(instanteHome(ANTES), "d,m,n", "");
  const hoy = clavesDelHome(instanteHome(DESPUES), "d,m,n", "");
  assert.notEqual(hoy.fresca, ayer.fresca);
  assert.notEqual(hoy.turno, ayer.turno);
  assert.notEqual(hoy.degradado, ayer.degradado);
  assert.equal(hoy.ub, ayer.ub, "el UB no lleva semilla: sobrevive a la medianoche");
  assert.equal(hoy.gen, ayer.gen);
  await servirConTurno<{ de: string }>({ claves: hoy, propietario: "B", dia: hoy.dia, ttl: { fresca: 60, ub: 60 }, leer: w.leer, turno: w.turno, producir: async () => ({ valor: { de: "B" }, fallo: false }), vacio: () => ({ de: "vacio" }) });
  assert.equal(w.vivo(hoy.gen), "2026-09-14:B");
  // E-medianoche del banco, en puro: el propietario viejo termina después y no pisa el UB ni la gen nuevos.
  const r = await w.turno.publicar({ claves: { turno: ayer.turno, fresca: ayer.fresca, ub: ayer.ub, gen: ayer.gen }, propietario: "A", payload: '{"de":"A"}', ttlFresca: 60, ttlUb: 60, dia: ayer.dia });
  assert.equal(r, "rechazado", "sin turno de ayer no publica; con turno daría -1 (sólo su fresca)");
  await w.turno.tomar({ clave: ayer.turno, propietario: "A", px: 1000 });
  const r2 = await w.turno.publicar({ claves: { turno: ayer.turno, fresca: ayer.fresca, ub: ayer.ub, gen: ayer.gen }, propietario: "A", payload: '{"de":"A"}', ttlFresca: 60, ttlUb: 60, dia: ayer.dia });
  assert.equal(r2, "publicada-solo-fresca");
  assert.equal(w.vivo(hoy.gen), "2026-09-14:B", "la generación nueva queda");
  assert.deepEqual(w.vivo(hoy.ub), { de: "B" }, "el UB nuevo queda");
});

test("🔴 sin fecha, instanteHome respeta la fecha forzada del banco (hoyAR() sin argumentos)", () => {
  // No se puede forzar acá sin tocar el entorno global; se fija por estructura:
  // con `ahora` ausente, el día sale de `hoyAR()` a secas, que es el que honra
  // YUMP_FECHA (E-medianoche del banco).
  const src = readFileSync("lib/home-instante.ts", "utf8");
  assert.match(src, /hoyAR\(ahora\)/);
  const i = instanteHome();
  assert.equal(i.dia, hoyAR());
  assert.equal(i.semilla, dailySeed());
});

// --- lib/home.ts: un instante, y nada más --------------------------------------
const sinComentarios = (rel: string) => readFileSync(rel, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const home = sinComentarios("lib/home.ts");

test("🔴 lib/home.ts captura UN instante por solicitud y deriva de él las claves, la clave del vuelo y el día del contexto", () => {
  assert.equal((home.match(/\binstanteHome\(\)/g) ?? []).length, 1, "tiene que haber exactamente una lectura del reloj por solicitud");
  assert.match(home, /const instante = instanteHome\(\);\s*return clavesDelHome\(instante, /, "las cinco claves no salen del instante capturado");
  assert.match(home, /const claves = clavesDeLaSolicitud\(providers, types\);\s*const key = claves\.fresca;/, "la clave de coordinación no es la fresca del instante");
  assert.match(home, /servirHome\(claves\.fresca, producirHome, contexto\)/, "la clave de coordinación tiene que ser exactamente claves.fresca");
  assert.ok(home.includes("const contexto: ContextoHome = { ...claves, inicioRuta: inicio, plazo: inicio + CONSTANTES.PRESUPUESTO_REQUEST_MS };"), "el contexto son las cinco claves del instante más el plazo y el inicio de la ruta (3.c.1)");
  assert.match(home, /dia: claves\.dia/, "el día del contexto tiene que ser el del instante");
  assert.doesNotMatch(home, /dia: hoyAR\(\)/, "el resolver vuelve a leer el reloj");
  assert.doesNotMatch(home, /function homeKey\(/, "queda un camino separado para la clave fresca");
  // `dailySeed()` sigue existiendo en la COMPOSICIÓN (semillas de los rieles):
  // no es la identidad de coordinación y es anterior a la Etapa 2. Lo que no
  // puede haber es un `dailySeed()` en la construcción de las claves.
  const i = home.indexOf("export async function homePayload");
  assert.doesNotMatch(home.slice(i), /dailySeed\(\)|hoyAR\(\)/, "homePayload lee el reloj por su cuenta");
});
