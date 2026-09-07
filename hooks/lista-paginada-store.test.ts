import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  VENTANA_VUELTA_MS, consumirVuelta, decidirRestauracion, guardarLista, leerLista,
  marcarVuelta, olvidarLista,
} from "./lista-paginada-store.ts";

// Mismo doble de sessionStorage que hooks/track-scroll-store.test.ts.
class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
beforeEach(() => {
  (globalThis as unknown as { sessionStorage: FakeStorage }).sessionStorage = new FakeStorage();
});

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `t${i + 1}` }));
const guardar = (clave: string, firma: string, n = 40, pagina = 2, scrollY = 900) =>
  guardarLista(clave, { firma, items: items(n), pagina, hayMas: true, scrollY });

// --- Almacén -----------------------------------------------------------------

test("guarda y devuelve la lista, la página y el scroll", () => {
  guardar("lista:x", "n,d,m");
  const e = leerLista<{ id: number }>("lista:x", "n,d,m")!;
  assert.equal(e.items.length, 40);
  assert.equal(e.pagina, 2);
  assert.equal(e.scrollY, 900);
  assert.equal(e.hayMas, true);
});

test("una vista sin nada guardado devuelve null", () => {
  assert.equal(leerLista("lista:x", "n,d,m"), null);
});

test("otra firma no restaura Y ADEMÁS olvida lo viejo", () => {
  // Las dos mitades importan. Sin la primera se restauraría una lista de otras
  // plataformas; sin la segunda, ese estado inválido quedaría esperando a la
  // próxima visita para restaurarse cuando la firma vuelva a coincidir.
  guardar("lista:x", "n,d,m");
  assert.equal(leerLista("lista:x", "n,p"), null, "no restaura con otra firma");
  assert.equal(leerLista("lista:x", "n,d,m"), null, "y tampoco quedó guardado");
});

test("cada vista tiene su propio estado", () => {
  guardar("lista:a", "f", 10);
  guardar("lista:b", "f", 30);
  assert.equal(leerLista<{ id: number }>("lista:a", "f")!.items.length, 10);
  assert.equal(leerLista<{ id: number }>("lista:b", "f")!.items.length, 30);
  olvidarLista("lista:a");
  assert.equal(leerLista("lista:a", "f"), null);
  assert.equal(leerLista<{ id: number }>("lista:b", "f")!.items.length, 30, "olvidar una no toca la otra");
});

test("un sessionStorage corrupto no rompe: se empieza limpio", () => {
  sessionStorage.setItem("yump:lista-paginada", "{ roto");
  assert.equal(leerLista("lista:x", "f"), null);
  guardar("lista:x", "f");
  assert.equal(leerLista<{ id: number }>("lista:x", "f")!.items.length, 40, "y se puede volver a guardar");
});

// --- La marca de "volví atrás" ----------------------------------------------

const LISTA = "/lista/miniseries";

test("una vuelta se consume una sola vez", () => {
  marcarVuelta(LISTA, 1000);
  assert.equal(consumirVuelta(LISTA, 1000), true);
  assert.equal(consumirVuelta(LISTA, 1000), false, "la segunda ya no: una vuelta restaura una vez");
});

test("sin vuelta previa no hay nada que consumir", () => {
  assert.equal(consumirVuelta(LISTA, 1000), false);
});

test("una marca vieja se vence sola", () => {
  marcarVuelta(LISTA, 1000);
  assert.equal(consumirVuelta(LISTA, 1000 + VENTANA_VUELTA_MS + 1), false);
  marcarVuelta(LISTA, 1000);
  assert.equal(consumirVuelta(LISTA, 1000 + VENTANA_VUELTA_MS), true, "justo en el límite todavía vale");
});

test("una vuelta atrás a OTRA página no habilita restaurar la lista", () => {
  // La regresión concreta: tengo una lista vieja guardada, uso Atrás desde
  // cualquier parte de la app hacia una página que NO es esa lista (así que
  // nadie consume la marca), y dentro de la ventana entro normalmente a la
  // lista. Con la marca siendo solo una fecha, esa vuelta ajena le restauraba el
  // estado viejo. Con la ruta adentro, la marca no es suya.
  marcarVuelta("/cuenta/lista", 1000);
  assert.equal(consumirVuelta(LISTA, 1500), false, "la marca es de otra ruta");
});

test("la marca de otra ruta NO se borra: sigue siendo de quien la generó", () => {
  // Consumirla sería tirar información de una vuelta que todavía no llegó a su
  // destino. Se vence sola.
  marcarVuelta("/lista/ultimos", 1000);
  assert.equal(consumirVuelta(LISTA, 1200), false);
  assert.equal(consumirVuelta("/lista/ultimos", 1300), true, "su dueña sí la puede consumir");
});

