// La ruleta al volver de una ficha: qué se restaura y qué NO.
//
// ============================================================================
// EL BUG QUE ARREGLA
// ============================================================================
// Abrir "Más info", el póster o el título y volver con Atrás dejaba al usuario en
// el Home con la ruleta CERRADA: se perdía el panel, el escenario y la
// recomendación que estaba mirando. El Home era la única vista sin restauración
// —`CLAUDE.md` lo dice: "Home y /persona no se tocaron"— y la ruleta es lo único
// del Home que tiene estado que valga la pena conservar.
//
// ============================================================================
// QUÉ SE PRUEBA ACÁ Y QUÉ NO
// ============================================================================
// La DECISIÓN: restaurar sólo si se volvió con Atrás, sólo si la firma sigue
// valiendo, y devolviendo el estado exacto. Eso es lo que gatea el pedido a
// `/api/ruleta`, así que es donde está el costo.
//
// Lo que no se prueba acá es el pintado: para eso hace falta un DOM, y el
// componente ya está cubierto por el guard de estructura de
// `lib/ruleta-tarjeta.test.ts`.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  guardarVista, decidirRestauracionVista, marcarVuelta, consumirVuelta, olvidarLista,
} from "../hooks/lista-paginada-store.ts";
import {
  iniciar, esEstadoValido, valeGuardar, type EstadoRuleta, type SesionRuleta,
} from "./ruleta-historial.ts";
import type { RoulettePick } from "./roulette.ts";

// Mismo doble de sessionStorage que hooks/lista-paginada-store.test.ts.
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

const CLAVE = "ruleta";
const RUTA = "/";
const FIRMA = "n,d,m";

const pick = (id: number): RoulettePick => ({
  id, type: "movie", title: `T${id}`, poster: null, year: 2020, runtime: null,
  genres: [], platforms: [], razon: "", advertencia: null, atencion: "media",
} as unknown as RoulettePick);

/** Una sesión con tres vistas y una en la cola, parada en la segunda. */
function sesionDeEjemplo() {
  const s0 = iniciar("larga", [pick(1), pick(2), pick(3), pick(4)])!;
  // se avanzó una vez: historial [1,2], pos 1, cola [3,4]
  return { ...s0, historial: [pick(1), pick(2)], pos: 1, cola: [pick(3), pick(4)] };
}

function guardarSesion(firma = FIRMA, scrollY = 640) {
  const estado: EstadoRuleta = { abierto: true, sesion: sesionDeEjemplo() };
  assert.equal(valeGuardar(estado), true);
  guardarVista<EstadoRuleta>(CLAVE, { firma, datos: estado, scrollY });
}

// ------------------------------------------- 6. volver desde una ficha

test("🔴 volver con Atrás restaura el estado EXACTO", () => {
  guardarSesion();
  marcarVuelta(RUTA);

  const e = decidirRestauracionVista<EstadoRuleta>({
    clave: CLAVE, firma: FIRMA, volvio: consumirVuelta(RUTA),
  });
  assert.ok(e, "no restauró nada");
  assert.equal(esEstadoValido(e!.datos), true);

  const d = e!.datos;
  assert.equal(d.abierto, true, "el panel tiene que volver abierto");
  assert.equal(d.sesion!.escenario, "larga", "el escenario elegido");
  assert.deepEqual(d.sesion!.historial.map((p) => p.id), [1, 2], "el historial completo");
  assert.equal(d.sesion!.pos, 1, "la posición dentro del historial");
  assert.equal(d.sesion!.historial[d.sesion!.pos].id, 2, "la recomendación visible");
  assert.deepEqual(d.sesion!.cola.map((p) => p.id), [3, 4], "la cola sin consumir");
  assert.equal(e!.scrollY, 640, "la posición vertical de la página");
});

test("🔴 restaurar NO consume la cola ni avanza la posición", () => {
  // Es lo que garantiza que volver no cueste una llamada: si la cola vuelve
  // entera, `otra` tiene de dónde sacar y no pide nada.
  guardarSesion();
  marcarVuelta(RUTA);
  const e = decidirRestauracionVista<EstadoRuleta>({ clave: CLAVE, firma: FIRMA, volvio: consumirVuelta(RUTA) })!;
  assert.ok(e.datos.sesion!.cola.length > 0, "sin cola, el próximo 'Otra' saldría a pedir");
});

// -------------------------------------- 7. una entrada normal no restaura

