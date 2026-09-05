// La coordinación entre el arranque y el cambio de filtro, con los cierres reales.
//
// ⚠️ POR QUÉ HACE FALTA ESTO Y NO ALCANZA CON PROBAR `iniciar()` Y
// `decidirCambioDeFiltro()` POR SEPARADO. Las dos funciones son correctas por su
// cuenta; lo que puede fallar es CUÁNDO corre cada efecto y con qué valores. Un
// efecto ve los valores del render en el que se creó, así que un `setFiltro("tv")`
// hecho por el efecto de arranque NO cambia el `filtro` que ve el efecto de abajo
// **en esa misma ronda**: sigue viendo el del render anterior. Y este proyecto no
// tiene arnés de DOM (misma nota que `lib/legal.test.ts`), así que sin una máquina
// de estados eso no se puede observar.
//
// El modelo de acá abajo respeta las cuatro reglas que importan:
//
//   1. Los efectos corren en orden de declaración.
//   2. Un efecto sólo vuelve a correr si cambió alguna de sus dependencias
//      (comparación por identidad, como React).
//   3. Cuando corre, usa el CIERRE DEL RENDER EN CURSO — no ve los `set*` que
//      otro efecto acaba de hacer en la misma ronda.
//   4. Los refs sobreviven a los renders y no los disparan.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidirCambioDeFiltro, estadoFiltroInicial, estadoTandaInicial, iniciar,
  type EstadoFiltro, type EstadoTanda,
} from "./filtro-paginado-nucleo.ts";

type Filtro = "all" | "movie" | "tv";
interface Snapshot { filtro: Filtro; items: string[]; pagina: number; scrollY: number }

/** Un efecto tal como React lo registra: sus dependencias y su cierre. */
interface Efecto { deps: unknown[]; correr: () => void }

const mismasDeps = (a: unknown[] | null, b: unknown[]) =>
  a !== null && a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * El componente, modelado.
 *
 * `version`: "vieja" usa el efecto de cambio de filtro (lo que la auditoría
 * cuestionó); "nueva" mueve el cambio al handler del click.
 *
 * `reiniciarEstable`: si es false, `reiniciar` cambia de identidad en cada
 * render. Es lo que hoy garantiza `useCallback([clave])` con una clave constante,
 * pero NADA lo verifica — y de eso depende que la versión vieja funcione.
 */
