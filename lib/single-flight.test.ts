// Single-flight: une lo que está en vuelo, y nada más.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearSingleFlight } from "./single-flight.ts";

const lento = (c: { n: number }, ms = 5) => (v: string) => async () => {
  c.n++;
  await new Promise((r) => setTimeout(r, ms));
  return v;
};

test("PEOR CASO: tres caminos concurrentes por el mismo origen → UNA llamada", async () => {
  // Es el caso real: `recomendadosDe`, `cruzadosDe` → `perfilDe` y `perfilDe`
  // piden los tres el mismo titleDetails de un origen.
  const c = { n: 0 };
  const compartir = crearSingleFlight<string>();
  const pedir = lento(c)("movie:550");
  const [a, b, d] = await Promise.all([
    compartir("movie:550", pedir),
    compartir("movie:550", pedir),
    compartir("movie:550", pedir),
  ]);
  assert.equal(c.n, 1, "3 caminos → 1 llamada a TMDB");
  assert.equal(a, "movie:550");
  assert.equal(b, a);
  assert.equal(d, a);
});

test("claves distintas NO se comparten", async () => {
  const c = { n: 0 };
  const compartir = crearSingleFlight<string>();
  await Promise.all([
    compartir("movie:550", lento(c)("a")),
    compartir("movie:551", lento(c)("b")),
    // `tv:550` y `movie:550` son títulos distintos: TMDB reutiliza los ids.
    compartir("tv:550", lento(c)("c")),
  ]);
  assert.equal(c.n, 3);
});

test("NO es un cache: al resolverse, la próxima vuelve a pedir", async () => {
  // La diferencia que importa: un cache serviría datos viejos entre requests.
  const c = { n: 0 };
  const compartir = crearSingleFlight<string>();
  await compartir("k", lento(c, 1)("x"));
  await compartir("k", lento(c, 1)("x"));
  assert.equal(c.n, 2, "secuencial ⇒ dos llamadas, sin datos viejos");
});

test("si la llamada falla, la entrada se libera y se puede reintentar", async () => {
  // Sin el `finally`, una promesa rechazada quedaría pegada y ese título sería
  // imposible de pedir en todo lo que le queda de vida al proceso.
  const compartir = crearSingleFlight<string>();
  let intento = 0;
  const pedir = async () => {
    intento++;
    if (intento === 1) throw new Error("TMDB 500");
    return "ok";
  };
  await assert.rejects(() => compartir("k", pedir));
  assert.equal(await compartir("k", pedir), "ok");
  assert.equal(intento, 2);
});

test("un rechazo concurrente lo reciben TODOS los que esperaban", async () => {
  const compartir = crearSingleFlight<string>();
  const pedir = async () => { throw new Error("boom"); };
  const rs = await Promise.allSettled([
    compartir("k", pedir), compartir("k", pedir), compartir("k", pedir),
  ]);
  assert.equal(rs.filter((r) => r.status === "rejected").length, 3);
});