test("🔴 entrar al Home por un link NO revive la sesión vieja", () => {
  guardarSesion();
  // Sin `marcarVuelta`: no hubo popstate, o sea que no se volvió con Atrás.
  const e = decidirRestauracionVista<EstadoRuleta>({
    clave: CLAVE, firma: FIRMA, volvio: consumirVuelta(RUTA),
  });
  assert.equal(e, null, "revivió una sesión que el usuario ya había dejado");
});

test("y además la OLVIDA, para que no reviva en la vuelta siguiente", () => {
  guardarSesion();
  decidirRestauracionVista<EstadoRuleta>({ clave: CLAVE, firma: FIRMA, volvio: false });
  marcarVuelta(RUTA);
  const e = decidirRestauracionVista<EstadoRuleta>({ clave: CLAVE, firma: FIRMA, volvio: consumirVuelta(RUTA) });
  assert.equal(e, null, "la entrada limpia tiene que dejar el terreno limpio");
});

test("una vuelta a OTRA ruta no restaura la ruleta", () => {
  // La marca lleva la ruta adentro justamente para esto: volver de la ficha a
  // /top no puede disparar la restauración del Home.
  guardarSesion();
  marcarVuelta("/top/");
  const e = decidirRestauracionVista<EstadoRuleta>({
    clave: CLAVE, firma: FIRMA, volvio: consumirVuelta(RUTA),
  });
  assert.equal(e, null);
});

// ------------------------------- 5. cambiar plataformas invalida la sesión

test("🔴 con otras plataformas el snapshot no vale, y se borra", () => {
  guardarSesion("n,d,m");
  marcarVuelta(RUTA);
  const e = decidirRestauracionVista<EstadoRuleta>({
    clave: CLAVE, firma: "n,cr", volvio: consumirVuelta(RUTA),
  });
  assert.equal(e, null, "restauró recomendaciones de un universo que ya no es el del usuario");
  // Y quedó olvidado: volver a las plataformas viejas no lo resucita.
  marcarVuelta(RUTA);
  assert.equal(
    decidirRestauracionVista<EstadoRuleta>({ clave: CLAVE, firma: "n,d,m", volvio: consumirVuelta(RUTA) }),
    null,
  );
});

// --------------------------------------------------- higiene del snapshot

test("cerrar la ruleta borra el snapshot", () => {
  guardarSesion();
  olvidarLista(CLAVE);   // es lo que hace `cerrar()` en el banner
  marcarVuelta(RUTA);
  assert.equal(
    decidirRestauracionVista<EstadoRuleta>({ clave: CLAVE, firma: FIRMA, volvio: consumirVuelta(RUTA) }),
    null,
  );
});

test("un snapshot con la forma rota se ignora en vez de pintar una tarjeta vacía", () => {
  guardarVista(CLAVE, { firma: FIRMA, datos: { abierto: true, sesion: { escenario: "larga" } }, scrollY: 0 });
  marcarVuelta(RUTA);
  const e = decidirRestauracionVista<EstadoRuleta>({ clave: CLAVE, firma: FIRMA, volvio: consumirVuelta(RUTA) });
  // El almacén lo devuelve —la firma coincide—, y es `esEstadoValido` quien lo
  // rechaza. Por eso el componente valida SIEMPRE antes de usarlo.
  assert.ok(e, "el almacén no es quien filtra la forma");
  assert.equal(esEstadoValido(e!.datos), false);
});

// ============================================================================
// EL SNAPSHOT NO SE PISA A SÍ MISMO MIENTRAS SE RESTAURA
// ============================================================================
// EL BUG. Al volver de la ficha, el efecto que guarda el snapshot corre en el
// mismo commit que la restauración, y el scroll recién se aplica DOS FRAMES
// DESPUÉS (rAF doble, para que el documento ya tenga su altura). O sea que ese
// guardado veía `window.scrollY = 0` y escribía 0 encima de la posición que
// acababa de leer.
//
// Medido en el navegador (2026-09-06, dev, Home con la ruleta abierta a 880 px):
//   viaje 1: vuelve, restaura 880 … y el snapshot queda en 0
//   viaje 2: vuelve, restaura **0** — la tarjeta correcta, la página arriba de
//            todo. Es exactamente lo que reportó el dueño.
//
// La corrección es entender qué es "la posición de la vista" mientras hay una
// restauración en vuelo: es la PENDIENTE, no la del documento. El documento
// todavía no llegó ahí.
//
// ⚠️ Esto es un MODELO de la coordinación, igual que
// `hooks/arranque-restauracion.test.ts`: no monta el componente ni ejecuta
// React. Respeta el orden de declaración de los efectos —decidir, scroll,
// guardar— y que un efecto ve el cierre de su render. Lo que ata el modelo al
// componente es el guard de `lib/ruleta-tarjeta.test.ts`.