function montar(opts: {
  snapshot: Snapshot | null;
  version: "vieja" | "nueva";
  reiniciarEstable?: boolean;
  strictMode?: boolean;
}) {
  const estable = opts.reiniciarEstable ?? true;

  // --- estado y refs -------------------------------------------------------
  let filtro: Filtro = "all";
  let items: string[] = [];
  let tanda: EstadoTanda = estadoTandaInicial;
  let scrollY = 0;
  // `useListaPaginada`
  let fase: "decidiendo" | "listo" = "decidiendo";
  let inicial: Snapshot | null = null;
  let marcaDeVuelta = opts.snapshot !== null;   // `consumirVuelta` la consume UNA vez

  const arrancado = { current: false };
  const estadoFiltro = { current: estadoFiltroInicial as EstadoFiltro };
  const filtroVigente = { current: "all" as Filtro };

  const pedidos: string[] = [];
  const bitacora: string[] = [];
  let sucio = false;
  const set = <T,>(nombre: string, valor: T, aplicar: (v: T) => void) => {
    aplicar(valor); sucio = true; bitacora.push(`    set${nombre}(${JSON.stringify(valor)})`);
  };
  const load = (f: Filtro, p: number) => {
    pedidos.push(`${f}:${p}`); bitacora.push(`    load(${f}, ${p})`);
  };
  const reiniciar = () => { scrollY = 0; bitacora.push("    reiniciar() -> scroll 0"); };

  // --- el render: arma los efectos con los valores DE ESTE render ----------
  let previas: (unknown[] | null)[] = [null, null, null];
  let identidadReiniciar = {};

  const render = (etiqueta: string): Efecto[] => {
    bitacora.push(`  --- render ${etiqueta} (filtro=${filtro}, fase=${fase}, inicial=${inicial ? inicial.filtro : "null"}) ---`);
    if (!estable) identidadReiniciar = {};      // identidad nueva en cada render
    const rein = identidadReiniciar;
    filtroVigente.current = filtro;             // igual que en el componente

    // [0] el efecto de decisión de `useListaPaginada`
    const decidir: Efecto = {
      deps: ["proximamente"],
      correr: () => {
        const vino = marcaDeVuelta;
        marcaDeVuelta = false;                  // `consumirVuelta` consume la marca
        const e = vino ? opts.snapshot : null;
        bitacora.push(`    [useListaPaginada] volvio=${vino} -> inicial=${e ? e.filtro : "null"}`);
        if (e) { set("Inicial", e, (v) => { inicial = v; }); scrollY = e.scrollY; }
        set("Fase", "listo" as const, (v) => { fase = v; });
      },
    };

    // [1] el arranque
    const faseDelRender = fase, inicialDelRender = inicial;
    const arranque: Efecto = {
      deps: [faseDelRender, inicialDelRender],
      correr: () => {
        if (faseDelRender !== "listo" || arrancado.current) {
          bitacora.push(`    [arranque] sale: fase=${faseDelRender} arrancado=${arrancado.current}`);
          return;
        }
        arrancado.current = true;
        const filtroInicial: Filtro = inicialDelRender?.filtro ?? "all";
        const r = iniciar(filtroInicial, !!inicialDelRender);
        estadoFiltro.current = r.estado;
        bitacora.push(`    [arranque] filtroInicial=${filtroInicial} aplicado=${r.estado.aplicado} accion=${r.accion.tipo}`);
        if (inicialDelRender) {
          set("Items", inicialDelRender.items, (v) => { items = v; });
          set("Tanda", { confirmada: inicialDelRender.pagina, falloTanda: false }, (v) => { tanda = v; });
          set("Filtro", filtroInicial, (v) => { filtro = v; });
          filtroVigente.current = filtroInicial;
          return;
        }
        reiniciar();
        set("Tanda", estadoTandaInicial, (v) => { tanda = v; });
        if (r.accion.tipo === "recargar") load(filtroInicial, 1);
      },
    };

    // [2] SÓLO en la versión vieja: el cambio de filtro como efecto.
    const filtroDelRender = filtro;
    const cambioComoEfecto: Efecto = {
      deps: [filtroDelRender, rein],
      correr: () => {
        if (!arrancado.current) { bitacora.push("    [cambio] sale: arrancado=false"); return; }
        const r = decidirCambioDeFiltro(estadoFiltro.current, filtroDelRender);
        bitacora.push(`    [cambio] cierre filtro=${filtroDelRender} aplicado=${estadoFiltro.current.aplicado} -> ${r.accion.tipo}`);
        estadoFiltro.current = r.estado;
        if (r.accion.tipo !== "recargar") return;
        reiniciar();
        set("Items", [] as string[], (v) => { items = v; });
        set("Tanda", estadoTandaInicial, (v) => { tanda = v; });
        load(filtroDelRender, 1);
      },
    };

    return opts.version === "vieja"
      ? [decidir, arranque, cambioComoEfecto]
      : [decidir, arranque];
  };

  /** Corre la ronda de efectos: sólo los que cambiaron de dependencias. */
  const ronda = (efectos: Efecto[], dobleDeMontaje = false) => {
    efectos.forEach((e, i) => {
      if (mismasDeps(previas[i], e.deps)) { return; }
      previas[i] = e.deps;
      e.correr();
      // Strict Mode: en el montaje React invoca los efectos dos veces.
      if (dobleDeMontaje) { bitacora.push("    (strict mode: segunda invocación)"); e.correr(); }
    });
  };

  // --- el ciclo de vida ----------------------------------------------------
  let efectos = render("montaje");
  ronda(efectos, opts.strictMode);
  let vueltas = 0;
  while (sucio && vueltas++ < 10) {
    sucio = false;
    efectos = render(`por set* (#${vueltas})`);
    ronda(efectos);
  }

  return {
    /** Un clic real del usuario en un botón del selector. */
    tocar(f: Filtro) {
      bitacora.push(`  >>> el usuario toca "${f}"`);
      if (opts.version === "vieja") {
        // La vieja sólo hacía setFiltro; el efecto se encargaba.
        set("Filtro", f, (v) => { filtro = v; });
      } else {
        // La nueva decide en el handler, que es donde está la intención.
        const r = decidirCambioDeFiltro(estadoFiltro.current, f);
        estadoFiltro.current = r.estado;
        set("Filtro", f, (v) => { filtro = v; });
        if (r.accion.tipo === "recargar") {
          reiniciar();
          set("Items", [] as string[], (v) => { items = v; });
          set("Tanda", estadoTandaInicial, (v) => { tanda = v; });
          filtroVigente.current = f;
          load(f, 1);
        }
      }
      let v = 0;
      while (sucio && v++ < 10) { sucio = false; ronda(render(`tras el clic (#${v})`)); }
      return this;
    },
    get pedidos() { return pedidos; },
    get filtro() { return filtro; },
    get items() { return items; },
    get pagina() { return tanda.confirmada; },
    get scrollY() { return scrollY; },
    get aplicado() { return estadoFiltro.current.aplicado; },
    get bitacora() { return bitacora.join("\n"); },
  };
}

