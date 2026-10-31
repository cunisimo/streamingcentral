// Señales leídas por el servidor: rango por recencia ENTRE niveles y claves a
// excluir (todo lo leído, incluido Malaso y Ya la vi). Puro: sin Supabase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { senalesDesdeFilas } from "./reco-senales.ts";

const v = (id: number, rating: number, f: string) => ({ tmdb_id: id, tipo: "movie" as const, rating, created_at: f });
const i = (id: number, kind: string, f: string) => ({ tmdb_id: id, tipo: "tv" as const, kind, created_at: f });

test("rango por fecha entre niveles: un Mi lista nuevo va antes que un Petacular viejo", () => {
  const r = senalesDesdeFilas(
    [v(1, 3, "2026-01-01T00:00:00Z"), v(2, 2, "2026-10-01T00:00:00Z")],
    [i(9, "list", "2026-10-30T00:00:00Z")],
  );
  assert.deepEqual(r.senales.map((s) => [s.id, s.peso, s.rango]), [[9, 1, 0], [2, 2, 1], [1, 3, 2]]);
});

test("Malaso y Ya la vi no son señal, pero sí exclusión", () => {
  const r = senalesDesdeFilas([v(1, 1, "2026-10-01T00:00:00Z")], [i(5, "watched", "2026-10-02T00:00:00Z")]);
  assert.equal(r.senales.length, 0);
  assert.deepEqual(r.claves.sort(), ["movie:1", "tv:5"]);
});

test("empate de fecha: orden estable, no el de llegada", () => {
  const f = "2026-10-01T00:00:00Z";
  const a = senalesDesdeFilas([v(2, 2, f), v(1, 2, f)], []);
  const b = senalesDesdeFilas([v(1, 2, f), v(2, 2, f)], []);
  assert.deepEqual(a.senales, b.senales);
});
