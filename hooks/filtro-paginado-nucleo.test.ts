// El bug del selector de Próximamente, y su arreglo.
//
// Los tres primeros tests REPRODUCEN la falla sobre la máquina de estados vieja,
// escrita acá tal como estaba en `UpcomingAllView.tsx:59-84`. Si alguien vuelve
// a esa forma, fallan. Los que siguen fijan el contrato del módulo nuevo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidirCambioDeFiltro, estadoFiltroInicial, iniciar, respuestaVigente,
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
