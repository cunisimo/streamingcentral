// Orquestación de la preparación de una tanda, con dependencias inyectadas.
// Sin `server-only` a propósito: se prueba con node --test y dobles. Quien la
// cablea con Supabase (service_role), `cardsByIds` y `roulettePlatformNames`
// es lib/sala/preparar.ts, que sí es server-only.
//
// SECUENCIA (todo lo que escribe pasa por RPCs de servidor):
//   1. sala_iniciar_preparacion  → CAS lobby|resultado → preparando; congela la
//      unión; devuelve ronda, prep_token, unión y excluidos.
//   2. sala_candidatos           → hasta TOPE_CANDIDATAS del pool curado, en el
//      orden de la semilla (el room_id), sin popularidad ni nota.
//   3. cardsByIds por lotes      → sólo lo necesario para llenar `size`. Acá es
//      donde TMDB/Redis intervienen (card: 24 h, pv3: 8 h): la disponibilidad
//      puede tener hasta 24 h de antigüedad.
//   4. sala_publicar_ronda       → atómica: todas las cards o ninguna; fija
//      started_at/deadline_at.
//   Si no alcanza o algo lanza: sala_abortar_preparacion (idempotente) y la
//   sala vuelve al estado anterior con un motivo accionable. Si hasta abortar
//   falla, el barrido lo hace a los 90 s: una sala no queda en `preparando`.
import type { MediaType, UITitle } from "../types.ts";
import { elegirCards, tamaniosAlcanzables } from "./preparacion-nucleo.ts";
import type { Candidata, Duracion, ResultadoPreparar, Size } from "./tipos.ts";

/** Candidatas que se piden a la base. La RPC capa en 80. */
export const TOPE_CANDIDATAS = 80;
/**
 * Tope de cards que se enriquecen por lote. El lote real es min(LOTE_CARDS, size):
 * medido en local, enriquecer 20 para una tanda de 5 costaba 40 llamadas a TMDB
 * en frío (2 por card) para usar 5; con el lote del tamaño de la tanda son 10, y
 * sólo si alguna se cae por la unión o por TMDB se pide un segundo lote.
 */
export const LOTE_CARDS = 20;
/** Primer lote: el tamaño de la tanda. */
export const loteDe = (size: number) => Math.min(LOTE_CARDS, size);
/**
 * Lotes siguientes: el doble de lo que falta, entre 5 y 20. Medido en local:
 * con un segundo lote fijo de 20, una tanda de 20 a la que se le cayeron 2
 * cards pagaba 40 llamadas más a TMDB para usar 2.
 */
export const loteSiguiente = (faltan: number) => Math.max(5, Math.min(LOTE_CARDS, faltan * 2));

export interface DepsPreparar {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
  cards: (pairs: { tipo: MediaType; id: number }[]) => Promise<UITitle[]>;
  nombres: (codes: string[]) => string[];
}

export interface ArgsPreparar {
  roomId: string;
  hostUid: string;
  size: Size;
  duracion: Duracion;
}

interface Inicio { round_id: string; prep_token: string; numero: number; union: string[]; excluir: number[] }

function motivoDeInicio(e: unknown): ResultadoPreparar {
  const m = e instanceof Error ? e.message : String(e);
  if (/sala_sin_quorum/.test(m)) return { ok: false, motivo: "sin_quorum" };
  if (/sala_estado_no_permite/.test(m)) return { ok: false, motivo: "estado" };
  if (/sala_no_es_host/.test(m)) return { ok: false, motivo: "no_es_host" };
  if (/sala_desactivadas/.test(m)) return { ok: false, motivo: "desactivadas" };
  return { ok: false, motivo: "fallo", detalle: m };
}

export async function prepararRonda(deps: DepsPreparar, a: ArgsPreparar): Promise<ResultadoPreparar> {
  let ini: Inicio;
  try {
    ini = (await deps.rpc("sala_iniciar_preparacion", { p_room: a.roomId, p_host: a.hostUid, p_size: a.size, p_duracion: a.duracion })) as Inicio;
  } catch (e) {
    return motivoDeInicio(e);
  }

  const abortar = async () => {
    try { await deps.rpc("sala_abortar_preparacion", { p_round: ini.round_id, p_prep_token: ini.prep_token }); } catch { /* el barrido la aborta a los 90 s */ }
  };

  try {
    const candidatas = (await deps.rpc("sala_candidatos", {
      p_providers: deps.nombres(ini.union), p_duracion: a.duracion, p_excluir: ini.excluir, p_seed: a.roomId, p_limit: TOPE_CANDIDATAS,
    })) as Candidata[];

    // Enriquecer por lotes, en el orden de la semilla, hasta llenar.
    const mapa = new Map<number, UITitle>();
    let seleccion = elegirCards(candidatas, mapa, ini.union as UITitle["platforms"], a.size);
    let i = 0;
    let paso = loteDe(a.size);
    let consultadas = 0;
    while (i < candidatas.length && seleccion.cards.length < a.size) {
      const lote = candidatas.slice(i, i + paso);
      const cards = await deps.cards(lote.map((c) => ({ tipo: "movie" as const, id: c.tmdb_id })));
      for (const c of cards) mapa.set(c.id, c);
      i += lote.length;
      consultadas += lote.length;
      seleccion = elegirCards(candidatas.slice(0, i), mapa, ini.union as UITitle["platforms"], a.size);
      paso = loteSiguiente(seleccion.faltan);
    }

    if (seleccion.cards.length < a.size) {
      await abortar();
      return { ok: false, motivo: "insuficientes", alcanzables: tamaniosAlcanzables(seleccion.validas) };
    }

    const pub = (await deps.rpc("sala_publicar_ronda", {
      p_round: ini.round_id, p_prep_token: ini.prep_token, p_titulos: seleccion.cards,
    })) as { ok: boolean; started_at: string; deadline_at: string };
    return {
      ok: true, round_id: ini.round_id, numero: ini.numero, started_at: pub.started_at, deadline_at: pub.deadline_at,
      consultadas, enriquecidas: mapa.size, descartadas: consultadas - seleccion.validas,
    };
  } catch (e) {
    await abortar();
    return { ok: false, motivo: "fallo", detalle: e instanceof Error ? e.message : String(e) };
  }
}
