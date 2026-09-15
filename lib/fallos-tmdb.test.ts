// Un descarte parcial causado por TMDB tiene que llegar hasta quien decide si
// guardar (H2, informe de la Etapa 3 §2.2). Hoy `settleAll` descarta el título
// y sólo lo loguea: un Home con 429 en algunos `watch/providers` sale corto,
// con `degradado: false`, y se publica 6 h como fresca y 36 h como último bueno.
//
// Mismo mecanismo que lib/fallos-disponibilidad.ts (contexto async anidado, el
// hijo suma al padre en `finally`) y, para no tener que enhebrar DOS wrappers en
// las siete superficies cacheadas, `withFallosDeFuentes` compone los dos y
// devuelve `fallos` = disponibilidad + TMDB.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conDescartesRegistrados, hayFallosTmdb, registrarDescarteTmdb, withFallosDeFuentes, withFallosTmdb,
} from "./fallos-tmdb.ts";
import { registrarFalloDisponibilidad } from "./fallos-disponibilidad.ts";
import { ErrorTmdb } from "./tmdb-error.ts";
import { settleAll } from "./settle-all.ts";

const e429 = () => new ErrorTmdb({ estado: 429, clase: "http429", path: "/x" });

test("registrar un ErrorTmdb dentro del contexto lo cuenta; fuera, no hace nada ni lanza", async () => {
  const { fallos } = await withFallosTmdb(async () => {
    assert.equal(hayFallosTmdb(), false);
    registrarDescarteTmdb(e429(), "test");
    assert.equal(hayFallosTmdb(), true);
  });
  assert.equal(fallos, 1);
  assert.doesNotThrow(() => registrarDescarteTmdb(e429(), "fuera"));
});

test("un error que NO es de TMDB (bug propio) no cuenta como descarte de TMDB", async () => {
  const { fallos } = await withFallosTmdb(async () => {
    registrarDescarteTmdb(new TypeError("propio"), "test");
    registrarDescarteTmdb(new Error("TMDB 429 en /x"), "test");
  });
  assert.equal(fallos, 0);
});

test("el hijo suma al padre al salir, una sola vez por nivel (anidamiento real de la composición)", async () => {
  const { fallos } = await withFallosTmdb(async () => {
    const nieto = await withFallosTmdb(async () => {
      const bis = await withFallosTmdb(async () => { registrarDescarteTmdb(e429(), "bis"); });
      assert.equal(bis.fallos, 1);
      registrarDescarteTmdb(e429(), "nieto");
    });
    assert.equal(nieto.fallos, 2);
  });
  assert.equal(fallos, 2);
});

test("si el hijo lanza, su cuenta igual sube al padre", async () => {
  const { fallos } = await withFallosTmdb(async () => {
    await withFallosTmdb(async () => { registrarDescarteTmdb(e429(), "x"); throw new Error("boom"); }).catch(() => {});
  });
  assert.equal(fallos, 1);
});

test("withFallosDeFuentes: suma disponibilidad + TMDB en `fallos` y los expone por separado", async () => {
  const r = await withFallosDeFuentes(async () => {
    registrarFalloDisponibilidad();
    registrarDescarteTmdb(e429(), "x");
    registrarDescarteTmdb(e429(), "x");
    return 42;
  });
  assert.equal(r.res, 42);
  assert.equal(r.fallosDisponibilidad, 1);
  assert.equal(r.fallosTmdb, 2);
  assert.equal(r.fallos, 3);
});

// ============================================================================
// settleAll: el descarte por título registra la causa si es de TMDB
// ============================================================================

test("settleAll conserva los cumplidos, descarta los rechazados y registra los de causa TMDB", async () => {
  const { res, fallos } = await withFallosTmdb(async () =>
    settleAll([Promise.resolve(1), Promise.reject(e429()), Promise.resolve(3)], "prueba", { relanzar: false, log: () => {} }));
  assert.deepEqual(res, [1, 3]);
  assert.equal(fallos, 1);
});

