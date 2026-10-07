// Cliente de TMDB para el mantenimiento de la ruleta, instrumentado y con
// frenos. Lo usan los pasos que SÍ consultan TMDB (descubrir, detalle,
// disponibilidad, colección); el plan no lo crea nunca.
//
// Por qué no se reusa el `tmdb()` de los scripts viejos: aquel reintentaba un
// 429 hasta cinco veces sin contarlo, con 8 pedidos en paralelo y sin ritmo, y
// devolvía `null` tanto para "no existe" como para "se cayó la red". Acá:
//
//   - CADA intento HTTP cuenta, también los reintentos. Es lo único que mide lo
//     que TMDB realmente recibió (MANTENIMIENTO §8.b: un contador que sólo
//     mira los éxitos se engaña solo).
//   - El presupuesto se controla ANTES de cada intento: si el próximo lo
//     superaría, se lanza `PresupuestoAgotado` y no sale ningún pedido más.
//     El llamador corta limpio; lo ya terminado quedó en el diario.
//   - Ritmo: un pedido como máximo cada `ritmoMs`, medido desde el COMIENZO
//     del anterior. Si el trabajo de en medio ya tardó más, no se espera nada:
//     no hay demoras fijas.
//   - Un 429 respeta `Retry-After` (segundos o fecha HTTP) y además frena a
//     TODOS los pedidos, no sólo al que lo recibió.
//   - `fetch`, `esperar` y `ahora` se inyectan: los tests corren sin red y sin
//     esperar de verdad.

export class PresupuestoAgotado extends Error {
  constructor(presupuesto) {
    super(`presupuesto de ${presupuesto} intentos HTTP alcanzado`);
    this.name = "PresupuestoAgotado";
  }
}

/**
 * Modo "un 429 = parar" (pedido por el dueño para las corridas grandes): el
 * primer 429 corta TODO, sin esperar el Retry-After ni reintentar. Lo terminado
 * queda en el diario y la próxima corrida retoma.
 */
export class Detenido429 extends Error {
  constructor(ruta, retryAfter) {
    super(`429 en ${ruta}${retryAfter ? ` (Retry-After: ${retryAfter})` : ""}: corrida detenida`);
    this.name = "Detenido429";
    this.retryAfter = retryAfter ?? null;
  }
}

/** Fallo definitivo de una operación (agotó reintentos o es un 4xx). */
export class FalloTmdb extends Error {
  constructor(op, ruta, status, detalle) {
    super(`${op} ${ruta}: ${status ?? "red"}${detalle ? ` (${detalle})` : ""}`);
    this.name = "FalloTmdb";
    this.status = status ?? null;
  }
}

const RETRY_AFTER_DEFECTO_S = 2;
const RETRY_AFTER_TOPE_S = 60;

/** `Retry-After` en milisegundos: segundos enteros o fecha HTTP. */
export function retryAfterMs(valor, ahoraMs) {
  if (valor == null || valor === "") return RETRY_AFTER_DEFECTO_S * 1000;
  const n = Number(valor);
  let ms;
  if (Number.isFinite(n)) ms = n * 1000;
  else {
    const fecha = Date.parse(valor);
    ms = Number.isFinite(fecha) ? fecha - ahoraMs : RETRY_AFTER_DEFECTO_S * 1000;
  }
  return Math.min(Math.max(ms, 0), RETRY_AFTER_TOPE_S * 1000);
}

export function crearClienteTmdb({
  token,
  fetchImpl = globalThis.fetch,
  esperar = (ms) => new Promise((r) => setTimeout(r, ms)),
  ahora = () => Date.now(),
  base = "https://api.themoviedb.org/3",
  ritmoMs = 250,
  presupuesto = Infinity,
  max429 = 3,
  maxErroresTransitorios = 2,
  timeoutMs = 15000,
  detenerEn429 = false,
} = {}) {
  if (!token) throw new Error("falta el token de TMDB");

  const m = {
    intentos: 0, exitos: 0, fallos: 0, reintentos: 0, r429: 0,
    esperaRitmoMs: 0, esperaRetryAfterMs: 0,
    porOperacion: {},
  };
  const op = (nombre) =>
    (m.porOperacion[nombre] ??= { intentos: 0, exitos: 0, fallos: 0, reintentos: 0, r429: 0 });

  // Momento a partir del cual puede salir el próximo pedido. Lo mueven el
  // ritmo y los 429 (que frenan a todos).
  let proximoPermitido = 0;

  async function turno() {
    const t = ahora();
    const espera = proximoPermitido - t;
    if (espera > 0) {
      m.esperaRitmoMs += espera;
      await esperar(espera);
    }
    proximoPermitido = Math.max(ahora(), proximoPermitido) + ritmoMs;
  }

  function consumirIntento(nombre) {
    if (m.intentos >= presupuesto) throw new PresupuestoAgotado(presupuesto);
    m.intentos++;
    op(nombre).intentos++;
  }

  /**
   * Un pedido lógico. Devuelve el JSON, o `null` si TMDB respondió 404 (el
   * título ya no existe: es un dato, no un error de red). Cualquier otro fallo
   * definitivo lanza `FalloTmdb`.
   */
  async function pedir(nombre, ruta, params = {}) {
    const url = new URL(base + ruta);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    let n429 = 0;
    let nTransitorios = 0;
    for (let intento = 0; ; intento++) {
      consumirIntento(nombre);
      if (intento > 0) { m.reintentos++; op(nombre).reintentos++; }
      await turno();

      let res;
      try {
        res = await fetchImpl(url, {
          headers: { accept: "application/json", authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        if (nTransitorios++ < maxErroresTransitorios) {
          await esperar(1000 * 2 ** (nTransitorios - 1));
          continue;
        }
        m.fallos++; op(nombre).fallos++;
        throw new FalloTmdb(nombre, ruta, null, e?.name ?? "error de red");
      }

      if (res.status === 429) {
        m.r429++; op(nombre).r429++;
        if (detenerEn429) { m.fallos++; op(nombre).fallos++; throw new Detenido429(ruta, res.headers?.get?.("retry-after")); }
        const ms = retryAfterMs(res.headers?.get?.("retry-after"), ahora());
        // Frena a todos: el próximo pedido, de quien sea, sale después.
        proximoPermitido = Math.max(proximoPermitido, ahora() + ms);
        m.esperaRetryAfterMs += ms;
        if (n429++ < max429) continue;
        m.fallos++; op(nombre).fallos++;
        throw new FalloTmdb(nombre, ruta, 429, `${max429} reintentos agotados`);
      }
      if (res.status >= 500) {
        if (nTransitorios++ < maxErroresTransitorios) {
          await esperar(1000 * 2 ** (nTransitorios - 1));
          continue;
        }
        m.fallos++; op(nombre).fallos++;
        throw new FalloTmdb(nombre, ruta, res.status);
      }
      if (res.status === 404) {
        m.exitos++; op(nombre).exitos++;
        return null;
      }
      if (!res.ok) {
        m.fallos++; op(nombre).fallos++;
        throw new FalloTmdb(nombre, ruta, res.status);
      }
      const json = await res.json();
      m.exitos++; op(nombre).exitos++;
      return json;
    }
  }

  return {
    pedir,
    metricas: () => structuredClone(m),
    restantes: () => (presupuesto === Infinity ? Infinity : presupuesto - m.intentos),
  };
}