const snap = (filtro: Filtro): Snapshot =>
  ({ filtro, items: ["a", "b", "c"], pagina: 2, scrollY: 740 });

// ============================================================================
// La versión vieja: qué pasa realmente
// ============================================================================

test("la versión vieja NO reproduce el bug mientras `reiniciar` sea estable", () => {
  // Honestidad sobre el diagnóstico: con `useCallback([clave])` y una clave
  // constante, el efecto de cambio NO corre en la ronda en que el arranque
  // restaura, porque `filtro` todavía no cambió y sus dependencias son iguales.
  // Por eso el síntoma no se veía.
  const v = montar({ snapshot: snap("tv"), version: "vieja" });
  assert.deepEqual(v.pedidos, [], `pidió ${v.pedidos.join(",")}\n${v.bitacora}`);
  assert.equal(v.filtro, "tv");
});

test("🔴 pero se rompe en cuanto `reiniciar` deja de ser estable", () => {
  // Lo que la auditoría señaló, aislado: si `reiniciar` cambia de identidad, el
  // efecto de cambio corre en TODA ronda, incluida la de la restauración, y ahí
  // su cierre todavía dice `filtro === "all"` mientras `aplicado` ya dice "tv".
  // Interpreta tv -> all como un cambio del usuario y pide Todos.
  const v = montar({ snapshot: snap("tv"), version: "vieja", reiniciarEstable: false });
  assert.ok(v.pedidos.length > 0,
    "se esperaba la petición espuria que motivó el arreglo");
  assert.deepEqual(v.pedidos, ["all:1", "tv:1"],
    `la secuencia espuria cambió:\n${v.bitacora}`);
  // Y el daño colateral: la restauración se pisa entera. La página vuelve a 0
  // —`estadoTandaInicial`— así que ni siquiera queda la 1: queda "ninguna
  // confirmada" hasta que responda el pedido espurio.
  assert.deepEqual(v.items, [], "los items restaurados sobrevivieron por casualidad");
  assert.equal(v.pagina, 0, "la página restaurada sobrevivió por casualidad");
});

test("la versión vieja tampoco depende del snapshot `all` por buenas razones", () => {
  const v = montar({ snapshot: snap("all"), version: "vieja", reiniciarEstable: false });
  // Con `all` el cierre coincide con lo aplicado, así que no hay petición: el
  // acierto es una coincidencia de valores, no una garantía.
  assert.deepEqual(v.pedidos, []);
});

// ============================================================================
// La versión nueva: la restauración no puede confundirse con un clic
// ============================================================================

test("restauración con `tv`: CERO peticiones, y items/página/filtro/scroll intactos", () => {
  for (const estable of [true, false]) {
    const v = montar({ snapshot: snap("tv"), version: "nueva", reiniciarEstable: estable });
    assert.deepEqual(v.pedidos, [],
      `con reiniciarEstable=${estable} pidió ${v.pedidos.join(",")}\n${v.bitacora}`);
    assert.deepEqual(v.items, ["a", "b", "c"]);
    assert.equal(v.pagina, 2);
    assert.equal(v.filtro, "tv");
    assert.equal(v.scrollY, 740, "se movió el scroll restaurado");
    assert.equal(v.aplicado, "tv");
  }
});

test("restauración con `movie`: CERO peticiones", () => {
  const v = montar({ snapshot: snap("movie"), version: "nueva", reiniciarEstable: false });
  assert.deepEqual(v.pedidos, []);
  assert.equal(v.filtro, "movie");
  assert.equal(v.scrollY, 740);
});

