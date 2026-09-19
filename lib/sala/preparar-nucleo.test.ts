// Orquestación de la preparación de una tanda, con dependencias inyectadas
// (plan de salas, Tarea 2.2). No toca red: `rpc`, `cards` y `nombres` son
// dobles. Lo que fija:
//   - la secuencia iniciar → candidatos → enriquecer por lotes → publicar;
//   - con menos válidas que `size` se ABORTA y se informan los tamaños
//     alcanzables (no se publica una tanda corta ni se reduce en silencio);
//   - una excepción en cualquier paso posterior a iniciar aborta la ronda
//     (idempotente) y devuelve `fallo`;
//   - los errores de la RPC de inicio se traducen a motivos, sin abortar nada
//     porque no se llegó a crear la ronda;
//   - la publicación recibe EXACTAMENTE `size` cards con pos 0..size-1;
//   - `p_seed` de las candidatas es el room_id (la semilla de desempate de la
//     sala es otra y no se expone).
import { test } from "node:test";
import assert from "node:assert/strict";
import { prepararRonda, TOPE_CANDIDATAS, LOTE_CARDS, loteDe, loteSiguiente } from "./preparar-nucleo.ts";
import type { Candidata } from "./tipos.ts";
import type { UITitle } from "../types.ts";

const card = (id: number, platforms: string[]): UITitle => ({
  id, type: "movie", title: "T" + id, year: 2001, runtime: null, poster: null, country: null,
  genres: ["drama"], platforms: platforms as UITitle["platforms"], tmdb: null, hasEditorial: false,
});
const cand = (id: number): Candidata => ({ tmdb_id: id, runtime: 100, razon: "r" + id, advertencia: null, year: 2001, genres: [] });

function arnes(opts: { candidatas: Candidata[]; enUnion: (id: number) => boolean; iniciarFalla?: string; cardsFalla?: boolean; sinCard?: number[] }) {
  const llamadas: { fn: string; args: Record<string, unknown> }[] = [];
  const deps = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      llamadas.push({ fn, args });
      if (fn === "sala_iniciar_preparacion") {
        if (opts.iniciarFalla) throw new Error(`sala_iniciar_preparacion: ${opts.iniciarFalla} [55000]`);
        return { round_id: "R1", prep_token: "P1", numero: 1, union: ["n", "d"], excluir: [99] };
      }
      if (fn === "sala_candidatos") return opts.candidatas;
      if (fn === "sala_publicar_ronda") return { ok: true, started_at: "2026-09-19T00:00:00Z", deadline_at: "2026-09-19T00:03:00Z" };
      if (fn === "sala_abortar_preparacion") return null;
      throw new Error("rpc inesperada " + fn);
    },
    cards: async (pairs: { tipo: "movie" | "tv"; id: number }[]) => {
      if (opts.cardsFalla) throw new Error("TMDB 429");
      return pairs.filter((p) => !(opts.sinCard ?? []).includes(p.id)).map((p) => card(p.id, opts.enUnion(p.id) ? ["n"] : ["mb"]));
    },
    nombres: (codes: string[]) => codes.map((c) => "Nombre-" + c),
  };
  return { deps, llamadas };
}
const args = { roomId: "ROOM", hostUid: "UID", size: 5 as const, duracion: "cualquiera" as const };

test("llena 5 con 8 candidatas de las que 2 no están en la unión, y publica exactamente 5 con pos 0..4", async () => {
  const { deps, llamadas } = arnes({ candidatas: [1, 2, 3, 4, 5, 6, 7, 8].map(cand), enUnion: (id) => id !== 2 && id !== 4 });
  const r = await prepararRonda(deps, args);
  assert.deepEqual(r, { ok: true, round_id: "R1", numero: 1, started_at: "2026-09-19T00:00:00Z", deadline_at: "2026-09-19T00:03:00Z", consultadas: 8, enriquecidas: 8, descartadas: 2 });
  const orden = llamadas.map((l) => l.fn);
  assert.deepEqual(orden, ["sala_iniciar_preparacion", "sala_candidatos", "sala_publicar_ronda"]);
  const ini = llamadas[0].args;
  assert.deepEqual(ini, { p_room: "ROOM", p_host: "UID", p_size: 5, p_duracion: "cualquiera" });
  const cnd = llamadas[1].args;
  assert.deepEqual(cnd, { p_providers: ["Nombre-n", "Nombre-d"], p_duracion: "cualquiera", p_excluir: [99], p_seed: "ROOM", p_limit: TOPE_CANDIDATAS });
  const pub = llamadas[2].args as { p_round: string; p_prep_token: string; p_titulos: { pos: number; tmdb_id: number }[] };
  assert.equal(pub.p_round, "R1"); assert.equal(pub.p_prep_token, "P1");
  assert.deepEqual(pub.p_titulos.map((t) => [t.pos, t.tmdb_id]), [[0, 1], [1, 3], [2, 5], [3, 6], [4, 7]]);
});

test("enriquece por lotes y se detiene cuando ya llenó: no pide cards de más", async () => {
  const muchas = Array.from({ length: 80 }, (_, i) => cand(i + 1));
  const pedidas: number[][] = [];
  const { deps } = arnes({ candidatas: muchas, enUnion: () => true });
  const cards = deps.cards;
  deps.cards = async (pairs) => { pedidas.push(pairs.map((p) => p.id)); return cards(pairs); };
  const r = await prepararRonda(deps, { ...args, size: 20 });
  assert.ok(r.ok);
  assert.equal(pedidas.length, 1, "20 cabían en el primer lote");
  assert.equal(pedidas[0].length, LOTE_CARDS);
});