test("la marca vencida de la propia ruta se limpia igual", () => {
  marcarVuelta(LISTA, 1000);
  assert.equal(consumirVuelta(LISTA, 1000 + VENTANA_VUELTA_MS + 1), false, "vencida");
  // Y no queda dando vueltas para el próximo montaje.
  assert.equal(consumirVuelta(LISTA, 1000 + VENTANA_VUELTA_MS + 2), false);
});

test("una marca corrupta no rompe", () => {
  sessionStorage.setItem("yump:lista-vuelta", "{ roto");
  assert.equal(consumirVuelta(LISTA, 1000), false);
});

// --- El tipo activo es estado RESTAURABLE, no parte de la firma -------------

test("volver estando en Series restaura Series, no borra el estado", () => {
  // El bug: "Últimos lanzamientos" monta siempre con tipo `movie`. Con el tipo
  // adentro de la firma, la del montaje era `movie|n,d,m`, no coincidía con la
  // guardada `tv|n,d,m`, y `leerLista` BORRABA el estado antes de que nadie
  // pudiera leer que el toggle estaba en Series. El tipo va en `extra`.
  guardarLista<{ id: number }, { tipo: string }>("lista:ultimos", {
    firma: "n,d,m", items: items(30), pagina: 2, hayMas: true, scrollY: 900, extra: { tipo: "tv" },
  });
  const e = decidirRestauracion<{ id: number }, { tipo: string }>({
    clave: "lista:ultimos", firma: "n,d,m", volvio: true,
  });
  assert.equal(e?.extra?.tipo, "tv", "se recupera que el toggle estaba en Series");
  assert.equal(e?.items.length, 30, "y las páginas cargadas");
  assert.equal(e?.pagina, 2);
  assert.equal(e?.scrollY, 900);
});

test("cambiar de plataformas SÍ invalida, cambiar de tipo no", () => {
  const guardarConTipo = (tipo: string) => guardarLista<{ id: number }, { tipo: string }>(
    "lista:ultimos",
    { firma: "n,d,m", items: items(30), pagina: 2, hayMas: true, scrollY: 900, extra: { tipo } },
  );
  guardarConTipo("tv");
  // Otro tipo, mismas plataformas: el estado sigue siendo legible.
  assert.ok(decidirRestauracion({ clave: "lista:ultimos", firma: "n,d,m", volvio: true }));
  guardarConTipo("tv");
  // Otras plataformas: se descarta, porque la lista es literalmente otra.
  assert.equal(decidirRestauracion({ clave: "lista:ultimos", firma: "n,p", volvio: true }), null);
});

// --- La decisión -------------------------------------------------------------

test("al volver atrás se restaura lo guardado", () => {
  guardar("lista:x", "n,d,m");
  const e = decidirRestauracion<{ id: number }>({ clave: "lista:x", firma: "n,d,m", volvio: true });
  assert.equal(e?.items.length, 40);
  assert.equal(e?.pagina, 2);
});

test("entrar normalmente empieza limpio Y borra lo anterior", () => {
  guardar("lista:x", "n,d,m");
  assert.equal(decidirRestauracion({ clave: "lista:x", firma: "n,d,m", volvio: false }), null);
  // Lo importante es lo segundo: "empezar limpio" incluye no arrastrar lo
  // anterior a la vuelta siguiente. Si solo devolviera null, el estado viejo
  // quedaría ahí y la próxima vuelta atrás restauraría una lista que el usuario
  // ya había reiniciado.
  assert.equal(
    decidirRestauracion({ clave: "lista:x", firma: "n,d,m", volvio: true }), null,
    "lo anterior se borró de verdad",
  );
});

test("volver atrás con otras plataformas no restaura", () => {
  guardar("lista:x", "n,d,m");
  assert.equal(decidirRestauracion({ clave: "lista:x", firma: "n,p", volvio: true }), null);
});

test("volver atrás sin nada guardado no rompe", () => {
  assert.equal(decidirRestauracion({ clave: "lista:x", firma: "f", volvio: true }), null);
});

