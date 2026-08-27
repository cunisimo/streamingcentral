// La aritmética de la traza, que es lo que decide el diagnóstico.
//
// El motor toca el DOM y no se puede montar acá, pero las funciones que deciden
// —las duraciones derivadas, la clasificación y la agrupación por avatar— son
// puras y se prueban directo. Son las mismas que valida el canario de navegador
// de `scripts/traza-avatares.js` (31 comprobaciones); acá quedan fijadas para
// que no se muevan al portarlas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LENTA_MS, agrupar, claveAvatar, derivadas, esLenta, esReintento } from "./traza-avatares.ts";

// ============================================================================
// Las duraciones derivadas
// ============================================================================

test("cargaMs y esperaInicioMs se miden desde que se creó el <img>", () => {
  const d = derivadas({ tCreado: 100, tEvento: 180, inicioMs: 110, decodeMs: 5 });
  assert.equal(d.cargaMs, 80);
  assert.equal(d.esperaInicioMs, 10);
  assert.equal(d.listaMs, 85);
});

test("listaMs es null si decodeMs no es un número", () => {
  // Imagen rota: `decode()` rechaza y no hay tiempo de decodificación que sumar.
  assert.equal(derivadas({ tCreado: 0, tEvento: 50, inicioMs: 5, decodeMs: null }).listaMs, null);
});

test("sin evento o sin recurso, la duración correspondiente es null", () => {
  const d = derivadas({ tCreado: 10, tEvento: null, inicioMs: null, decodeMs: 3 });
  assert.equal(d.cargaMs, null);
  assert.equal(d.esperaInicioMs, null);
  assert.equal(d.listaMs, null);
});

// ============================================================================
// EL FALSO POSITIVO DEL TIEMPO HUMANO
// ============================================================================

test("dos segundos de demora HUMANA no hacen lenta a una imagen instantánea", () => {
  // El caso real: `preparar()` a las 0, la persona tarda 2 s en tocar "Cambiar
  // avatar", y la imagen carga en 40 ms. Los INSTANTES son enormes; la
  // DURACIÓN, mínima. Antes esto marcaba las 31 filas como lentas.
  const tCreado = 2012, tEvento = 2052, inicioMs = 2015;
  const d = derivadas({ tCreado, tEvento, inicioMs, decodeMs: 3 });
  assert.equal(d.cargaMs, 40);
  assert.equal(d.esperaInicioMs, 3);
  assert.equal(esLenta({ ...d, durMs: 35, decodeMs: 3 }), false);
  // Y que quede claro qué se descartó: el instante SÍ es mayor al umbral.
  assert.ok(tEvento > LENTA_MS);
});

test("una demora REAL de carga sí se marca", () => {
  const d = derivadas({ tCreado: 5, tEvento: 1600, inicioMs: 8, decodeMs: 4 });
  assert.equal(esLenta({ ...d, durMs: 1580, decodeMs: 4 }), true);
});

test("cada duración dispara por su cuenta", () => {
  const base = { esperaInicioMs: 0, cargaMs: 0, listaMs: 0, durMs: 0, decodeMs: 0 };
  for (const campo of ["esperaInicioMs", "cargaMs", "listaMs", "durMs", "decodeMs"] as const) {
    assert.equal(esLenta({ ...base, [campo]: LENTA_MS + 1 }), true, `${campo} no dispara`);
    assert.equal(esLenta({ ...base, [campo]: LENTA_MS - 1 }), false, `${campo} dispara de más`);
  }
});

test("una fila sin datos no se marca lenta", () => {
  assert.equal(esLenta({ esperaInicioMs: null, cargaMs: null, listaMs: null, durMs: null, decodeMs: null }), false);
});

test("la decodificación sola alcanza para marcar lenta", () => {
  // La hipótesis 3: descarga instantánea, decodificación cara.
  const d = derivadas({ tCreado: 0, tEvento: 30, inicioMs: 2, decodeMs: 1200 });
  assert.equal(esLenta({ ...d, durMs: 25, decodeMs: 1200 }), true);
});

// ============================================================================
// Reintentos y agrupación
// ============================================================================

test("la marca del reintento se reconoce y se saca de la clave", () => {
  assert.equal(esReintento("/avatars/avatar-moon.webp"), false);
  assert.equal(esReintento("/avatars/avatar-moon.webp?reintento=1"), true);
  assert.equal(claveAvatar("/avatars/avatar-moon.webp?reintento=1"), "/avatars/avatar-moon.webp");
  assert.equal(claveAvatar("/avatars/avatar-moon.webp?v=2&reintento=1"), "/avatars/avatar-moon.webp?v=2");
});

test("32 registros de 31 avatares: el reintento no infla el conteo", () => {
  const filas = Array.from({ length: 31 }, (_, i) => ({ avatar: `a${i}.webp` }));
  filas.push({ avatar: "a30.webp" });   // el reintento del último
  const m = agrupar(filas);
  assert.equal(filas.length, 32);
  assert.equal(m.size, 31);
  assert.equal([...m.values()].filter((l) => l.length > 1).length, 1);
});

test("el resultado de un avatar es su ÚLTIMO registro", () => {
  // Si el reintento cargó bien, ese avatar cuenta como OK aunque el primero
  // haya fallado.
  const filas = [
    { avatar: "x.webp", ok: false },
    { avatar: "x.webp", ok: true },
  ];
  const finales = [...agrupar(filas).values()].map((l) => l[l.length - 1]);
  assert.deepEqual(finales, [{ avatar: "x.webp", ok: true }]);
});
