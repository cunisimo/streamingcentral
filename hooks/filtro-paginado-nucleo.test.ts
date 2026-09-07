// El bug del selector de Próximamente, y su arreglo.
//
// Los tres primeros tests REPRODUCEN la falla sobre la máquina de estados vieja,
// escrita acá tal como estaba en `UpcomingAllView.tsx:59-84`. Si alguien vuelve
// a esa forma, fallan. Los que siguen fijan el contrato del módulo nuevo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alFallarLaTanda, alLlegarLaTanda, decidirCambioDeFiltro, estadoFiltroInicial,
  estadoTandaInicial, iniciar, paginaAPedir, reiniciarTanda, respuestaVigente, unir,
} from "./filtro-paginado-nucleo.ts";

// ============================================================================
// PRIMERO: reproducir el bug
// ============================================================================
//
// Simula el orden real de efectos de React: corren en orden de declaración, y
// uno sólo vuelve a correr si cambió alguna de sus dependencias. Los refs no
// disparan renders. Eso último es lo que hacía el bug invisible al leer el
// código de a un efecto por vez.

/** La implementación VIEJA. Se conserva sólo para demostrar que fallaba. */
function vistaVieja(snapshotFiltro: string | null) {
  const s = {
    filtro: "all",
    fase: "decidiendo" as "decidiendo" | "listo",
    inicial: null as { filtro: string } | null,
    restaurado: false,      // useRef(false)
    filtroPrevio: null as string | null,  // useRef<Filtro|null>(null)
    enPantalla: null as string | null,    // qué filtro produjo los items visibles
    cargas: [] as string[],
  };
  const load = (f: string) => { s.enPantalla = f; s.cargas.push(f); };
  let depsE1: string | null = null;   // [fase, inicial]
  let depsE2: string | null = null;   // [filtro, load]  (load es estable)

  const render = () => {
    const d1 = `${s.fase}|${s.inicial ? "snap" : "null"}`;
    if (d1 !== depsE1) {
      depsE1 = d1;
      if (s.fase === "listo" && !s.restaurado) {
        s.restaurado = true;
        if (s.inicial) { s.enPantalla = s.inicial.filtro; s.filtro = s.inicial.filtro; }
        else load(s.filtro);
      }
    }
    const d2 = s.filtro;
    if (d2 !== depsE2) {
      depsE2 = d2;
      if (s.restaurado) {
        // 🔴 ACÁ ESTABA EL BUG: el primer clic se consume como inicialización.
        if (s.filtroPrevio === null) s.filtroPrevio = s.filtro;
        else if (s.filtroPrevio !== s.filtro) { s.filtroPrevio = s.filtro; load(s.filtro); }
      }
    }
  };

  render();                                  // montaje
  s.fase = "listo";
  if (snapshotFiltro) s.inicial = { filtro: snapshotFiltro };
  render();                                  // fase pasa a "listo"
  if (s.filtro !== "all") render();          // re-render por el setFiltro de la restauración
  return {
    tocar(f: string) { s.filtro = f; render(); return s.enPantalla; },
    get enPantalla() { return s.enPantalla; },
  };
}

test("BUG (entrada directa): el primer clic en Películas no carga nada", () => {
  const v = vistaVieja(null);
  assert.equal(v.enPantalla, "all");
  assert.equal(v.tocar("movie"), "all",
    "el bug ya no se reproduce: revisar si el escenario sigue siendo válido");
});

test('BUG (vuelta con snapshot "all"): mismo síntoma', () => {
  const v = vistaVieja("all");
  assert.equal(v.tocar("movie"), "all");
});

test('el bug NO aparecía volviendo con snapshot "tv": eso era el "a veces"', () => {
  const v = vistaVieja("tv");
  assert.equal(v.enPantalla, "tv");
  assert.equal(v.tocar("movie"), "movie", "acá siempre había andado");
});

test("BUG: el rodeo Series -> Películas lo destrababa", () => {
  const v = vistaVieja(null);
  assert.equal(v.tocar("movie"), "all");   // se traga el clic
  assert.equal(v.tocar("tv"), "tv");       // ya inicializado, ahora sí carga
  assert.equal(v.tocar("movie"), "movie");
});

// ============================================================================
// El módulo nuevo: los mismos escenarios, arreglados
// ============================================================================