// ============================================================================
// La regresión del 2026-09-05: el listener llegaba TARDE
// ============================================================================
//
// ⚠️ Comprobación sobre el TEXTO de los archivos, no sobre la app montada — misma
// nota y mismo motivo que `lib/cors-inventario.test.ts`: este proyecto no tiene
// arnés de DOM. **Esto no reemplaza la prueba de navegador**, que es la que
// demostró el fallo; fija la condición estructural que lo causaba, que es lo
// único de esto que se puede probar sin un navegador.
//
// QUÉ PASABA. El listener de `popstate` se registraba al evaluar este módulo, y
// este módulo viaja en el chunk de cada ruta que lo importa: se registraba recién
// cuando esa ruta se cargaba, o sea DESPUÉS del listener de `AppRouter` de Next
// —que se registra en un efecto de arranque y que, adentro de su propio handler,
// monta la ruta restaurada—. Medido en el navegador: la vista preguntaba "¿volví?"
// 4,5 ms ANTES de que la marca existiera, se respondía que no, y
// `decidirRestauracion` además tiraba el snapshot.
//
// Lo que impide que vuelva: `registrarVueltaAtras()` llamado en el SCOPE DEL
// MÓDULO de un componente del layout raíz. Si alguien lo mueve adentro de un
// `useEffect`, o lo saca, la restauración se rompe otra vez en toda la app.

const fuenteNavHistorial = fs.readFileSync(
  path.join(process.cwd(), "components", "NavHistorial.tsx"), "utf8");

test("REGRESIÓN: NavHistorial registra el listener de vuelta", () => {
  assert.match(fuenteNavHistorial, /import \{[^}]*registrarVueltaAtras[^}]*\} from "@\/hooks\/lista-paginada-store"/,
    "NavHistorial dejó de importar el registro: la marca de vuelta va a llegar tarde");
  assert.match(fuenteNavHistorial, /^registrarVueltaAtras\(\);$/m,
    "la llamada no está en el scope del módulo");
});

test("REGRESIÓN: la llamada NO puede estar dentro de un hook", () => {
  // Adentro de `useEffect` correría después del efecto de `AppRouter`, que es
  // exactamente el orden que causaba el fallo.
  const dentroDeHook = /use(Effect|LayoutEffect)\([^)]*\{[^}]*registrarVueltaAtras/s.test(fuenteNavHistorial);
  assert.equal(dentroDeHook, false,
    "registrarVueltaAtras() quedó dentro de un efecto: vuelve el fallo de orden");
});

test("REGRESIÓN: NavHistorial sigue montado en el layout raíz", () => {
  const layout = fs.readFileSync(path.join(process.cwd(), "app", "layout.tsx"), "utf8");
  assert.match(layout, /import NavHistorial from "@\/components\/NavHistorial"/);
  assert.match(layout, /<NavHistorial\s*\/>/,
    "si NavHistorial sale del layout, nadie registra el listener al arrancar");
});

test("sin window, registrarVueltaAtras no hace nada y no explota (el caso SSR)", async () => {
  const mod = await import("./lista-paginada-store.ts");
  assert.equal(typeof mod.registrarVueltaAtras, "function");
  assert.equal("window" in globalThis, false, "el entorno del test dejó de ser SSR-like");
  assert.doesNotThrow(() => { mod.registrarVueltaAtras(); mod.registrarVueltaAtras(); });
});

test("CON window, se registra UN solo listener de popstate por más que se llame de más", async () => {
  // Lo que el test anterior NO probaba: que la idempotencia sirva para algo. Sin
  // `window`, las dos llamadas salen por el guard y no dicen nada del navegador.
  // Acá se monta un `window` mínimo y se CUENTA cuántas veces se registró, que es
  // la propiedad que importa: el layout llama a `registrarVueltaAtras()` y el
  // módulo también lo hace al evaluarse, así que sin la guarda habría dos.
  const registros: string[] = [];
  const g = globalThis as unknown as { window?: unknown };
  g.window = {
    addEventListener: (ev: string) => { registros.push(ev); },
    location: { pathname: "/x" },
  };
  try {
    // Hace falta una evaluación NUEVA del módulo para observar el registro que
    // ocurre al importarlo; de ahí el parámetro que rompe la caché de módulos.
    // El especificador va en una variable a propósito: así no es un import
    // estático que `tsc` intente resolver.
    const especificador = "./lista-paginada-store.ts?conWindow=1";
    const mod = await import(especificador) as { registrarVueltaAtras: () => void };
    assert.deepEqual(registros, ["popstate"],
      "el módulo no registró al evaluarse, o registró de más");
    mod.registrarVueltaAtras();
    mod.registrarVueltaAtras();
    mod.registrarVueltaAtras();
    assert.deepEqual(registros, ["popstate"],
      `quedaron ${registros.length} listeners: la guarda de idempotencia no sirve`);
  } finally {
    delete g.window;
  }
});
