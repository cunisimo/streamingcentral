// Single-flight: une lo que está EN VUELO, y nada más.
//
// Cubre el peor caso del recomendador: por cada origen, `recomendadosDe`,
// `cruzadosDe` → `perfilDe` y `perfilDe` piden los tres el mismo detalle, y
// además cada uno puede pedir el respaldo en es-ES. Sin esto son 3 llamadas
// base + 3 de respaldo; con esto, 1 + 1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearSingleFlight } from "./single-flight.ts";

const lento = (c: { n: number }, ms = 5) => (v: string) => async () => {
  c.n++;
  await new Promise((r) => setTimeout(r, ms));
  return v;
};

test("PEOR CASO del recomendador: 3 consumidores → 1 base + 1 respaldo", async () => {
  // Se modela el cableado real: la clave es `idioma:tipo:id`, así que la base y
  // el respaldo son entradas distintas y ninguna se come a la otra.
  const base = { n: 0 }, resp = { n: 0 };
  const compartir = crearSingleFlight<string>();

  const detalle = (idioma: string) => compartir(
    `${idioma}:movie:550`,
    idioma === "es-MX" ? lento(base)("mx") : lento(resp)("es"),
  );

  // Los tres caminos, en paralelo, cada uno pidiendo base y respaldo.
  await Promise.all([
    Promise.all([detalle("es-MX"), detalle("es-ES")]),
    Promise.all([detalle("es-MX"), detalle("es-ES")]),
    Promise.all([detalle("es-MX"), detalle("es-ES")]),
  ]);

  assert.equal(base.n, 1, "UNA llamada base para los tres caminos");
  assert.equal(resp.n, 1, "COMO MÁXIMO una llamada de respaldo");
});

test("el idioma va en la clave: base y respaldo no se confunden", async () => {
  const c = { n: 0 };
  const compartir = crearSingleFlight<string>();
  const [mx, es] = await Promise.all([
    compartir("es-MX:movie:550", lento(c)("titulo-mx")),
    compartir("es-ES:movie:550", lento(c)("titulo-es")),
  ]);
  assert.equal(mx, "titulo-mx");
  assert.equal(es, "titulo-es", "sin el idioma, este habría recibido el mexicano");
  assert.equal(c.n, 2);
});

test("claves distintas NO se comparten", async () => {
  const c = { n: 0 };
  const compartir = crearSingleFlight<string>();
  await Promise.all([
    compartir("es-MX:movie:550", lento(c)("a")),
    compartir("es-MX:movie:551", lento(c)("b")),
    // `tv:550` y `movie:550` son títulos distintos: TMDB reutiliza los ids.
    compartir("es-MX:tv:550", lento(c)("c")),
  ]);
  assert.equal(c.n, 3);
});

test("SE COMPARTE entre requests simultáneos, y eso es deseable", async () => {
  // Dos usuarios pidiendo la misma ficha al mismo tiempo son UN pedido a TMDB.
  const c = { n: 0 };
  const compartir = crearSingleFlight<string>();
  const request = () => compartir("es-MX:movie:550", lento(c)("x"));
  await Promise.all([request(), request()]);
  assert.equal(c.n, 1);
});

test("NO es un cache: al resolverse, la próxima vuelve a pedir", async () => {
  // La diferencia que importa: un cache serviría datos viejos.
  const c = { n: 0 };
  const compartir = crearSingleFlight<string>();
  await compartir("k", lento(c, 1)("x"));
  await compartir("k", lento(c, 1)("x"));
  assert.equal(c.n, 2, "secuencial ⇒ dos llamadas, sin datos viejos");
});

test("tras un RECHAZO la entrada se elimina y se puede reintentar", async () => {
  // Sin el `finally`, una promesa rechazada quedaría pegada y ese título sería
  // imposible de pedir en lo que le queda de vida al proceso.
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

test("`alPedir` se llama SOLO cuando se sale de verdad a la red", async () => {
  // Es lo que hace que la métrica informe requests reales y no intentos lógicos.
  let anotadas = 0;
  const c = { n: 0 };
  const compartir = crearSingleFlight<string>({ alPedir: () => { anotadas++; } });
  const pedir = lento(c)("x");
  await Promise.all([compartir("k", pedir), compartir("k", pedir), compartir("k", pedir)]);
  assert.equal(c.n, 1, "una sola llamada real");
  assert.equal(anotadas, 1, "una sola anotación: no tres intentos lógicos");
});
