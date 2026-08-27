// MOTOR DE LA TRAZA del selector de avatares.
//
// ⚠️ TEMPORAL. Existe sólo para diagnosticar el issue #15 —la demora ocasional
// en aperturas calientes— y **no entra en el merge final**. Vive en la rama
// `diag/panel` y ahí se queda.
//
// Es la MISMA lógica que `scripts/traza-avatares.js`, el snippet de consola ya
// validado con 31 comprobaciones; se porta a un módulo porque Chrome bloquea el
// pegado en la consola por autoprotección y no hay que desactivar esa protección.
// Lo que cambia es de dónde se lo llama, no lo que mide.
//
// LO QUE NO HACE, y son garantías, no intenciones: no borra ni modifica ninguna
// caché —`preparar()` limpia únicamente los REGISTROS de Performance—, no guarda
// ningún avatar, no hace ninguna petición propia y no manda la traza a ningún
// lado. Copiar al portapapeles pasa sólo cuando se aprieta el botón.

/** A partir de cuánto una DURACIÓN se considera lenta. */
export const LENTA_MS = 1000;

/** La URL sin la marca del reintento: los dos registros de un avatar se agrupan. */
export const claveAvatar = (url: string): string => url.replace(/[?&]reintento=1\b/, "");

/** ¿Este registro es del reintento y no del pedido original? */
export const esReintento = (url: string): boolean => /[?&]reintento=1\b/.test(url);

const red2 = (n: number): number => +n.toFixed(1);

export interface Instantes {
  tCreado: number;
  tEvento: number | null;
  inicioMs: number | null;
  decodeMs: number | null;
}

export interface Duraciones {
  esperaInicioMs: number | null;
  cargaMs: number | null;
  listaMs: number | null;
}

/**
 * Las duraciones derivadas de la cronología.
 *
 * EL PUNTO DE QUE EXISTAN: los instantes cuentan desde `preparar()`, así que
 * incluyen el TIEMPO HUMANO hasta el clic. Con dos segundos de demora, las 31
 * filas tenían `tEvento > 2000` y se marcaban lentas aunque hubieran cargado al
 * instante. Sólo estas duraciones dicen si algo tardó.
 */
export function derivadas(i: Instantes): Duraciones {
  const cargaMs = i.tEvento !== null ? red2(i.tEvento - i.tCreado) : null;
  const esperaInicioMs = i.inicioMs !== null ? red2(i.inicioMs - i.tCreado) : null;
  const listaMs = cargaMs !== null && typeof i.decodeMs === "number"
    ? red2(cargaMs + i.decodeMs) : null;
  return { esperaInicioMs, cargaMs, listaMs };
}

export interface Fila extends Duraciones {
  archivo: string;
  url: string;
  avatar: string;
  reintento: boolean;
  evento: string;
  complete: boolean;
  naturalWidth: number;
  decodeMs: number | null;
  durMs: number | null;
  tCreado: number;
  inicioMs: number | null;
  finMs: number | null;
  tEvento: number | null;
  workerStartMs: number | null;
  porSW: boolean | null;
  transferSize: number | null;
  encodedBodySize: number | null;
  decodedBodySize: number | null;
  entrega: string;
  enCacheAntes: string;
}

/**
 * ¿Esta fila fue lenta? **Por duraciones, nunca por instantes.** Un instante
 * alto sólo dice que pasó tiempo desde `preparar()`, y ahí adentro está el
 * tiempo humano hasta el clic.
 */
export const esLenta = (f: Pick<Fila, "cargaMs" | "esperaInicioMs" | "durMs" | "decodeMs" | "listaMs">): boolean =>
  (f.cargaMs ?? 0) > LENTA_MS
  || (f.esperaInicioMs ?? 0) > LENTA_MS
  || (f.durMs ?? 0) > LENTA_MS
  || (f.decodeMs ?? 0) > LENTA_MS
  || (f.listaMs ?? 0) > LENTA_MS;

/**
 * Agrupa las filas POR AVATAR. Con reintento hay dos registros del mismo avatar
 * y uno solo cuenta como resultado: el último.
 */
export function agrupar<T extends { avatar: string }>(filas: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const f of filas) {
    const l = m.get(f.avatar) ?? [];
    l.push(f);
    m.set(f.avatar, l);
  }
  return m;
}