test("settleAll con un rechazo que NO es de TMDB no registra descarte (y sigue descartándolo)", async () => {
  const { res, fallos } = await withFallosTmdb(async () =>
    settleAll([Promise.resolve(1), Promise.reject(new TypeError("propio"))], "prueba", { relanzar: false, log: () => {} }));
  assert.deepEqual(res, [1]);
  assert.equal(fallos, 0);
});

test("settleAll fuera de producción relanza el motivo, como siempre", async () => {
  await assert.rejects(
    settleAll([Promise.reject(new TypeError("propio"))], "prueba", { relanzar: true, log: () => {} }),
    TypeError,
  );
});

// ============================================================================
// Registrar SIN contexto no puede ser inerte (auditoría de Codex sobre 09b9dbe,
// hallazgo 2): las rutas y tareas independientes (directores, portadas,
// recordatorio, cron de Netflix) no abren `withFallosTmdb`, así que el
// registro se perdía. Ahora el registrador DICE qué hizo, y fuera de contexto
// deja UNA línea estructurada por descarte; adentro cuenta y calla (sin ruido
// por cada título del Home).
// ============================================================================

test("🔴 dentro de un contexto: cuenta, devuelve `contado` y NO loguea", async () => {
  const lineas: unknown[][] = [];
  const { fallos, res } = await withFallosTmdb(async () => registrarDescarteTmdb(e429(), "sitio-x", { log: (...a) => { lineas.push(a); } }));
  assert.equal(res, "contado");
  assert.equal(fallos, 1);
  assert.deepEqual(lineas, []);
});

test("🔴 fuera de contexto: devuelve `logueado` y deja UNA línea estructurada con sitio, clase, estado y path", () => {
  const lineas: unknown[][] = [];
  const r = registrarDescarteTmdb(new ErrorTmdb({ estado: 429, clase: "http429", path: "/person/1", retryAfterMs: 2000 }), "directorCards", { log: (...a) => { lineas.push(a); } });
  assert.equal(r, "logueado");
  assert.equal(lineas.length, 1);
  const texto = String(lineas[0][0]);
  assert.match(texto, /^\[tmdb\] descarte sin contexto/);
  assert.match(texto, /sitio=directorCards/);
  assert.match(texto, /clase=http429/);
  assert.match(texto, /estado=429/);
  assert.match(texto, /path=\/person\/1/);
});

test("🔴 un error que no es de TMDB: `ignorado`, sin contar ni loguear", async () => {
  const lineas: unknown[][] = [];
  assert.equal(registrarDescarteTmdb(new TypeError("propio"), "x", { log: (...a) => { lineas.push(a); } }), "ignorado");
  const { fallos } = await withFallosTmdb(async () => registrarDescarteTmdb(new TypeError("propio"), "x", { log: (...a) => { lineas.push(a); } }));
  assert.equal(fallos, 0);
  assert.deepEqual(lineas, []);
});

test("🔴 conDescartesRegistrados: una ruta independiente abre el contexto y deja UNA línea de resumen sólo si hubo descartes", async () => {
  const lineas: unknown[][] = [];
  const log = (...a: unknown[]) => { lineas.push(a); };
  const r1 = await conDescartesRegistrados("api/directores", async () => { registrarDescarteTmdb(e429(), "directorCards", { log }); registrarDescarteTmdb(e429(), "directorCards", { log }); return 42; }, { log });
  assert.equal(r1, 42);
  assert.equal(lineas.length, 1, "un resumen, no una línea por descarte");
  assert.match(String(lineas[0][0]), /^\[tmdb\] api\/directores: 2 descarte\(s\)/);
  lineas.length = 0;
  await conDescartesRegistrados("api/directores", async () => "sano", { log });
  assert.deepEqual(lineas, [], "sin descartes, sin línea");
});

test("CONTROL: una función que traga un ErrorTmdb sin registrarlo no deja rastro — es lo que el inventario tiene que impedir", async () => {
  const lineas: unknown[][] = [];
  const tragaSinRegistrar = async () => { try { throw e429(); } catch { return null; } };
  const { fallos } = await withFallosTmdb(tragaSinRegistrar);
  assert.equal(fallos, 0);
  assert.deepEqual(lineas, []);
});
