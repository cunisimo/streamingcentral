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
import { objetivoDeScroll, llego, type PosicionRuleta } from "./ruleta-scroll.ts";
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
// VOLVER TIENE QUE DEVOLVER LA SECCION, NO UN NUMERO DE SCROLL
// ============================================================================
// EL REPORTE. "Si pongo volver desde una ficha, en vez de llevarme a la misma
// ubicacion del viewport donde esta 'no se que ver', me lleva al inicio del
// home": el estado volvia bien y la pagina quedaba arriba de todo.
//
// DOS CAUSAS, y la primera corregida sola no alcanzaba:
//
//   1. El efecto que guarda el snapshot corre en el MISMO commit que la
//      restauracion, y la posicion recien se aplica dos frames despues. Ese
//      guardado veia `scrollY = 0` y lo escribia encima de lo que acababa de
//      leer, asi que el viaje SIGUIENTE restauraba 0.
//   2. Un solo `scrollTo` no sobrevive a lo que pasa despues de una vuelta
//      atras: la restauracion nativa del navegador llega tarde con su propio
//      numero, el documento todavia no tiene su altura final y el contenido de
//      arriba sigue llegando. Cualquiera de los tres deja al usuario en otro
//      lado, y el intento unico no se entera.
//
// El modelo de abajo respeta el orden de declaracion de los efectos -decidir,
// acomodar, guardar- y que un efecto ve el cierre de su render, igual que
// `hooks/arranque-restauracion.test.ts`. NO monta el componente ni ejecuta
// React: lo que ata el modelo al codigo real es el guard de
// `lib/ruleta-tarjeta.test.ts`.

/** Donde arranca la seccion dentro del documento, en el Home de la prueba. */
const TOP_SECCION = 916;
const ANCLA = 36;             // la seccion, a 36 px del borde de arriba
const GUARDADO = TOP_SECCION - ANCLA;   // 880

interface Opciones {
  /** "vieja": guarda lo que dice el documento. "nueva": la posicion pendiente. */
  politica: "vieja" | "nueva";
  /** "unico": un solo scrollTo. "bucle": se sostiene la posicion. */
  acomodo: "unico" | "bucle";
  /** Algo mueve la pagina en ese frame (el navegador restaurando tarde, p.ej.). */
  interferencia?: { frame: number; y: number };
  /** El usuario toca la pantalla en ese frame. */
  gestoEnFrame?: number;
  /** La seccion se corre porque llego contenido arriba. */
  seccionSeMueve?: { frame: number; top: number };
}

/** El componente, modelado en lo unico que decide donde queda la pagina. */
function viajeDeVuelta(o: Opciones) {
  let open = false;
  let sesion: SesionRuleta | null = null;
  let decidido = false;
  let scrollY = 0;                  // el documento
  let topSeccion = TOP_SECCION;     // su borde, medido desde el principio
  const pendiente: { current: PosicionRuleta | null } = { current: null };
  const agendado = { current: false };

  const actual = () => (sesion && sesion.historial.length ? sesion.historial[sesion.pos] : null);
  const dondeEsta = () => ({ top: topSeccion - scrollY, scrollY });

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

  // El bucle, desenrollado: 12 frames alcanzan para ver la interferencia.
  //
  // 🔴 LOS FRAMES CORREN DESPUES DE LOS EFECTOS DE LA RONDA, y eso no es un
  // detalle del modelo: es la mitad del bug. El acomodo pasa dentro de un
  // `requestAnimationFrame`, o sea DESPUES del efecto que guarda el snapshot, y
  // por eso ese guardado veia la pagina todavia arriba de todo.
  const FRAMES = 12;
  const frames: { correr: (() => void) | null } = { correr: null };
  const acomodar = () => {
    const pos = pendiente.current;
    if (!pos || !actual() || agendado.current) return;
    agendado.current = true;
    frames.correr = () => {
      // El mundo sigue pasando aunque nosotros dejemos de corregir: por eso el
      // recorrido de frames no se corta, lo que se corta es la correccion.
      let vivo = true;
      let corregir = true;
      for (let f = 0; f < FRAMES; f++) {
        if (o.interferencia?.frame === f) scrollY = o.interferencia.y;
        if (o.seccionSeMueve?.frame === f) topSeccion = o.seccionSeMueve.top;
        if (o.gestoEnFrame === f) vivo = false;
        if (!vivo || !corregir) continue;
        const objetivo = objetivoDeScroll(pos, dondeEsta());
        if (!llego(scrollY, objetivo)) scrollY = objetivo;
        if (o.acomodo === "unico") corregir = false;
      }
      agendado.current = false;
      pendiente.current = null;
    };
  };

  const efectoGuardar = () => {
    if (!decidido) return;
    const estado: EstadoRuleta = { abierto: open, sesion };
    if (!valeGuardar(estado)) { olvidarLista(CLAVE); return; }
    const pend = pendiente.current;
    guardarVista<EstadoRuleta, { ancla: number | null }>(CLAVE, {
      firma: FIRMA, datos: estado,
      scrollY: o.politica === "nueva" && pend ? pend.y : scrollY,
      extra: {
        ancla: o.politica === "nueva" && pend ? pend.ancla : Math.round(topSeccion - scrollY),
      },
    });
  };

  // Ronda 1: el montaje. Los efectos, en orden de declaracion.
  efectoDecidir(); acomodar(); efectoGuardar();
  // Ronda 2: cambiaron `open`, `sesion` y con ellos `actual`.
  efectoDecidir(); acomodar(); efectoGuardar();
  // Y recien ahora los frames.
  frames.correr?.();

  const guardado = () => JSON.parse(sessionStorage.getItem("yump:lista-paginada")!).ruleta;
  return {
    scrollY,
    /** Donde quedo la seccion en la pantalla: 36 = donde estaba. */
    enPantalla: topSeccion - scrollY,
    guardado,
  };
}