export interface Contexto {
  caches: string[];
  avataresYaEnCache: number;
  cualesEnCache: Record<string, string[]>;
  sw: string;
  swScript: string | null;
  red: { tipo: string | null; downlinkMbps: number | null; rtt: number | null; ahorroDatos: boolean | null };
  visibilidad: string;
  memoriaGB: number | null;
  nucleos: number | null;
  pestanaAbiertaHaceMs: number;
  href: string;
}

export interface Informe {
  apertura: number;
  contexto: Contexto | null;
  registros: number;
  avatares: number;
  conReintento: number;
  ok: number;
  sinIniciar: number;
  fallos: number;
  sinEntradaDeRecurso: number;
  maxEsperaInicio: number;
  maxCarga: number;
  maxDecode: number;
  maxLista: number;
  maxDur: number;
  humanoMs: number | null;
  maxTEvento: number;
  maxInicio: number;
  bytesTransferidos: number;
  porSW: number;
  lentas: number;
  filas: Fila[];
}

interface Registro {
  url: string;
  tCreado: number;
  evento: string;
  tEvento?: number;
  decodeMs?: number | null;
  el: HTMLImageElement;
}

/** Crea un medidor. Uno por sesión de diagnóstico. */
export function crearTraza() {
  const historial: Informe[] = [];
  let obs: MutationObserver | null = null;
  let imgs: Registro[] = [];
  let t0 = 0;
  let enCacheAntes: Record<string, string[]> = {};
  let contexto: Contexto | null = null;
  // Sin esto cada imagen entra DOS veces: `MutationObserver` entrega los cambios
  // DESPUÉS de aplicarlos, así que el registro del contenedor —agregado vacío— ya
  // lo encontrás con sus 31 hijos, y después llegan los 31 de los hijos.
  let vistas = new WeakSet<Element>();

  const abs = (u: string) => { try { return new URL(u, location.origin).href; } catch { return u; } };
  const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function preparar() {
    if (document.querySelector(".avgrid")) {
      throw new Error("cerrá el selector antes de preparar la apertura");
    }
    // Sólo los REGISTROS de Performance. Ninguna caché se toca.
    performance.clearResourceTimings();
    imgs = [];
    vistas = new WeakSet();
    enCacheAntes = {};

    const nombres = await caches.keys();
    for (const n of nombres) {
      const c = await caches.open(n);
      for (const req of await c.keys()) {
        if (req.url.includes("/avatars/")) (enCacheAntes[req.url] ||= []).push(n);
      }
    }

    const c = (navigator as unknown as { connection?: Record<string, unknown> }).connection ?? {};
    contexto = {
      caches: nombres,
      avataresYaEnCache: Object.keys(enCacheAntes).length,
      cualesEnCache: enCacheAntes,
      sw: navigator.serviceWorker?.controller ? "controla la página" : "NO controla",
      swScript: navigator.serviceWorker?.controller?.scriptURL ?? null,
      red: {
        tipo: (c.effectiveType as string) ?? null,
        downlinkMbps: (c.downlink as number) ?? null,
        rtt: (c.rtt as number) ?? null,
        ahorroDatos: (c.saveData as boolean) ?? null,
      },
      visibilidad: document.visibilityState,
      memoriaGB: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
      nucleos: navigator.hardwareConcurrency ?? null,
      pestanaAbiertaHaceMs: Math.round(performance.now()),
      href: location.href,
    };

    obs?.disconnect();
    obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const nodo of m.addedNodes) {
          if (!(nodo instanceof HTMLElement)) continue;
          const candidatos: HTMLImageElement[] = nodo.matches("img")
            ? [nodo as HTMLImageElement]
            : [...nodo.querySelectorAll("img")];
          for (const im of candidatos) {
            if (!im.closest(".avgrid") || vistas.has(im)) continue;
            vistas.add(im);
            const reg: Registro = {
              url: abs(im.currentSrc || im.src),
              tCreado: red2(performance.now() - t0),
              evento: "pendiente",
              el: im,
            };
            imgs.push(reg);
            const marcar = (ev: string) => {
              if (reg.evento !== "pendiente") return;
              reg.evento = ev;
              reg.tEvento = red2(performance.now() - t0);
              const td = performance.now();
              // `decode()` puede rechazar: ahí queda en null, pero la clave se
              // escribe igual para que la espera final no se cuelgue.
              (im.decode ? im.decode() : Promise.resolve()).then(
                () => { reg.decodeMs = red2(performance.now() - td); },
                () => { reg.decodeMs = null; },
              );
            };
            if (im.complete) marcar(im.naturalWidth > 0 ? "load" : "error");
            im.addEventListener("load", () => marcar("load"), { once: true });
            im.addEventListener("error", () => marcar("error"), { once: true });
          }
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    t0 = performance.now();
    return contexto;
  }

  /**
   * Espera a que la apertura se ASIENTE y arma el informe. No cuenta hasta 31:
   * espera a que todo registro tenga su evento Y su `decode()` resuelto, y a que
   * no aparezcan registros nuevos durante `quietoMs`. Así una apertura con
   * reintento —más de 31 registros— no rompe los conteos.
   */
  async function finalizar({ esperaMs = 20000, quietoMs = 600 } = {}): Promise<Informe> {
    const t = performance.now();
    let cuenta = imgs.length;
    let ultimoCambio = performance.now();
    while (performance.now() - t < esperaMs) {
      if (imgs.length !== cuenta) { cuenta = imgs.length; ultimoCambio = performance.now(); }
      const listas = imgs.length > 0 && imgs.every((r) => r.evento !== "pendiente" && "decodeMs" in r);
      if (listas && performance.now() - ultimoCambio > quietoMs) break;
      await dormir(100);
    }

    const filas: Fila[] = imgs.map((reg) => {
      const e = performance.getEntriesByName(reg.url).at(-1) as PerformanceResourceTiming | undefined;
      const im = reg.el;
      const ws = e && e.workerStart > 0 ? red2(e.workerStart - t0) : null;
      const tEvento = reg.tEvento ?? null;
      const inicioMs = e ? red2(e.startTime - t0) : null;
      const decodeMs = reg.decodeMs ?? null;
      const d = derivadas({ tCreado: reg.tCreado, tEvento, inicioMs, decodeMs });
      return {
        archivo: reg.url.split("/").pop() ?? reg.url,
        url: reg.url,
        avatar: claveAvatar(reg.url).split("/").pop() ?? reg.url,
        reintento: esReintento(reg.url),
        evento: reg.evento,
        complete: im.complete,
        naturalWidth: im.naturalWidth,
        ...d,
        decodeMs,
        durMs: e ? red2(e.duration) : null,
        tCreado: reg.tCreado,
        inicioMs,
        finMs: e ? red2(e.responseEnd - t0) : null,
        tEvento,
        workerStartMs: ws,
        porSW: e ? e.workerStart > 0 : null,
        transferSize: e?.transferSize ?? null,
        encodedBodySize: e?.encodedBodySize ?? null,
        decodedBodySize: e?.decodedBodySize ?? null,
        entrega: (e as unknown as { deliveryType?: string })?.deliveryType ?? "",
        enCacheAntes: (enCacheAntes[claveAvatar(reg.url)] || []).join(",") || "NO",
      };
    });

    const porAvatar = agrupar(filas);
    const finales = [...porAvatar.values()].map((l) => l[l.length - 1]);
    const maxDe = (campo: keyof Fila) =>
      Math.max(0, ...filas.map((f) => (typeof f[campo] === "number" ? (f[campo] as number) : 0)));

    const r: Informe = {
      apertura: historial.length + 1,
      contexto,
      registros: filas.length,
      avatares: porAvatar.size,
      conReintento: [...porAvatar.values()].filter((l) => l.length > 1).length,
      ok: finales.filter((f) => f.complete && f.naturalWidth > 0).length,
      sinIniciar: finales.filter((f) => !f.complete).length,
      fallos: finales.filter((f) => f.complete && f.naturalWidth === 0).length,
      sinEntradaDeRecurso: filas.filter((f) => f.durMs === null).length,
      maxEsperaInicio: maxDe("esperaInicioMs"),
      maxCarga: maxDe("cargaMs"),
      maxDecode: maxDe("decodeMs"),
      maxLista: maxDe("listaMs"),
      maxDur: maxDe("durMs"),
      humanoMs: filas.length ? Math.min(...filas.map((f) => f.tCreado)) : null,
      maxTEvento: maxDe("tEvento"),
      maxInicio: maxDe("inicioMs"),
      bytesTransferidos: filas.reduce((a, f) => a + (f.transferSize || 0), 0),
      porSW: filas.filter((f) => f.porSW).length,
      lentas: filas.filter(esLenta).length,
      filas,
    };
    historial.push(r);
    return r;
  }

  const volcar = (n?: number) =>
    JSON.stringify(n ? historial[n - 1] : historial.at(-1), null, 1);

  const detener = () => { obs?.disconnect(); obs = null; };

  return { preparar, finalizar, volcar, detener, historial };
}
