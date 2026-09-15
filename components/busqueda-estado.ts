// El estado de la búsqueda con texto (resultados + aviso "la fuente no
// responde"), como reductor PURO. Etapa 3.a (#19), corrección tras la
// auditoría de Codex sobre e930a1d (hallazgo 4).
//
// 🔴 EL AGUJERO. `SearchView` ponía `fuenteCaida = true` ante un 503 con motivo
// de TMDB y sólo lo pisaba con la siguiente respuesta que LLEGABA. Si la
// búsqueda siguiente fallaba por red (`catch`), se cancelaba (respuesta vieja
// descartada) o el término bajaba de 2 letras (sin pedido), el aviso viejo
// quedaba en pantalla. El aviso tiene que corresponder ÚNICAMENTE a la
// respuesta vigente: cualquier evento que no sea "llegó un 503 de TMDB para el
// pedido vigente" lo apaga.
//
// Sin DOM: se prueba con `node --test`, como el resto de la lógica de hooks.
import { motivoDeRespuesta } from "./api-motivo.ts";
import type { UIPerson, UITitle } from "../lib/types.ts";

export interface Resultados { titles: UITitle[]; people: UIPerson[] }
export interface EstadoBusqueda {
  res: Resultados;
  cargando: boolean;
  /** La respuesta VIGENTE fue un 503 con motivo `tmdb-no-disponible`. */
  fuenteCaida: boolean;
}
export const ESTADO_INICIAL: EstadoBusqueda = { res: { titles: [], people: [] }, cargando: false, fuenteCaida: false };

export type EventoBusqueda =
  | { tipo: "nuevo-termino" }
  | { tipo: "termino-corto" }
  | { tipo: "respuesta"; ok: boolean; body: unknown; /** false si el pedido ya fue superado por otro */ vigente?: boolean }
  | { tipo: "fallo-red" }
  | { tipo: "restaurado"; res: Resultados };

export function reducirBusqueda(estado: EstadoBusqueda, e: EventoBusqueda): EstadoBusqueda {
  switch (e.tipo) {
    case "nuevo-termino":
      // Empieza otro pedido: el aviso del anterior ya no describe nada.
      return { ...estado, cargando: true, fuenteCaida: false };
    case "termino-corto":
      return { res: { titles: [], people: [] }, cargando: false, fuenteCaida: false };
    case "fallo-red":
      return { ...estado, cargando: false, fuenteCaida: false };
    case "restaurado":
      return { res: e.res, cargando: false, fuenteCaida: false };
    case "respuesta": {
      if (e.vigente === false) return estado;
      const b = (e.body && typeof e.body === "object" ? e.body : {}) as Partial<Resultados>;
      return {
        res: { titles: b.titles ?? [], people: b.people ?? [] },
        cargando: false,
        fuenteCaida: motivoDeRespuesta(e.ok, e.body) === "tmdb-no-disponible",
      };
    }
  }
}