/** Deja un snapshot como el que escribe el componente al irse a la ficha. */
function guardarConAncla() {
  const estado: EstadoRuleta = { abierto: true, sesion: sesionDeEjemplo() };
  guardarVista<EstadoRuleta, { ancla: number | null }>(CLAVE, {
    firma: FIRMA, datos: estado, scrollY: GUARDADO, extra: { ancla: ANCLA },
  });
  marcarVuelta(RUTA);
}

const base: Opciones = { politica: "nueva", acomodo: "bucle" };

// ------------------------------------------------- el caso que se reporto

test("🔴 volver deja la seccion donde estaba, no el Home arriba de todo", () => {
  guardarConAncla();
  const v = viajeDeVuelta(base);
  assert.equal(v.enPantalla, ANCLA, "la seccion tiene que quedar en el mismo lugar de la pantalla");
  assert.equal(v.scrollY, GUARDADO);
});

test("🔴 si algo mueve la pagina DESPUES de restaurar, la seccion vuelve a su lugar", () => {
  // Es lo que hace la restauracion nativa del navegador cuando llega tarde con
  // su propio numero, y lo que hacia fallar al intento unico.
  guardarConAncla();
  const conBucle = viajeDeVuelta({ ...base, interferencia: { frame: 3, y: 0 } });
  assert.equal(conBucle.enPantalla, ANCLA, "quedo donde la dejo la interferencia");

  guardarConAncla();
  const conUnico = viajeDeVuelta({ ...base, acomodo: "unico", interferencia: { frame: 3, y: 0 } });
  assert.equal(conUnico.scrollY, 0, "con un solo intento, esto es lo que veia el dueno");
});

test("🔴 si la seccion se corre porque llego contenido arriba, la sigue", () => {
  guardarConAncla();
  const v = viajeDeVuelta({ ...base, seccionSeMueve: { frame: 4, top: TOP_SECCION + 300 } });
  assert.equal(v.enPantalla, ANCLA, "no siguio a la seccion");
  assert.equal(v.scrollY, GUARDADO + 300, "el desplazamiento cambia; el resultado visual no");
});

test("un gesto del usuario corta el reacomodo: manda el", () => {
  guardarConAncla();
  const v = viajeDeVuelta({ ...base, gestoEnFrame: 2, interferencia: { frame: 1, y: 1500 } });
  assert.equal(v.scrollY, GUARDADO, "el frame 1 corrigio la interferencia y el gesto freno ahi");
  // Y lo importante: despues del gesto no se vuelve a tocar nada.
  const w = viajeDeVuelta({ ...base, gestoEnFrame: 0 });
  assert.equal(w.scrollY, 0, "acomodo la pagina despues de que el usuario tomo el control");
});

// ------------------------------------- el snapshot no se pisa a si mismo

test("🔴 restaurar no puede dejar el snapshot en 0 (la politica vieja lo hacia)", () => {
  guardarConAncla();
  const v = viajeDeVuelta({ ...base, politica: "vieja", acomodo: "unico" });
  assert.equal(v.guardado().scrollY, 0, "el snapshot quedaba en 0: es el bug reportado");
  // Y de ahi sale el sintoma: el viaje siguiente restaura ese 0.
  marcarVuelta(RUTA);
  const w = viajeDeVuelta({ ...base, politica: "vieja", acomodo: "unico" });
  assert.equal(w.scrollY, 0, "el segundo regreso cae arriba de todo");
});

test("🔴 mientras la posicion esta pendiente, se guarda la PENDIENTE", () => {
  guardarConAncla();
  const v = viajeDeVuelta(base);
  assert.equal(v.guardado().scrollY, GUARDADO);
  assert.equal(v.guardado().extra.ancla, ANCLA);
});

test("🔴 dos viajes seguidos a la ficha restauran las dos veces al mismo lugar", () => {
  guardarConAncla();
  assert.equal(viajeDeVuelta(base).enPantalla, ANCLA);
  marcarVuelta(RUTA);
  assert.equal(viajeDeVuelta(base).enPantalla, ANCLA, "el segundo regreso perdio la posicion");
  marcarVuelta(RUTA);
  assert.equal(viajeDeVuelta(base).enPantalla, ANCLA, "el tercero tambien");
});

test("un snapshot viejo, sin ancla, restaura el desplazamiento guardado", () => {
  // Compatibilidad: los snapshots escritos antes de esta correccion no lo traen.
  guardarVista<EstadoRuleta>(CLAVE, {
    firma: FIRMA, datos: { abierto: true, sesion: sesionDeEjemplo() }, scrollY: GUARDADO,
  });
  marcarVuelta(RUTA);
  assert.equal(viajeDeVuelta(base).scrollY, GUARDADO);
});
