// Índice de lotes MIXTOS: ninguna entrada ambigua recibe datos de otra.
//
// El bug: `new Map(items.map((t) => [claveMixta(t), t]))` metía TODOS los
// elementos sin `media_type` bajo la misma clave `null`. El último pisaba a los
// anteriores, y después uno podía recibir el título de otro — exactamente lo
// que la clave mixta viene a evitar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claveMixta, conRespuesto, indiceMixto, repararLote } from "./idioma.ts";

type T = { id?: number; media_type?: string; title: string; overview?: string; original_language?: string };
const roto = (o: Partial<T>): T => ({
  title: "런닝맨", overview: "", original_language: "ko", ...o,
});

test("película y serie con el mismo ID y tipos presentes: cada una lo suyo", async () => {
  const base = [roto({ id: 1399, media_type: "movie" }), roto({ id: 1399, media_type: "tv" })];
  const r = await repararLote(base, async () => [
    { id: 1399, media_type: "movie", title: "La película", overview: "Cine." },
    { id: 1399, media_type: "tv", title: "La serie", overview: "Tele." },
  ], "mixto", { clave: claveMixta, claveRespaldo: claveMixta, activo: true });
  assert.equal(r.items[0].title, "La película");
  assert.equal(r.items[1].title, "La serie");
});

test("AMBAS sin tipo: quedan intactas y NO se cruzan entre sí", async () => {
  const base = [roto({ id: 1399, title: "런닝맨" }), roto({ id: 1399, title: "마녀" })];
  const r = await repararLote(base, async () => [
    { id: 1399, media_type: "movie", title: "La película", overview: "Cine." },
  ], "ambiguo", { clave: claveMixta, claveRespaldo: claveMixta, activo: true });
  assert.equal(r.items[0].title, "런닝맨");
  assert.equal(r.items[1].title, "마녀", "no recibió el título de la otra");
  assert.equal(r.fallo, false, "ambigüedad no es caída");
});

test("tipo ausente SOLO EN LA BASE: la ambigua no se toca", async () => {
  const base = [roto({ id: 1399, media_type: "tv", title: "마녀" }), roto({ id: 1399, title: "런닝맨" })];
  const r = await repararLote(base, async () => [
    { id: 1399, media_type: "tv", title: "La serie", overview: "Tele." },
    { id: 1399, media_type: "movie", title: "La película", overview: "Cine." },
  ], "media", { clave: claveMixta, claveRespaldo: claveMixta, activo: true });
  assert.equal(r.items[0].title, "La serie", "la que tiene tipo se repara");
  assert.equal(r.items[1].title, "런닝맨", "la ambigua queda intacta");
});

test("tipo ausente SOLO EN EL RESPALDO: no se usa para nadie", async () => {
  const base = [roto({ id: 1399, media_type: "movie" }), roto({ id: 1399, media_type: "tv" })];
  const r = await repararLote(base, async () => [
    { id: 1399, title: "Sin tipo", overview: "Ambiguo." },              // se ignora
    { id: 1399, media_type: "tv", title: "La serie", overview: "Tele." },
  ], "resp-ambiguo", { clave: claveMixta, claveRespaldo: claveMixta, activo: true });
  assert.equal(r.items[0].title, "런닝맨", "la película NO recibe el ambiguo");
  assert.equal(r.items[1].title, "La serie");
});

test("indiceMixto no inserta claves nulas", () => {
  const m = indiceMixto(
    [{ id: 1, media_type: "movie" }, { id: 2 }, { media_type: "tv" }],
    claveMixta,
  );
  assert.equal(m.size, 1, "solo entra el que tiene id Y tipo");
  assert.equal(m.has("movie:1"), true);
});

test("conRespuesto nunca hace get(null): devuelve el original", () => {
  const m = indiceMixto([{ id: 1, media_type: "movie", title: "Reparado" }], claveMixta);
  const ambiguo = { id: 1, title: "Original" };
  assert.equal(conRespuesto(m, ambiguo, claveMixta), ambiguo, "sin tipo, el original");
  const conTipo = { id: 1, media_type: "movie", title: "Viejo" };
  assert.equal(conRespuesto(m, conTipo, claveMixta).title, "Reparado");
  const ausente = { id: 99, media_type: "tv", title: "No está" };
  assert.equal(conRespuesto(m, ausente, claveMixta), ausente, "no está en el índice");
});

test("dos ambiguos con el mismo id no se pisan en el índice", () => {
  // El bug original: los dos entraban bajo `null` y el segundo pisaba al primero.
  const m = indiceMixto([{ id: 1399, title: "A" }, { id: 1399, title: "B" }], claveMixta);
  assert.equal(m.size, 0, "ninguno entra: los dos son ambiguos");
});
