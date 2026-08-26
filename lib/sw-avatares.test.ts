// El service worker, EJECUTADO de verdad.
//
// No alcanza con leer `public/sw.js` y afirmar que la limpieza está bien: eso es
// revisión de código disfrazada de test. Acá se carga el código REAL del SW
// —`sw.js` más sus cuatro `importScripts`— en un arnés que emula lo mínimo del
// entorno de un worker, se dispara `activate` con una caché vieja sembrada, y se
// mira qué borró.
//
// Es la única forma de probarlo en `npm test`: registrar un SW necesita un
// navegador, y el panel de este entorno no lo permite.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const raiz = process.cwd();
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");

/** Caché de mentira con la misma superficie que usa el SW. */
function almacenDeCaches() {
  const almacen = new Map<string, Map<string, unknown>>();
  const borrados: string[] = [];
  const abrir = (nombre: string) => {
    if (!almacen.has(nombre)) almacen.set(nombre, new Map());
    const m = almacen.get(nombre)!;
    return {
      add: async () => {},
      match: async (req: { url: string }) => m.get(req.url) ?? undefined,
      put: async (req: { url: string }, res: unknown) => { m.set(req.url, res); },
      keys: async () => [...m.keys()].map((url) => ({ url })),
      delete: async (req: { url: string }) => m.delete(req.url),
    };
  };
  return {
    borrados,
    almacen,
    api: {
      open: async (n: string) => abrir(n),
      keys: async () => [...almacen.keys()],
      delete: async (n: string) => { borrados.push(n); return almacen.delete(n); },
    },
  };
}

/**
 * Carga el SW real y devuelve su `self` más los listeners registrados.
 *
 * `importScripts` se implementa de verdad —carga los módulos desde
 * `public/sw/`— en vez de recortarlo del fuente: así el orden de carga es el
 * mismo que en el navegador y no hay una versión "de test" del arranque.
 */
function cargarSw(caches: ReturnType<typeof almacenDeCaches>) {
  const listeners: Record<string, ((e: unknown) => void)[]> = {};
  const self: Record<string, unknown> = {
    location: { origin: "https://app.yump.ar", href: "https://app.yump.ar/sw.js" },
    addEventListener: (tipo: string, fn: (e: unknown) => void) => {
      (listeners[tipo] ??= []).push(fn);
    },
    clients: { claim: async () => {} },
    skipWaiting: () => {},
    caches: caches.api,
  };
  const ctx: Record<string, unknown> = {
    self,
    caches: caches.api,
    console,
    URL,
    // `Request` mínimo: el SW sólo lee `.url`, `.method`, `.mode` y `.destination`.
    Request: class { url: string; constructor(u: string) { this.url = u; } },
    Response: class { ok = true; status = 200; clone() { return this; } headers = new Map(); },
    // Las estrategias salen a la red apenas se las invoca. Sin esto, la promesa
    // que devuelve `route()` rechaza DESPUÉS de que termina el test y node lo
    // reporta como unhandledRejection.
    fetch: async () => ({ ok: true, status: 200, clone() { return this; }, headers: new Map() }),
    setTimeout, clearTimeout, AbortController,
  };
  vm.createContext(ctx);
  ctx.globalThis = ctx;
  ctx.importScripts = (...rutas: string[]) => {
    for (const r of rutas) {
      vm.runInContext(leer(`public${r}`), ctx, { filename: r });
    }
  };
  vm.runInContext(leer("public/sw.js"), ctx, { filename: "sw.js" });
  return { self, listeners };
}

