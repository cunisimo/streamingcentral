// La ficha de persona en el cliente (lib/filmografia-cliente.ts): cuántas
// peticiones hace cada gesto. El transporte es un doble que CUENTA cada
// petición y deja resolverlas en el orden que el test quiera.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  crearControladorFilmografia, ErrorDeRed, urlApertura, urlItems, type EstadoFilmografia, type Transporte,
} from "./filmografia-cliente.ts";
import { claveDe, ordenVisible } from "./filmografia-bloques.ts";
import type { FilmografiaPersona, ObraPersona, PlatformCode } from "./types.ts";

const obra = (id: number): ObraPersona => ({
  id, type: "movie", title: `Obra ${id}`, year: null, fecha: `${2100 - id}-01-01`, poster: null,
  country: null, genres: [], tmdb: null, votos: 1, hasEditorial: false, roles: ["X"],
});
function filmografia(personId: number, n = 60): FilmografiaPersona {
  const actuacion = Array.from({ length: n }, (_, i) => obra(personId * 1000 + i + 1));
  const disponibilidad: Record<string, PlatformCode[]> = {};
  actuacion.slice(0, 12).forEach((o, i) => { disponibilidad[claveDe(o)] = i % 3 === 0 ? ["n"] : ["m"]; });
  return {
    person: { id: personId, name: `P${personId}`, profile: null, knownFor: [] },
    secciones: ["actuacion"], direccion: [], actuacion, inicial: { direccion: 0, actuacion: 12 },
    disponibilidad, sinDisponibilidad: [],
  };
}

// Transporte doble: registra cada petición y la deja pendiente hasta resolverla.
function transporteDoble() {
  const pedidos: { ruta: string; resolver: (v: unknown) => void; rechazar: (e: unknown) => void; senal: AbortSignal }[] = [];
  const t: Transporte = {
    pedir: <T,>(ruta: string, senal: AbortSignal) => new Promise<T>((resolver, rechazar) => {
      pedidos.push({ ruta, resolver: resolver as (v: unknown) => void, rechazar, senal });
    }),
  };
  return { t, pedidos };
}
function responderItems(ruta: string, plat: PlatformCode[] = ["d"]) {
  const claves = new URL(ruta, "http://x").searchParams.get("items")!.split(",");
  return { disponibilidad: Object.fromEntries(claves.map((k) => [k, plat])), sinDisponibilidad: [] };
}

test("abrir: UNA petición, con el contrato v2 explícito", async () => {
  const { t, pedidos } = transporteDoble();
  const c = crearControladorFilmografia(t, () => {});
  const p = c.abrir("31");
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].ruta, "/api/person/31?filmografia=v2");
  assert.equal(pedidos[0].ruta, urlApertura("31"));
  pedidos[0].resolver(filmografia(31));
  await p;
  assert.equal(c.estado().fase, "lista");
  assert.equal(c.estado().vista!.visibles.actuacion, 12);
});

test("🔴 cambiar plataformas: CERO peticiones de persona, créditos o disponibilidad; reordena sin colapsar ni perder nada", async () => {
  const { t, pedidos } = transporteDoble();
  const c = crearControladorFilmografia(t, () => {});
  const abrir = c.abrir("31"); pedidos[0].resolver(filmografia(31)); await abrir;
  const mas = c.verMas("actuacion"); pedidos[1].resolver(responderItems(pedidos[1].ruta, ["d"])); await mas;
  const antes = c.estado();
  const pedidosAntes = pedidos.length;
  assert.equal(pedidosAntes, 2);

  // Lo que hace la vista al cambiar las plataformas: volver a dibujar con otras.
  // El controlador no las conoce, así que no hay nada que pueda disparar una petición.
  const v = antes.vista!;
  const claves = v.base.actuacion.map(claveDe);
  const conNetflix = ordenVisible(claves, v.base.inicial.actuacion, v.visibles.actuacion, (k) => v.disp[k], ["n"]);
  const conDisney = ordenVisible(claves, v.base.inicial.actuacion, v.visibles.actuacion, (k) => v.disp[k], ["d"]);

  assert.equal(pedidos.length, pedidosAntes, "ninguna petición nueva");
  assert.strictEqual(c.estado(), antes, "el estado ni se tocó");
  assert.equal(c.estado().vista!.visibles.actuacion, 36, "'Ver más' no se reinicia");
  assert.equal(Object.keys(c.estado().vista!.disp).length, 36, "no se pierde nada resuelto");
  assert.equal(conNetflix.length, 36);
  assert.equal(conDisney.length, 36);
  assert.notDeepEqual(conNetflix, conDisney, "el orden sí cambia");
  assert.deepEqual([...conNetflix].sort(), [...conDisney].sort(), "las mismas obras");
});

test("la vista no usa useApi ni pide la ficha con las plataformas (el pedido depende sólo del id)", () => {
  const vista = readFileSync(new URL("../components/PersonView.tsx", import.meta.url), "utf8");
  const codigo = vista.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(codigo, /useApi/, "useApi re-pide al cambiar las plataformas");
  assert.doesNotMatch(codigo, /\/api\/person/, "las URLs las arma el controlador (v2 explícito)");
  assert.doesNotMatch(codigo, /providers=/);
  // El efecto que abre o restaura depende SÓLO de [id].
  const efecto = /useEffect\(\(\) => \{\s*const c = ctrl\.current!;[\s\S]*?\}, \[([^\]]*)\]\);/.exec(codigo);
  assert.ok(efecto, "no se encontró el efecto de apertura");
  assert.equal(efecto![1].trim(), "id");
});

