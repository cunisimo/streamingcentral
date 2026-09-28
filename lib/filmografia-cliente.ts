// El estado de la ficha de persona en el CLIENTE (issue #25): qué se pide,
// cuándo y qué se descarta. Módulo PURO y apto para el cliente: `PersonView` lo
// usa con `fetch` y los tests con un transporte que CUENTA las peticiones.
//
// 🔴 LAS PLATAFORMAS NO ENTRAN ACÁ, y eso es lo que garantiza que cambiarlas no
// cueste nada. La disponibilidad de una obra (en qué plataformas está) no
// depende de cuáles elegiste: sólo el ORDEN depende, y el orden se calcula al
// dibujar (`ordenVisible`). La versión anterior pedía la ficha con `useApi`,
// que vuelve a pedir cada vez que cambian las plataformas: persona, créditos y
// el bloque inicial otra vez, para obtener exactamente los mismos datos.
//
// Peticiones, todas a la misma ruta y con el contrato v2 explícito:
//   abrir(persona)   → 1 (persona + créditos + bloque inicial, del servidor)
//   verMas(sección)  → 1 con las obras del bloque siguiente aún no resueltas
//                      (0 si ya estaban todas resueltas)
//   reintentar       → 1 con las fallidas visibles de esa sección
//   restaurar        → 0 (volver desde una ficha)
//   plataformas      → 0
import { BLOQUE, claveDe, siguienteBloque, VERSION_FILMOGRAFIA, type Seccion } from "./filmografia-bloques.ts";
import type { DisponibilidadObras, FilmografiaPersona, PlatformCode } from "./types.ts";

export const urlApertura = (id: string) => `/api/person/${encodeURIComponent(id)}?filmografia=${VERSION_FILMOGRAFIA}`;
export const urlItems = (id: string, claves: string[]) =>
  `/api/person/${encodeURIComponent(id)}?filmografia=${VERSION_FILMOGRAFIA}&items=${claves.join(",")}`;

/** El transporte falló sin respuesta (sin conexión): la vista muestra "offline". */
export class ErrorDeRed extends Error {}

export interface Transporte {
  pedir<T>(ruta: string, senal: AbortSignal): Promise<T>;
}

export type Visibles = Record<Seccion, number>;
export interface Vista {
  base: FilmografiaPersona;
  disp: Record<string, PlatformCode[]>;
  /** Consultas fallidas: "sin datos", nunca "no está". */
  sinDatos: string[];
  visibles: Visibles;
}
export interface EstadoFilmografia {
  personId: string | null;
  fase: "vacia" | "cargando" | "lista" | "offline" | "error";
  vista: Vista | null;
  /** Sección con un "Ver más" o un reintento en vuelo. */
  cargando: Seccion | null;
}

export function crearControladorFilmografia(t: Transporte, notificar: (e: EstadoFilmografia) => void) {
  let e: EstadoFilmografia = { personId: null, fase: "vacia", vista: null, cargando: null };
  let generacion = 0;
  let control = new AbortController();
  const poner = (cambio: Partial<EstadoFilmografia>) => { e = { ...e, ...cambio }; notificar(e); };
  const nuevaGeneracion = () => { generacion++; control.abort(); control = new AbortController(); return generacion; };

  const clavesDe = (s: Seccion) => (e.vista?.base[s] ?? []).map(claveDe);

  async function consultar(s: Seccion, pedir: string[], hasta: number) {
    const g = generacion;
    const personId = e.personId!;
    poner({ cargando: s });
    let r: DisponibilidadObras;
    if (!pedir.length) {
      r = { disponibilidad: {}, sinDisponibilidad: [] };
    } else {
      try {
        r = await t.pedir<DisponibilidadObras>(urlItems(personId, pedir), control.signal);
      } catch {
        if (g !== generacion) return; // era de otra persona: no se toca nada
        // Un fallo ABRE igual el bloque: las obras se ven con sus datos básicos
        // y "Sin datos de disponibilidad". Nunca se pierden ni se afirman ausentes.
        r = { disponibilidad: {}, sinDisponibilidad: pedir };
      }
    }
    if (g !== generacion || !e.vista) return;
    const v = e.vista;
    poner({
      cargando: null,
      vista: {
        ...v,
        disp: { ...v.disp, ...r.disponibilidad },
        sinDatos: [...v.sinDatos.filter((k) => !(k in r.disponibilidad)), ...r.sinDisponibilidad.filter((k) => !v.sinDatos.includes(k))],
        visibles: { ...v.visibles, [s]: Math.max(v.visibles[s], hasta) },
      },
    });
  }

  return {
    estado: () => e,

    /** Persona nueva (o la misma, reintentando): una petición. */
    async abrir(personId: string) {
      const g = nuevaGeneracion();
      poner({ personId, fase: "cargando", vista: null, cargando: null });
      try {
        const base = await t.pedir<FilmografiaPersona>(urlApertura(personId), control.signal);
        if (g !== generacion) return;
        poner({
          fase: "lista",
          vista: { base, disp: { ...base.disponibilidad }, sinDatos: [...base.sinDisponibilidad], visibles: { ...base.inicial } },
        });
      } catch (err) {
        if (g !== generacion) return;
        poner({ fase: err instanceof ErrorDeRed ? "offline" : "error" });
      }
    },

    /** Volver desde una ficha: la vista guardada, sin ninguna petición. */
    restaurar(personId: string, vista: Vista) {
      nuevaGeneracion();
      poner({ personId, fase: "lista", vista, cargando: null });
    },

    /** "Ver más": el bloque siguiente de esa sección, sin repetir lo ya resuelto. */
    async verMas(s: Seccion) {
      const v = e.vista;
      if (!v || e.cargando) return;
      const resuelta = (k: string) => k in v.disp || v.sinDatos.includes(k);
      const { hasta, pedir } = siguienteBloque(clavesDe(s), v.visibles[s], resuelta);
      await consultar(s, pedir, hasta);
    },

    /** Vuelve a consultar las visibles de esa sección que quedaron "sin datos". */
    async reintentar(s: Seccion) {
      const v = e.vista;
      if (!v || e.cargando) return;
      const fallidas = clavesDe(s).slice(0, v.visibles[s]).filter((k) => v.sinDatos.includes(k)).slice(0, BLOQUE);
      await consultar(s, fallidas, v.visibles[s]);
    },

    /** Desmontaje: lo que esté en vuelo se cancela y no se aplica. */
    cerrar() { nuevaGeneracion(); },
  };
}
