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
import { iniciar, esEstadoValido, valeGuardar, type EstadoRuleta } from "./ruleta-historial.ts";
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