test("el lote es del tamaño de la tanda: una tanda de 5 enriquece 5, y sólo pide un segundo lote si alguna se cae", async () => {
  assert.equal(loteDe(5), 5); assert.equal(loteDe(10), 10); assert.equal(loteDe(20), 20);
  const pedidas: number[][] = [];
  const { deps } = arnes({ candidatas: Array.from({ length: 30 }, (_, i) => cand(i + 1)), enUnion: (id) => id !== 3 });
  const cards = deps.cards;
  deps.cards = async (pairs) => { pedidas.push(pairs.map((p) => p.id)); return cards(pairs); };
  const r = await prepararRonda(deps, args);
  assert.ok(r.ok);
  assert.deepEqual(pedidas, [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]], "5 en el primer lote; la caída de la 3 obliga a un segundo lote de 5");
});

test("los lotes siguientes son el doble de lo que falta, entre 5 y 20: a una tanda de 20 con 2 caídas le cuesta 5 más, no 20", async () => {
  assert.equal(loteSiguiente(1), 5); assert.equal(loteSiguiente(2), 5); assert.equal(loteSiguiente(4), 8); assert.equal(loteSiguiente(15), 20);
  const pedidas: number[][] = [];
  const { deps } = arnes({ candidatas: Array.from({ length: 80 }, (_, i) => cand(i + 1)), enUnion: (id) => id !== 3 && id !== 7 });
  const cards = deps.cards;
  deps.cards = async (pairs) => { pedidas.push(pairs.map((p) => p.id)); return cards(pairs); };
  const r = await prepararRonda(deps, { ...args, size: 20 });
  assert.ok(r.ok);
  assert.deepEqual(pedidas.map((p) => p.length), [20, 5]);
  if (r.ok) { assert.equal(r.consultadas, 25); assert.equal(r.enriquecidas, 25); assert.equal(r.descartadas, 2); }
});

test("con 20 pedidas y sólo 12 válidas: aborta, no publica, y devuelve insuficientes con alcanzables [5, 10]", async () => {
  const cs = Array.from({ length: 30 }, (_, i) => cand(i + 1));
  const { deps, llamadas } = arnes({ candidatas: cs, enUnion: (id) => id <= 12 });
  const r = await prepararRonda(deps, { ...args, size: 20 });
  assert.deepEqual(r, { ok: false, motivo: "insuficientes", alcanzables: [5, 10] });
  assert.ok(!llamadas.some((l) => l.fn === "sala_publicar_ronda"));
  const ab = llamadas.find((l) => l.fn === "sala_abortar_preparacion");
  assert.deepEqual(ab?.args, { p_round: "R1", p_prep_token: "P1" });
});

test("si no hay ni 5 válidas, alcanzables es [] y no se comienza", async () => {
  const { deps } = arnes({ candidatas: [1, 2, 3, 4].map(cand), enUnion: () => true });
  const r = await prepararRonda(deps, args);
  assert.deepEqual(r, { ok: false, motivo: "insuficientes", alcanzables: [] });
});

test("si enriquecer lanza, aborta la ronda y devuelve fallo (sin dejar la sala en preparando)", async () => {
  const { deps, llamadas } = arnes({ candidatas: [1, 2, 3, 4, 5].map(cand), enUnion: () => true, cardsFalla: true });
  const r = await prepararRonda(deps, args);
  assert.equal(r.ok, false); if (!r.ok) { assert.equal(r.motivo, "fallo"); assert.match(r.detalle ?? "", /429/); }
  assert.ok(llamadas.some((l) => l.fn === "sala_abortar_preparacion"));
  assert.ok(!llamadas.some((l) => l.fn === "sala_publicar_ronda"));
});

test("si abortar también falla, igual se devuelve fallo (el barrido lo aborta a los 90 s)", async () => {
  const { deps } = arnes({ candidatas: [1].map(cand), enUnion: () => true });
  const rpc = deps.rpc;
  deps.rpc = async (fn, a) => { if (fn === "sala_abortar_preparacion") throw new Error("red"); return rpc(fn, a); };
  const r = await prepararRonda(deps, args);
  assert.equal(r.ok, false); if (!r.ok) assert.equal(r.motivo, "insuficientes");
});

test("los errores de iniciar se traducen a motivos y NO abortan (no hay ronda)", async () => {
  for (const [msg, motivo] of [["sala_sin_quorum", "sin_quorum"], ["sala_estado_no_permite", "estado"], ["sala_no_es_host", "no_es_host"], ["sala_desactivadas", "desactivadas"], ["otra cosa", "fallo"]] as const) {
    const { deps, llamadas } = arnes({ candidatas: [], enUnion: () => true, iniciarFalla: msg });
    const r = await prepararRonda(deps, args);
    assert.equal(r.ok, false); if (!r.ok) assert.equal(r.motivo, motivo, msg);
    assert.equal(llamadas.length, 1);
  }
});

test("una candidata sin card se salta y se sigue con las demás; consultadas ≠ enriquecidas lo muestra", async () => {
  const { deps, llamadas } = arnes({ candidatas: [1, 2, 3, 4, 5, 6].map(cand), enUnion: () => true, sinCard: [2] });
  const r = await prepararRonda(deps, args);
  assert.ok(r.ok);
  // 5 consultadas en el primer lote, 4 enriquecidas (la 2 no volvió), faltó 1 → segundo lote de 5 (sólo queda la 6): 6 consultadas, 5 enriquecidas, 1 descartada.
  if (r.ok) { assert.equal(r.consultadas, 6); assert.equal(r.enriquecidas, 5); assert.equal(r.descartadas, 1); }
  const pub = llamadas.find((l) => l.fn === "sala_publicar_ronda")!.args as { p_titulos: { tmdb_id: number }[] };
  assert.deepEqual(pub.p_titulos.map((t) => t.tmdb_id), [1, 3, 4, 5, 6]);
});