/** La vista nueva, con el núcleo puro. */
function vista(snapshotFiltro: string | null) {
  let filtro = snapshotFiltro ?? "all";
  let estado = estadoFiltroInicial;
  let enPantalla: string | null = null;
  const cargas: string[] = [];
  const aplicar = (r: { estado: typeof estado; accion: { tipo: string; filtro?: string } }) => {
    estado = r.estado;
    if (r.accion.tipo === "recargar") { enPantalla = r.accion.filtro!; cargas.push(r.accion.filtro!); }
  };
  // Arranque: si hubo snapshot, los items ya están.
  if (snapshotFiltro) { enPantalla = snapshotFiltro; aplicar(iniciar(filtro, true)); }
  else aplicar(iniciar(filtro, false));
  return {
    tocar(f: string) { filtro = f; aplicar(decidirCambioDeFiltro(estado, f)); return enPantalla; },
    get enPantalla() { return enPantalla; },
    get cargas() { return cargas; },
    get aplicado() { return estado.aplicado; },
  };
}

test("ARREGLADO (entrada directa): el primer clic carga", () => {
  const v = vista(null);
  assert.equal(v.enPantalla, "all");
  assert.equal(v.tocar("movie"), "movie");
  assert.deepEqual(v.cargas, ["all", "movie"]);
});

test('ARREGLADO (vuelta con snapshot "all"): el primer clic carga', () => {
  const v = vista("all");
  assert.deepEqual(v.cargas, [], "restauró y aun así pidió: hay una carga de más");
  assert.equal(v.tocar("movie"), "movie");
  assert.deepEqual(v.cargas, ["movie"]);
});

test('ARREGLADO (vuelta con snapshot "tv"): sigue andando', () => {
  const v = vista("tv");
  assert.equal(v.enPantalla, "tv");
  assert.equal(v.tocar("movie"), "movie");
});

test("volver de una ficha NO dispara una carga: los items vienen del snapshot", () => {
  assert.deepEqual(vista("tv").cargas, []);
  assert.equal(vista("tv").aplicado, "tv", "no registró el filtro restaurado");
});

test("tocar el filtro que ya está puesto no pide nada", () => {
  const v = vista(null);
  assert.deepEqual(v.cargas, ["all"]);
  v.tocar("all");
  assert.deepEqual(v.cargas, ["all"], "recargó sin que cambiara nada");
});

test("ir y volver entre filtros pide una vez por cambio, siempre", () => {
  const v = vista(null);
  v.tocar("movie"); v.tocar("tv"); v.tocar("movie"); v.tocar("all");
  assert.deepEqual(v.cargas, ["all", "movie", "tv", "movie", "all"]);
});

test("con aplicado en null un cambio se pide igual, no se traga", () => {
  // La red de seguridad: aunque el arranque no haya corrido.
  const r = decidirCambioDeFiltro({ aplicado: null }, "movie");
  assert.deepEqual(r.accion, { tipo: "recargar", filtro: "movie" });
  assert.equal(r.estado.aplicado, "movie");
});

test("iniciar registra el filtro SIEMPRE, restaure o no", () => {
  assert.equal(iniciar("movie", false).estado.aplicado, "movie");
  assert.equal(iniciar("movie", true).estado.aplicado, "movie");
});

test("el estado inicial arranca sin filtro aplicado", () => {
  assert.equal(estadoFiltroInicial.aplicado, null);
});

// ============================================================================
// Respuestas fuera de orden
// ============================================================================

test("una respuesta con reqId viejo se descarta", () => {
  assert.equal(respuestaVigente({
    reqDeLaRespuesta: 1, reqActual: 2, filtroDeLaRespuesta: "tv", filtroActual: "tv",
  }), false);
});

test("la respuesta vigente se acepta", () => {
  assert.equal(respuestaVigente({
    reqDeLaRespuesta: 3, reqActual: 3, filtroDeLaRespuesta: "movie", filtroActual: "movie",
  }), true);
});

test("reqId vigente pero de OTRO filtro se descarta igual", () => {
  // Lo que el contador solo no cubre.
  assert.equal(respuestaVigente({
    reqDeLaRespuesta: 5, reqActual: 5, filtroDeLaRespuesta: "tv", filtroActual: "movie",
  }), false);
});

test("cambios rápidos: sólo la última respuesta se pinta", () => {
  // El usuario toca Series y después Películas; Series responde segunda.
  let req = 0;
  const v = vista(null);
  const pedir = (f: string) => { v.tocar(f); return { req: ++req, filtro: f }; };
  const rSeries = pedir("tv");
  const rPelis = pedir("movie");
  const actual = { req, filtro: "movie" };
  assert.equal(respuestaVigente({
    reqDeLaRespuesta: rPelis.req, reqActual: actual.req,
    filtroDeLaRespuesta: rPelis.filtro, filtroActual: actual.filtro,
  }), true, "se descartó la respuesta buena");
  assert.equal(respuestaVigente({
    reqDeLaRespuesta: rSeries.req, reqActual: actual.req,
    filtroDeLaRespuesta: rSeries.filtro, filtroActual: actual.filtro,
  }), false, "la respuesta vieja de Series habría pisado a Películas");
});