test("restauración con `all`: CERO peticiones", () => {
  const v = montar({ snapshot: snap("all"), version: "nueva", reiniciarEstable: false });
  assert.deepEqual(v.pedidos, []);
  assert.equal(v.scrollY, 740);
});

test("entrada nueva por link: UNA sola petición", () => {
  for (const estable of [true, false]) {
    const v = montar({ snapshot: null, version: "nueva", reiniciarEstable: estable });
    assert.deepEqual(v.pedidos, ["all:1"],
      `con reiniciarEstable=${estable}: ${v.pedidos.join(",")}\n${v.bitacora}`);
    assert.equal(v.scrollY, 0, "la entrada por link tiene que empezar arriba");
  }
});

test("tras restaurar `tv`, el primer clic en Películas pide SÓLO Películas", () => {
  const v = montar({ snapshot: snap("tv"), version: "nueva", reiniciarEstable: false });
  assert.deepEqual(v.pedidos, []);
  v.tocar("movie");
  assert.deepEqual(v.pedidos, ["movie:1"], `pidió ${v.pedidos.join(",")}\n${v.bitacora}`);
  assert.equal(v.filtro, "movie");
});

test("tras restaurar `tv`, tocar `tv` otra vez no pide nada", () => {
  const v = montar({ snapshot: snap("tv"), version: "nueva" });
  v.tocar("tv");
  assert.deepEqual(v.pedidos, [], "recargó el filtro que ya estaba restaurado");
  assert.deepEqual(v.items, ["a", "b", "c"], "borró los items restaurados");
});

test("EL BUG ORIGINAL sigue arreglado: entrada nueva y primer clic en Películas", () => {
  const v = montar({ snapshot: null, version: "nueva" });
  assert.deepEqual(v.pedidos, ["all:1"]);
  v.tocar("movie");
  assert.deepEqual(v.pedidos, ["all:1", "movie:1"], `${v.bitacora}`);
  v.tocar("tv");
  assert.deepEqual(v.pedidos, ["all:1", "movie:1", "tv:1"]);
});

test("el conteo de peticiones de los cinco escenarios queda fijado", () => {
  const cuenta = (s: Snapshot | null) =>
    montar({ snapshot: s, version: "nueva", reiniciarEstable: false }).pedidos.length;
  assert.equal(cuenta(null), 1, "entrada nueva");
  assert.equal(cuenta(snap("all")), 0, "restauración con all");
  assert.equal(cuenta(snap("movie")), 0, "restauración con movie");
  assert.equal(cuenta(snap("tv")), 0, "restauración con tv");
  const v = montar({ snapshot: snap("tv"), version: "nueva", reiniciarEstable: false });
  v.tocar("all");
  assert.equal(v.pedidos.length, 1, "primer cambio manual");
  assert.deepEqual(v.pedidos, ["all:1"]);
});

// ============================================================================
// Strict Mode
// ============================================================================

test("Strict Mode no duplica la petición de arranque", () => {
  // React invoca los efectos dos veces en el montaje. El de arranque no corre
  // ahí —`fase` todavía es "decidiendo"— y cuando corre, `arrancado.current` ya
  // es un ref: la segunda invocación sale por el guard.
  const v = montar({ snapshot: null, version: "nueva", strictMode: true });
  assert.deepEqual(v.pedidos, ["all:1"], `duplicó: ${v.pedidos.join(",")}\n${v.bitacora}`);
});

test("Strict Mode tampoco pierde la restauración, por el `if (e)` del hook", () => {
  // La doble invocación consume la marca de vuelta dos veces, así que la segunda
  // decide "no restaurar" — pero `useListaPaginada` hace
  //
  //     if (e) { setInicial(e); ... }
  //
  // o sea que con `e` en null NO llama a `setInicial`, y el valor que puso la
  // primera invocación queda. Ese `if` es lo que vuelve al hook seguro en Strict
  // Mode; escrito como `setInicial(e)` a secas, la segunda pasada borraría la
  // restauración y pediría la página 1. Vale la pena saber por qué está.
  const v = montar({ snapshot: snap("tv"), version: "nueva", strictMode: true });
  assert.deepEqual(v.items, ["a", "b", "c"], "se perdió la restauración en Strict Mode");
  assert.deepEqual(v.pedidos, [], `pidió ${v.pedidos.join(",")}
${v.bitacora}`);
  assert.equal(v.scrollY, 740);
});