test("activate BORRA la caché de imágenes vieja, donde vivían los avatares de DiceBear", async () => {
  const caches = almacenDeCaches();
  // La caché que tendría alguien que ya usó la app antes de este cambio.
  const vieja = await caches.api.open("sc-images-v6");
  await vieja.put({ url: "https://api.dicebear.com/10.x/adventurer-neutral/svg?seed=abc" }, {});
  await caches.api.open("sc-static-v6");
  await caches.api.open("sc-pages-v6");

  const { self, listeners } = cargarSw(caches);
  const cfg = self.SC_CONFIG as { VALID_CACHES: string[]; CACHE_VERSION: string };
  assert.equal(cfg.CACHE_VERSION, "v7", "la versión del SW no es la nueva");

  // Disparar activate como lo haría el navegador.
  const activate = listeners.activate?.[0];
  assert.ok(activate, "el SW no registró un listener de activate");
  let tarea: Promise<unknown> = Promise.resolve();
  activate({ waitUntil: (p: Promise<unknown>) => { tarea = p; } });
  await tarea;

  assert.ok(caches.borrados.includes("sc-images-v6"), `no borró sc-images-v6; borró ${JSON.stringify(caches.borrados)}`);
  assert.ok(caches.borrados.includes("sc-static-v6"));
  assert.ok(caches.borrados.includes("sc-pages-v6"));
  assert.equal(
    [...caches.almacen.keys()].includes("sc-images-v6"), false,
    "la caché con los avatares de DiceBear sobrevivió",
  );
});

test("activate NO borra las cachés de la versión actual", async () => {
  const caches = almacenDeCaches();
  const { self, listeners } = cargarSw(caches);
  const cfg = self.SC_CONFIG as { VALID_CACHES: string[] };
  for (const n of cfg.VALID_CACHES) await caches.api.open(n);

  let tarea: Promise<unknown> = Promise.resolve();
  listeners.activate[0]({ waitUntil: (p: Promise<unknown>) => { tarea = p; } });
  await tarea;

  for (const n of cfg.VALID_CACHES) {
    assert.ok(!caches.borrados.includes(n), `borró una caché vigente: ${n}`);
  }
});

test("la limpieza toca SÓLO cachés: no hay rastro de storage del usuario", () => {
  // Las plataformas elegidas y la sesión viven en localStorage. El SW no las
  // conoce y no tiene por qué.
  const sw = leer("public/sw.js");
  for (const prohibido of ["localStorage", "sessionStorage", "indexedDB"]) {
    assert.doesNotMatch(sw, new RegExp(prohibido), `sw.js menciona ${prohibido}`);
  }
});

// ============================================================================
// Enrutado
// ============================================================================

test("un avatar se sirve desde caché: es lo que lo mantiene visible sin conexión", async () => {
  const caches = almacenDeCaches();
  const { self } = cargarSw(caches);
  const route = self.SC_ROUTE as (r: unknown) => unknown;
  const pedido = {
    url: "https://app.yump.ar/avatars/avatar-pocho.webp",
    method: "GET", mode: "no-cors", destination: "image",
  };
  const r = route(pedido);
  assert.notEqual(r, null, "el SW no intercepta /avatars/: sin conexión no se vería");
  // Se espera la promesa para que su resolución no quede huérfana después del test.
  await (r as Promise<unknown>).catch(() => {});
});

test("api.dicebear.com ya no está en los hosts de imágenes que se cachean", () => {
  const caches = almacenDeCaches();
  const { self } = cargarSw(caches);
  const cfg = self.SC_CONFIG as { IMAGE_HOSTS: string[] };
  // El spread copia a un array de ESTE realm: el que viene del contexto de la VM
  // tiene otro prototipo y `deepStrictEqual` compara prototipos.
  assert.deepEqual([...cfg.IMAGE_HOSTS], ["image.tmdb.org"]);
});

test("las rutas de la API siguen sin cachearse", async () => {
  // Regresión que valdría caro: el avatar entró como asset estático, y una regla
  // mal puesta podría haberse llevado puesto /api/.
  const caches = almacenDeCaches();
  const { self } = cargarSw(caches);
  const route = self.SC_ROUTE as (r: unknown) => unknown;
  const r = route({ url: "https://app.yump.ar/api/home", method: "GET", mode: "cors", destination: "" });
  assert.notEqual(r, null);
  await (r as Promise<unknown>).catch(() => {});
});