test("'Ver más': una petición con las 24 siguientes; nunca repite una obra resuelta", async () => {
  const { t, pedidos } = transporteDoble();
  const c = crearControladorFilmografia(t, () => {});
  const a = c.abrir("31"); pedidos[0].resolver(filmografia(31, 50)); await a;
  const m1 = c.verMas("actuacion");
  const items1 = new URL(pedidos[1].ruta, "http://x").searchParams.get("items")!.split(",");
  assert.equal(items1.length, 24);
  assert.ok(pedidos[1].ruta.startsWith("/api/person/31?filmografia=v2&items="));
  pedidos[1].resolver(responderItems(pedidos[1].ruta)); await m1;
  const m2 = c.verMas("actuacion");
  const items2 = new URL(pedidos[2].ruta, "http://x").searchParams.get("items")!.split(",");
  assert.equal(items2.length, 14, "sólo lo que resta (50 − 36)");
  assert.equal(items1.filter((k) => items2.includes(k)).length, 0);
  pedidos[2].resolver(responderItems(pedidos[2].ruta)); await m2;
  await c.verMas("actuacion");
  assert.equal(pedidos.length, 3, "sin nada más para ver, no pide");
});

test("volver desde una ficha (restaurar): CERO peticiones", () => {
  const { t, pedidos } = transporteDoble();
  const c = crearControladorFilmografia(t, () => {});
  const base = filmografia(31);
  c.restaurar("31", { base, disp: base.disponibilidad, sinDatos: [], visibles: { direccion: 0, actuacion: 36 } });
  assert.equal(pedidos.length, 0);
  assert.equal(c.estado().vista!.visibles.actuacion, 36);
});

test("cambio rápido de persona: la respuesta de la anterior no se aplica sobre la nueva", async () => {
  const { t, pedidos } = transporteDoble();
  const estados: EstadoFilmografia[] = [];
  const c = crearControladorFilmografia(t, (e) => estados.push(e));
  const a = c.abrir("31");
  const b = c.abrir("2231");
  assert.equal(pedidos[0].senal.aborted, true, "la de 31 se cancela");
  pedidos[1].resolver(filmografia(2231));
  pedidos[0].resolver(filmografia(31)); // llega DESPUÉS
  await Promise.all([a, b]);
  assert.equal(c.estado().personId, "2231");
  assert.equal(c.estado().vista!.base.person.id, 2231);
  assert.ok(estados.every((e) => e.vista === null || e.vista.base.person.id === 2231), "31 nunca se mostró");
});

test("un 'Ver más' en vuelo de la persona anterior no se aplica sobre la nueva", async () => {
  const { t, pedidos } = transporteDoble();
  const c = crearControladorFilmografia(t, () => {});
  const a = c.abrir("31"); pedidos[0].resolver(filmografia(31)); await a;
  const mas = c.verMas("actuacion");               // pedidos[1], de 31
  const b = c.abrir("2231"); pedidos[2].resolver(filmografia(2231)); await b;
  pedidos[1].resolver(responderItems(pedidos[1].ruta)); // llega tarde
  await mas;
  assert.equal(c.estado().vista!.base.person.id, 2231);
  assert.equal(c.estado().vista!.visibles.actuacion, 12, "no abrió el bloque de otra persona");
  assert.ok(Object.keys(c.estado().vista!.disp).every((k) => Number(k.split(":")[1]) > 2231000));
});

test("un fallo de 'Ver más' abre igual el bloque, con 'sin datos'; reintentar pide sólo esas", async () => {
  const { t, pedidos } = transporteDoble();
  const c = crearControladorFilmografia(t, () => {});
  const a = c.abrir("31"); pedidos[0].resolver(filmografia(31)); await a;
  const m = c.verMas("actuacion"); pedidos[1].rechazar(new Error("HTTP 500")); await m;
  const v = c.estado().vista!;
  assert.equal(v.visibles.actuacion, 36, "los créditos básicos no se pierden");
  assert.equal(v.sinDatos.length, 24);
  const r = c.reintentar("actuacion");
  assert.equal(new URL(pedidos[2].ruta, "http://x").searchParams.get("items")!.split(",").length, 24);
  pedidos[2].resolver(responderItems(pedidos[2].ruta)); await r;
  assert.equal(c.estado().vista!.sinDatos.length, 0);
});

test("apertura sin conexión → 'offline'; con error HTTP → 'error' (y reintentar vuelve a pedir)", async () => {
  const { t, pedidos } = transporteDoble();
  const c = crearControladorFilmografia(t, () => {});
  const a = c.abrir("31"); pedidos[0].rechazar(new ErrorDeRed("sin red")); await a;
  assert.equal(c.estado().fase, "offline");
  const b = c.abrir("31"); pedidos[1].rechazar(new Error("HTTP 500")); await b;
  assert.equal(c.estado().fase, "error");
  assert.equal(pedidos.length, 2);
});

test("las URLs llevan la versión y codifican el id", () => {
  assert.equal(urlItems("31", ["movie:1", "tv:2"]), "/api/person/31?filmografia=v2&items=movie:1,tv:2");
  assert.equal(urlApertura("a/b"), "/api/person/a%2Fb?filmografia=v2");
});
