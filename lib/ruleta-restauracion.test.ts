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
import { objetivoDeScroll, type PosicionRuleta } from "./ruleta-scroll.ts";
import { registrarIntencion, consumirIntencion, decidirVuelta } from "../hooks/intencion-vuelta.ts";
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
// LA VUELTA COMPLETA: DESDE QUE SE ABRE LA FICHA HASTA QUE VUELVE LA SECCION
// ============================================================================
// Modela los dos caminos del boton "Volver" de la ficha y el montaje del Home,
// con el ALMACEN REAL (sessionStorage falso) y las decisiones reales. Respeta el
// orden de declaracion de los efectos del banner -decidir, acomodar, guardar- y
// que el acomodo del scroll pasa en un `requestAnimationFrame`, o sea DESPUES
// del efecto que guarda: eso ultimo no es un detalle, es la mitad de un bug que
// ya paso (el guardado escribia 0 encima del snapshot recien leido).
//
// ⚠️ NO monta React ni el componente. Lo que ata el modelo al codigo real son
// los guards de `lib/ruleta-tarjeta.test.ts`.

const TOP_SECCION = 916;                 // donde arranca la seccion en el Home
const ANCLA = 36;                        // estaba a 36 px del borde de arriba
const GUARDADO = TOP_SECCION - ANCLA;    // 880
const FICHA = { tipo: "movie", id: 353070 };

/** El Home montandose: decide, acomoda y guarda. */
function montarHome(opts: { politicaGuardado?: "vieja" | "nueva" } = {}) {
  const politica = opts.politicaGuardado ?? "nueva";
  let open = false;
  let sesion: SesionRuleta | null = null;
  let decidido = false;
  let scrollY = 0;
  const pendiente: { current: PosicionRuleta | null } = { current: null };
  const frames: { correr: (() => void) | null } = { correr: null };

  const actual = () => (sesion && sesion.historial.length ? sesion.historial[sesion.pos] : null);
  const dondeEsta = () => ({ top: TOP_SECCION - scrollY, scrollY });

  const efectoDecidir = () => {
    if (decidido) return;
    const e = decidirRestauracionVista<EstadoRuleta, { ancla: number | null }>({
      clave: CLAVE, firma: FIRMA, volvio: consumirVuelta(RUTA),
    });
    if (e && esEstadoValido(e.datos)) {
      open = e.datos.abierto;
      sesion = e.datos.sesion;
      pendiente.current = { y: e.scrollY, ancla: e.extra?.ancla ?? null };
    }
    decidido = true;
  };

  const efectoAcomodar = () => {
    const pos = pendiente.current;
    if (!pos || !actual() || frames.correr) return;
    frames.correr = () => {
      if (pendiente.current !== pos) return;
      pendiente.current = null;
      scrollY = objetivoDeScroll(pos, dondeEsta());
    };
  };

  const efectoGuardar = () => {
    if (!decidido) return;
    const estado: EstadoRuleta = { abierto: open, sesion };
    if (!valeGuardar(estado)) { olvidarLista(CLAVE); return; }
    const pend = pendiente.current;
    guardarVista<EstadoRuleta, { ancla: number | null }>(CLAVE, {
      firma: FIRMA, datos: estado,
      scrollY: politica === "nueva" && pend ? pend.y : scrollY,
      extra: { ancla: politica === "nueva" && pend ? pend.ancla : Math.round(TOP_SECCION - scrollY) },
    });
  };

  efectoDecidir(); efectoAcomodar(); efectoGuardar();   // montaje
  efectoDecidir(); efectoAcomodar(); efectoGuardar();   // cambiaron open/sesion
  frames.correr?.();                                     // y recien ahi el rAF

  return {
    abierto: open,
    id: actual()?.id ?? null,
    historial: sesion?.historial.map((x) => x.id) ?? [],
    pos: sesion?.pos ?? null,
    cola: sesion?.cola.length ?? 0,
    scrollY,
    enPantalla: TOP_SECCION - scrollY,
    snapshot: () => JSON.parse(sessionStorage.getItem("yump:lista-paginada") || "{}").ruleta ?? null,
  };
}

/** El boton "Volver" de la ficha. Devuelve que hizo. */
function volverDesdeLaFicha(hayHistorialInterno: boolean, ficha = FICHA) {
  const d = decidirVuelta(hayHistorialInterno, consumirIntencion(ficha.tipo, ficha.id));
  if (d.tipo === "back") {
    // El back del navegador dispara popstate, y ESE escribe la marca.
    marcarVuelta(RUTA);
    return "back";
  }
  if (d.marcarVuelta) marcarVuelta(d.ruta);
  return `push ${d.ruta}${d.marcarVuelta ? " (con marca)" : ""}`;
}

/** Deja el Home como lo dejo el usuario al tocar "Mas info". */
function alIrseALaFicha() {
  guardarVista<EstadoRuleta, { ancla: number | null }>(CLAVE, {
    firma: FIRMA,
    datos: { abierto: true, sesion: sesionDeEjemplo() },
    scrollY: GUARDADO,
    extra: { ancla: ANCLA },
  });
  registrarIntencion({ origen: "ruleta", tipo: FICHA.tipo, id: FICHA.id, ruta: RUTA });
}

// --------------------------------------------------- los tres caminos

