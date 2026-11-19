// El contrato entre el editor del Top (components/admin/top/TopEditor.tsx) y
// quien guarda. Sólo tipos.
//
// Hay DOS implementaciones y por eso existe el contrato:
//  - la real, en `app/admin/top/page.tsx`, que habla con `/api/admin/top` y
//    `/api/admin-search` con el token del admin;
//  - la del banco local (`lib/banco-top.ts`), en memoria, con demora y fallos a
//    pedido, para probar el editor sin tocar la base de Producción.
import type { MediaType, PlatformCode } from "./types";
import type { OpTop, RankingFila } from "./top-editor-nucleo";

export interface RespuestaTop {
  borradores: RankingFila[];
  /** Claves `plataforma:tipo` con al menos una publicación. */
  publicados: string[];
}

export interface ResultadoPublicacion {
  ranking_id: string; plataforma: string | null; tipo: string | null;
  publicado: boolean; motivo: string | null;
}

export interface CandidatoTop {
  id: number;
  tipo: MediaType;
  titulo: string;
  year: number | null;
  poster: string | null;
  plataformas: PlatformCode[];
  /** `false` = TMDB todavía no lo confirma en la plataforma para AR. No bloquea. */
  confirmadoEnPlataforma: boolean;
  tituloOriginal?: string | null;
  resumen?: string | null;
}

/** Un error de guardado. `conflicto` = el bloque cambió (409): hay que recargar. */
export class ErrorTop extends Error {
  readonly conflicto: boolean;
  constructor(mensaje: string, conflicto = false) { super(mensaje); this.conflicto = conflicto; }
}

export interface TransporteTop {
  leer(): Promise<RespuestaTop>;
  escribir(op: OpTop): Promise<RespuestaTop>;
  publicar(ids: string[]): Promise<RespuestaTop & { resultados: ResultadoPublicacion[] }>;
  buscar(q: string, tipo: MediaType, plataforma: PlatformCode, signal?: AbortSignal): Promise<CandidatoTop[]>;
}
