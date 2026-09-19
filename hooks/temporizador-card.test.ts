// Los 10 segundos de cada card (plan de salas, Tarea 3.1). Máquina PURA con
// persistencia inyectable. Lo que fija: recargar la página NO reinicia los
// 10 s —el comienzo persiste por sala/ronda/posición— y sólo `cerrar` (que la
// interfaz llama cuando el servidor confirmó el avance) borra ese comienzo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrancar, restante, vencio, cerrar, claveCard, DURACION_MS, type StoreTemporizador } from "./temporizador-card.ts";

function memoria(): StoreTemporizador & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}
const K = claveCard("R", "RND", 3);

test("la clave es por sala, ronda y posición", () => {
  assert.equal(K, "yump:sala:R:RND:3:inicio");
  assert.notEqual(claveCard("R", "RND", 4), K);
  assert.notEqual(claveCard("R", "OTRA", 3), K);
});

test("arranque nuevo guarda el comienzo; restante arranca en 10 y baja", () => {
  const s = memoria();
  const { arrancoEn } = arrancar(s, K, 1_000);
  assert.equal(arrancoEn, 1_000);
  assert.equal(s.m.get(K), "1000");
  assert.equal(restante(arrancoEn, 1_000), 10);
  assert.equal(restante(arrancoEn, 4_000), 7);
  assert.equal(restante(arrancoEn, 4_100), 7); // techo: a los 3,1 s quedan 6,9 → se muestra 7 hasta llegar a 6,0
  assert.equal(restante(arrancoEn, 11_000), 0);
  assert.equal(restante(arrancoEn, 50_000), 0);
});

test("un segundo arrancar con la misma clave (recarga) CONSERVA el comienzo original y el restante sigue bajando", () => {
  const s = memoria();
  arrancar(s, K, 1_000);
  const { arrancoEn } = arrancar(s, K, 7_000); // F5 a los 6 s
  assert.equal(arrancoEn, 1_000);
  assert.equal(restante(arrancoEn, 7_000), 4);   // quedan 4, no 10
});

test("cerrar borra; un arrancar posterior arranca de cero", () => {
  const s = memoria();
  arrancar(s, K, 1_000);
  cerrar(s, K);
  assert.equal(s.m.has(K), false);
  const { arrancoEn } = arrancar(s, K, 9_000);
  assert.equal(arrancoEn, 9_000);
  assert.equal(restante(arrancoEn, 9_000), 10);
});

test("vencio exacto a los 10.000 ms", () => {
  assert.equal(DURACION_MS, 10_000);
  assert.equal(vencio(1_000, 10_999), false);
  assert.equal(vencio(1_000, 11_000), true);
  assert.equal(vencio(1_000, 99_000), true);
});

test("un comienzo persistido corrupto se ignora y se arranca de nuevo", () => {
  const s = memoria();
  s.m.set(K, "no-es-numero");
  const { arrancoEn } = arrancar(s, K, 5_000);
  assert.equal(arrancoEn, 5_000);
  assert.equal(s.m.get(K), "5000");
  // Un comienzo en el FUTURO (reloj movido hacia atrás) tampoco vale: sería un contador de más de 10 s.
  s.m.set(K, "9000");
  assert.equal(arrancar(s, K, 5_000).arrancoEn, 5_000);
});

test("store que lanza → se comporta como sin persistencia: cada arrancar empieza en `ahora`", () => {
  const roto: StoreTemporizador = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
  assert.equal(arrancar(roto, K, 1_000).arrancoEn, 1_000);
  assert.equal(arrancar(roto, K, 2_000).arrancoEn, 2_000);
  assert.doesNotThrow(() => cerrar(roto, K));
});

test("limpiar posiciones anteriores: al retomar en `mi_siguiente_pos` se borran las claves de las cards ya confirmadas", async () => {
  const { limpiarAnteriores } = await import("./temporizador-card.ts");
  const s = memoria();
  for (const p of [0, 1, 2, 3]) arrancar(s, claveCard("R", "RND", p), 1_000 + p);
  limpiarAnteriores(s, "R", "RND", 2, 10);
  assert.equal(s.m.has(claveCard("R", "RND", 0)), false);
  assert.equal(s.m.has(claveCard("R", "RND", 1)), false);
  assert.equal(s.m.has(claveCard("R", "RND", 2)), true);
  assert.equal(s.m.has(claveCard("R", "RND", 3)), true);
});
