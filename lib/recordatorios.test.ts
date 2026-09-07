// Los recordatorios de estreno: fecha local, identificador y payload.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  momentoDeAviso, idRecordatorio, textoDeAviso, leerExtraAviso, extraDeAviso,
  HORA_AVISO, MAX_ID, CANAL_ESTRENOS,
} from "./recordatorios.ts";

// ------------------------------------------- la fecha, sin corrimiento UTC

test("🔴 el aviso queda a las 10:00 LOCALES del día del estreno", () => {
  const r = momentoDeAviso("2026-09-20", new Date(2026, 8, 1, 12, 0, 0));
  assert.equal(r.estado, "programable");
  if (r.estado !== "programable") return;
  assert.equal(r.at.getFullYear(), 2026);
  assert.equal(r.at.getMonth(), 8, "septiembre");
  assert.equal(r.at.getDate(), 20, "el día del estreno, no el anterior");
  assert.equal(r.at.getHours(), HORA_AVISO);
  assert.equal(r.at.getMinutes(), 0);
});

test("🔴 NO se usa `new Date(iso)`: eso adelantaría el aviso un día", () => {
  // `new Date("2026-09-20")` es medianoche UTC, o sea el 19 a las 21:00 en
  // Argentina. Con el constructor local el día es el correcto en cualquier huso.
  const conIso = new Date("2026-09-20");
  const r = momentoDeAviso("2026-09-20", new Date(2026, 8, 1));
  if (r.estado !== "programable") throw new Error("tendría que ser programable");
  if (conIso.getDate() !== 20) {
    assert.notEqual(r.at.getDate(), conIso.getDate(),
      "el módulo cayó en el mismo corrimiento que `new Date(iso)`");
  }
  assert.equal(r.at.getDate(), 20);
});

test("estreno hoy, antes de las 10: se programa igual", () => {
  const r = momentoDeAviso("2026-09-07", new Date(2026, 8, 7, 8, 30));
  assert.equal(r.estado, "programable");
});

test("🔴 estreno hoy con las 10 ya pasadas: no se crea un aviso inútil", () => {
  assert.deepEqual(momentoDeAviso("2026-09-07", new Date(2026, 8, 7, 10, 0, 1)), { estado: "hoy-tarde" });
  assert.deepEqual(momentoDeAviso("2026-09-07", new Date(2026, 8, 7, 23, 59)), { estado: "hoy-tarde" });
  // El límite exacto: a las 10:00:00 clavadas ya no queda futuro.
  assert.deepEqual(momentoDeAviso("2026-09-07", new Date(2026, 8, 7, 10, 0, 0)), { estado: "hoy-tarde" });
});

test("una fecha vieja es 'pasado', no 'hoy'", () => {
  assert.deepEqual(momentoDeAviso("2026-09-06", new Date(2026, 8, 7, 9, 0)), { estado: "pasado" });
});

test("sin fecha, o con una fecha que no existe, no se programa nada", () => {
  for (const f of [null, undefined, "", "mañana", "2026-9-7", "07/09/2026", "2026-02-31"]) {
    assert.deepEqual(momentoDeAviso(f as string, new Date(2026, 0, 1)), { estado: "sin-fecha" }, String(f));
  }
});

// --------------------------------------------------------- el identificador

test("🔴 el id es estable: la misma película da siempre el mismo número", () => {
  assert.equal(idRecordatorio("movie", 278), idRecordatorio("movie", 278));
});

test("🔴 película y serie con el MISMO id de TMDB no comparten aviso", () => {
  assert.notEqual(idRecordatorio("movie", 1399), idRecordatorio("tv", 1399));
});

test("🔴 no hay colisiones entre títulos distintos", () => {
  const vistos = new Set<number>();
  for (let id = 1; id <= 2000; id++) {
    for (const t of ["movie", "tv"] as const) {
      const n = idRecordatorio(t, id)!;
      assert.ok(!vistos.has(n), `colisión en ${t}:${id}`);
      vistos.add(n);
    }
  }
  assert.equal(vistos.size, 4000);
});

test("🔴 el id entra en un entero de 32 bits con signo", () => {
  // El id más alto que devuelve TMDB hoy anda por 1,9 millones.
  const n = idRecordatorio("movie", 1_900_000)!;
  assert.ok(n > 0 && n <= MAX_ID, String(n));
  assert.ok(Number.isInteger(n));
  // Y lo que no entra se rechaza en vez de mandarse.
  assert.equal(idRecordatorio("tv", 1_073_741_824), null);
});

test("un id inválido no produce aviso", () => {
  for (const id of [0, -5, 1.5, NaN]) assert.equal(idRecordatorio("movie", id), null, String(id));
});

// ---------------------------------------------------------------- el texto

test("el texto lleva la plataforma sólo si la hay", () => {
  assert.equal(textoDeAviso("Linternas", "Max"), "Hoy se estrena Linternas en Max");
  assert.equal(textoDeAviso("Linternas"), "Hoy se estrena Linternas");
  assert.equal(textoDeAviso("Linternas", null), "Hoy se estrena Linternas");
  assert.equal(textoDeAviso("Linternas", ""), "Hoy se estrena Linternas");
});

// --------------------------------------------------------------- el payload

test("🔴 el extra se valida antes de navegar, no se confía", () => {
  assert.deepEqual(leerExtraAviso(extraDeAviso("tv", 95350)), { tipo: "tv", id: 95350 });
  // Lo que llega del sistema puede ser cualquier cosa: viene de días atrás.
  for (const x of [null, undefined, 42, "movie:1", {}, { tipo: "persona", id: 1 },
    { tipo: "movie" }, { tipo: "movie", id: 0 }, { tipo: "movie", id: -3 },
    { tipo: "movie", id: 1.5 }, { tipo: "movie", id: "abc" }]) {
    assert.equal(leerExtraAviso(x), null, JSON.stringify(x));
  }
  // Un id numérico en texto sí se acepta: es lo que devuelve Android al leerlo
  // de vuelta de su propio almacenamiento.
  assert.deepEqual(leerExtraAviso({ tipo: "movie", id: "278" }), { tipo: "movie", id: 278 });
});

// ----------------------------------------------------------------- el canal

test("el canal es uno solo, con sonido por defecto y sin audio propio", () => {
  assert.equal(CANAL_ESTRENOS.id, "estrenos");
  assert.equal(CANAL_ESTRENOS.name, "Estrenos");
  assert.ok(!("sound" in CANAL_ESTRENOS), "un sonido propio no se pidió y hay que subirlo al APK");
});