test("tres cambios seguidos: sólo la tercera respuesta es vigente", () => {
  const filtros = ["movie", "tv", "all"];
  const pedidos = filtros.map((f, i) => ({ req: i + 1, filtro: f }));
  const actual = { req: 3, filtro: "all" };
  const vigentes = pedidos.filter((p) => respuestaVigente({
    reqDeLaRespuesta: p.req, reqActual: actual.req,
    filtroDeLaRespuesta: p.filtro, filtroActual: actual.filtro,
  }));
  assert.deepEqual(vigentes, [{ req: 3, filtro: "all" }]);
});

// ============================================================================
// "Cargar más": la página confirmada no avanza si la tanda no llegó
// ============================================================================

interface Fila { id: number }
const claveFila = (f: Fila) => `f:${f.id}`;

/**
 * La vista, reducida a lo que decide la paginación. Cada `tanda()` es un toque
 * de "Cargar más" o de "Reintentar" — que acá es la MISMA acción, y ése es el
 * punto: se pide `confirmada + 1`.
 */
function lista(porPagina = 3, totalFilas = 11) {
  let estado = estadoTandaInicial;
  let items: Fila[] = [];
  const pedidas: number[] = [];
  const servidor = (p: number): Fila[] => {
    const desde = (p - 1) * porPagina;
    return Array.from(
      { length: Math.max(0, Math.min(porPagina, totalFilas - desde)) },
      (_, n) => ({ id: desde + n + 1 }),
    );
  };
  return {
    /** Pide la página que corresponda. `falla` simula un error de red o un 500. */
    tanda(falla = false) {
      const p = paginaAPedir(estado);
      pedidas.push(p);
      if (falla) { estado = alFallarLaTanda(estado, p); return p; }
      const got = servidor(p);
      items = p === 1 ? got : unir(items, got, claveFila);
      estado = alLlegarLaTanda(estado, p);
      return p;
    },
    /** Una respuesta que llega repetida para la página que ya se confirmó. */
    respuestaRepetida(p: number) {
      items = unir(items, servidor(p), claveFila);
      estado = alLlegarLaTanda(estado, p);
    },
    get ids() { return items.map((f) => f.id); },
    get confirmada() { return estado.confirmada; },
    get falloTanda() { return estado.falloTanda; },
    get pedidas() { return pedidas; },
  };
}