test("🔴 ruleta → ficha → Atrás del navegador: restaura", () => {
  alIrseALaFicha();
  assert.equal(volverDesdeLaFicha(true), "back");
  const h = montarHome();
  assert.equal(h.abierto, true, "el panel tiene que volver abierto");
  assert.equal(h.id, 2, "la recomendación que estaba mirando");
  assert.deepEqual(h.historial, [1, 2], "el historial");
  assert.equal(h.pos, 1, "la posición dentro del historial");
  assert.equal(h.cola, 2, "la cola sin consumir: sin esto, el próximo 'Otra' saldría a pedir");
  assert.equal(h.enPantalla, ANCLA, "la sección tiene que quedar en el mismo lugar de la pantalla");
});

test("🔴 ruleta → ficha → RECARGA COMPLETA → botón Volver: restaura", () => {
  // Sin historial nuestro atrás (la ficha pasó a ser el primer documento), así
  // que "Volver" es un push. Es el caso que dejaba la ruleta cerrada Y borraba
  // el snapshot: medido en el navegador el 2026-09-06.
  alIrseALaFicha();
  assert.equal(volverDesdeLaFicha(false), "push / (con marca)");
  const h = montarHome();
  assert.equal(h.abierto, true, "volvió cerrada");
  assert.equal(h.id, 2);
  assert.deepEqual(h.historial, [1, 2]);
  assert.equal(h.cola, 2);
  assert.equal(h.enPantalla, ANCLA);
});

test("🔴 ficha abierta por un link: 'Volver' abre el Home LIMPIO", () => {
  // Nadie registró una intención. Ni se marca la vuelta ni se restaura, y el
  // snapshot viejo se olvida: entrar por un link empieza de cero, que es la
  // regla de todo el mecanismo.
  alIrseALaFicha();
  sessionStorage.removeItem("yump:intencion-vuelta");   // no vino de la ruleta
  assert.equal(volverDesdeLaFicha(false), "push /");
  const h = montarHome();
  assert.equal(h.abierto, false, "una ficha ajena resucitó una sesión vieja");
  assert.equal(h.id, null);
  assert.equal(h.scrollY, 0);
});

test("🔴 una intención de OTRA ficha no habilita la vuelta", () => {
  alIrseALaFicha();
  assert.equal(volverDesdeLaFicha(false, { tipo: "movie", id: 999 }), "push /");
  assert.equal(montarHome().abierto, false);
});

test("🔴 una intención ya consumida no sirve para una segunda vuelta", () => {
  alIrseALaFicha();
  volverDesdeLaFicha(false);
  montarHome();
  // El usuario entra de nuevo a la misma ficha por un link, sin pasar por la
  // ruleta, y vuelve: no puede restaurar.
  assert.equal(volverDesdeLaFicha(false), "push /");
  assert.equal(montarHome().abierto, false);
});

test("la intención se consume también cuando la vuelta fue por back", () => {
  alIrseALaFicha();
  volverDesdeLaFicha(true);
  assert.equal(consumirIntencion(FICHA.tipo, FICHA.id), null, "quedó disponible para reutilizarse");
});

// ------------------------- el snapshot no se pisa mientras se restaura

test("🔴 restaurar no puede dejar el snapshot en 0 (la política vieja lo hacía)", () => {
  // El efecto de guardado corre en el mismo commit que la restauración y el
  // scroll se aplica dos frames después: con la posición del documento, el
  // guardado escribía 0 encima de lo que acababa de leer.
  alIrseALaFicha();
  volverDesdeLaFicha(true);
  const h = montarHome({ politicaGuardado: "vieja" });
  assert.equal(h.snapshot().scrollY, 0, "es el bug medido el 2026-09-06");
  // Y de ahí el síntoma: el viaje siguiente restaura ese 0.
  marcarVuelta(RUTA);
  assert.equal(montarHome({ politicaGuardado: "vieja" }).scrollY, 0);
});

test("🔴 mientras la posición está pendiente, se guarda la PENDIENTE", () => {
  alIrseALaFicha();
  volverDesdeLaFicha(true);
  const h = montarHome();
  assert.equal(h.snapshot().scrollY, GUARDADO);
  assert.equal(h.snapshot().extra.ancla, ANCLA);
});

test("🔴 dos viajes seguidos restauran las dos veces al mismo lugar", () => {
  alIrseALaFicha();
  volverDesdeLaFicha(true);
  assert.equal(montarHome().enPantalla, ANCLA);
  // Y de nuevo a la ficha, sin tocar el scroll.
  registrarIntencion({ origen: "ruleta", tipo: FICHA.tipo, id: FICHA.id, ruta: RUTA });
  volverDesdeLaFicha(true);
  assert.equal(montarHome().enPantalla, ANCLA, "el segundo regreso perdió la posición");
});

// ------------------------------------------------------ la posición

test("🔴 si la sección se corrió, el objetivo la sigue", () => {
  // Un scroll absoluto describe el documento; el ancla describe la sección.
  assert.equal(objetivoDeScroll({ y: GUARDADO, ancla: ANCLA }, { top: 1216, scrollY: 0 }), 1180);
});

test("un snapshot viejo, sin ancla, restaura el desplazamiento guardado", () => {
  guardarVista<EstadoRuleta>(CLAVE, {
    firma: FIRMA, datos: { abierto: true, sesion: sesionDeEjemplo() }, scrollY: GUARDADO,
  });
  registrarIntencion({ origen: "ruleta", tipo: FICHA.tipo, id: FICHA.id, ruta: RUTA });
  volverDesdeLaFicha(true);
  assert.equal(montarHome().scrollY, GUARDADO);
});