/** El componente, modelado en lo único que decide la posición vertical. */
function viajeDeVuelta(politica: "vieja" | "nueva") {
  let open = false;
  let sesion: SesionRuleta | null = null;
  let decidido = false;
  let scrollY = 0;                       // el documento
  const scrollPendiente: { current: number | null } = { current: null };
  const agendado = { current: false };
  const frames: (() => void)[] = [];     // requestAnimationFrame

  const actual = () => (sesion && sesion.historial.length ? sesion.historial[sesion.pos] : null);

  const efectoDecidir = () => {
    if (decidido) return;
    const e = decidirRestauracionVista<EstadoRuleta>({
      clave: CLAVE, firma: FIRMA, volvio: consumirVuelta(RUTA),
    });
    if (e && esEstadoValido(e.datos)) {
      open = e.datos.abierto;
      sesion = e.datos.sesion;
      scrollPendiente.current = e.scrollY;
    }
    decidido = true;
  };

  const efectoScroll = () => {
    const y = scrollPendiente.current;
    if (y == null || !actual() || agendado.current) return;
    agendado.current = true;
    frames.push(() => frames.push(() => {
      agendado.current = false;
      if (scrollPendiente.current !== y) return;
      scrollPendiente.current = null;
      scrollY = y;
    }));
  };

  const efectoGuardar = () => {
    if (!decidido) return;
    const estado: EstadoRuleta = { abierto: open, sesion };
    if (!valeGuardar(estado)) { olvidarLista(CLAVE); return; }
    guardarVista<EstadoRuleta>(CLAVE, {
      firma: FIRMA, datos: estado,
      scrollY: politica === "nueva" ? scrollPendiente.current ?? scrollY : scrollY,
    });
  };

  // Ronda 1: el montaje. Los tres efectos, en orden de declaración.
  efectoDecidir(); efectoScroll(); efectoGuardar();
  // Ronda 2: cambiaron `open`, `sesion` y con ellos `actual`.
  efectoDecidir(); efectoScroll(); efectoGuardar();
  // Y los dos frames del rAF doble.
  while (frames.length) frames.shift()!();

  return { scrollY, guardado: () => JSON.parse(sessionStorage.getItem("yump:lista-paginada")!).ruleta.scrollY };
}

test("🔴 restaurar no puede dejar el snapshot en 0 (la política vieja lo hacía)", () => {
  guardarSesion(FIRMA, 880);
  marcarVuelta(RUTA);
  const v = viajeDeVuelta("vieja");
  assert.equal(v.scrollY, 880, "la vista sí llegaba al lugar correcto");
  assert.equal(v.guardado(), 0, "…y el snapshot quedaba en 0: es el bug reportado");
  // Y de ahí sale el síntoma: el viaje siguiente restaura ese 0.
  marcarVuelta(RUTA);
  assert.equal(viajeDeVuelta("vieja").scrollY, 0,
    "el segundo regreso tiene que caer arriba de todo, que es lo que se reportó");
});

test("🔴 mientras el scroll está pendiente, la posición que se guarda es la PENDIENTE", () => {
  guardarSesion(FIRMA, 880);
  marcarVuelta(RUTA);
  const v = viajeDeVuelta("nueva");
  assert.equal(v.scrollY, 880, "la vista tiene que quedar donde estaba");
  assert.equal(v.guardado(), 880, "el snapshot se pisó con la posición del documento a medio restaurar");
});

test("🔴 dos viajes seguidos a la ficha restauran las dos veces al mismo lugar", () => {
  // El caso del reporte: volver, mirar la tarjeta y entrar de nuevo a la ficha
  // SIN scrollear. Si el primer viaje dejó el snapshot en 0, el segundo devuelve
  // la tarjeta correcta con la página arriba de todo.
  guardarSesion(FIRMA, 880);
  marcarVuelta(RUTA);
  assert.equal(viajeDeVuelta("nueva").scrollY, 880);
  marcarVuelta(RUTA);
  assert.equal(viajeDeVuelta("nueva").scrollY, 880, "el segundo regreso perdió la posición");
});