test("EL CASO PEDIDO: página 1 ok, 2 falla, reintento de 2 ok, después 3", () => {
  const l = lista();

  l.tanda();                                    // página 1
  assert.deepEqual(l.ids, [1, 2, 3]);
  assert.equal(l.confirmada, 1);

  l.tanda(true);                                // página 2, falla
  assert.deepEqual(l.ids, [1, 2, 3], "se perdieron los elementos ya visibles");
  assert.equal(l.confirmada, 1, "avanzó la página confirmada con la tanda fallada");
  assert.equal(l.falloTanda, true, "no marcó el fallo de la tanda adicional");

  const reintento = l.tanda();                  // reintento
  assert.equal(reintento, 2, `reintentó la página ${reintento} en vez de la 2`);
  assert.deepEqual(l.ids, [1, 2, 3, 4, 5, 6]);
  assert.equal(l.confirmada, 2);
  assert.equal(l.falloTanda, false, "quedó el aviso de error después de un reintento bueno");

  l.tanda();                                    // página 3
  assert.deepEqual(l.ids, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(l.confirmada, 3);

  // Todo en orden, sin huecos y sin repetidos.
  assert.deepEqual(l.ids, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(new Set(l.ids).size, l.ids.length, "hay repetidos");
  assert.deepEqual(l.pedidas, [1, 2, 2, 3], "la secuencia de páginas pedidas no cierra");
});

test("una tanda que falla NO saltea la página: sin el arreglo quedaba un hueco", () => {
  const l = lista();
  l.tanda();          // 1
  l.tanda(true);      // 2 falla
  l.tanda();          // tiene que ser 2 otra vez, NO 3
  assert.deepEqual(l.pedidas, [1, 2, 2]);
  // El hueco que dejaba la versión vieja: [1,2,3, 7,8,9] sin el 4,5,6.
  assert.deepEqual(l.ids, [1, 2, 3, 4, 5, 6]);
});

test("dos fallos seguidos siguen reintentando la misma página", () => {
  const l = lista();
  l.tanda();
  l.tanda(true);
  l.tanda(true);
  l.tanda(true);
  assert.deepEqual(l.pedidas, [1, 2, 2, 2]);
  assert.equal(l.confirmada, 1);
  assert.deepEqual(l.ids, [1, 2, 3]);
  l.tanda();
  assert.deepEqual(l.ids, [1, 2, 3, 4, 5, 6]);
});

test("una respuesta repetida no duplica nada ni retrocede la página", () => {
  const l = lista();
  l.tanda();
  l.tanda();
  assert.deepEqual(l.ids, [1, 2, 3, 4, 5, 6]);
  l.respuestaRepetida(2);       // llega otra vez la tanda 2
  assert.deepEqual(l.ids, [1, 2, 3, 4, 5, 6], "duplicó la tanda repetida");
  assert.equal(l.confirmada, 2);
  l.respuestaRepetida(1);       // y una vieja
  assert.deepEqual(l.ids, [1, 2, 3, 4, 5, 6]);
  assert.equal(l.confirmada, 2, "una respuesta vieja hizo retroceder la confirmada");
});

test("cinco cargas sucesivas: 20 + 20 hasta el final, sin huecos ni repetidos", () => {
  const l = lista(20, 97);      // la selección real medida
  const paginas = [l.tanda(), l.tanda(), l.tanda(), l.tanda(), l.tanda()];
  assert.deepEqual(paginas, [1, 2, 3, 4, 5]);
  assert.equal(l.ids.length, 97);
  assert.deepEqual(l.ids, Array.from({ length: 97 }, (_, n) => n + 1));
  assert.equal(new Set(l.ids).size, 97);
});

test("el fallo de la PRIMERA carga no es un fallo de tanda adicional", () => {
  // Distinción que decide qué se muestra: sin nada en pantalla corresponde el
  // estado de error a pantalla completa, no un aviso discreto al pie.
  const l = lista();
  l.tanda(true);
  assert.equal(l.falloTanda, false, "marcó la primera carga como tanda adicional");
  assert.equal(l.confirmada, 0);
  assert.deepEqual(l.ids, []);
});

test("paginaAPedir: avanzar y reintentar son la misma cuenta", () => {
  assert.equal(paginaAPedir(estadoTandaInicial), 1);
  assert.equal(paginaAPedir({ confirmada: 3, falloTanda: false }), 4);
  assert.equal(paginaAPedir({ confirmada: 3, falloTanda: true }), 4);
});

test("alFallarLaTanda no toca la página confirmada", () => {
  const e = { confirmada: 4, falloTanda: false };
  assert.equal(alFallarLaTanda(e, 5).confirmada, 4);
  assert.equal(alFallarLaTanda(e, 5).falloTanda, true);
});

test("alLlegarLaTanda nunca retrocede", () => {
  assert.equal(alLlegarLaTanda({ confirmada: 5, falloTanda: false }, 2).confirmada, 5);
  assert.equal(alLlegarLaTanda({ confirmada: 5, falloTanda: false }, 6).confirmada, 6);
});

test("reiniciarTanda vuelve al estado inicial", () => {
  assert.deepEqual(reiniciarTanda(), estadoTandaInicial);
  assert.deepEqual(reiniciarTanda(), { confirmada: 0, falloTanda: false });
});

test("cambiar de filtro reinicia la paginación en 1", () => {
  const l = lista();
  l.tanda(); l.tanda(); l.tanda();
  assert.equal(l.confirmada, 3);
  // La vista llama a `setTanda(estadoTandaInicial)` y después pide la 1.
  assert.equal(paginaAPedir(reiniciarTanda()), 1);
});

test("unir deduplica contra lo previo Y dentro de la tanda nueva", () => {
  const previos = [{ id: 1 }, { id: 2 }];
  const nuevos = [{ id: 2 }, { id: 3 }, { id: 3 }, { id: 4 }];
  assert.deepEqual(unir(previos, nuevos, claveFila).map((f) => f.id), [1, 2, 3, 4]);
});

test("unir conserva el orden y no muta lo que recibe", () => {
  const previos = [{ id: 5 }, { id: 1 }];
  const nuevos = [{ id: 9 }, { id: 3 }];
  assert.deepEqual(unir(previos, nuevos, claveFila).map((f) => f.id), [5, 1, 9, 3]);
  assert.deepEqual(previos.map((f) => f.id), [5, 1], "mutó el array de entrada");
});
