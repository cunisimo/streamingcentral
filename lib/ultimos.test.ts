// "Últimos lanzamientos · Series": la mezcla, el orden y la paginación.
//
// EL PROBLEMA QUE RESUELVE. Corregir la ficha no alcanzaba: el `discover`
// filtrado por proveedor NUNCA devuelve `tv:275224` (medido: 1152 resultados en
// Disney+/AR y el título no está en ninguno). Si no aparece como candidato, no
// hay resolución de disponibilidad que lo rescate. Hacen falta las dos cosas.
//
// 🔴 POR QUÉ NO ES UNA UNIÓN INGENUA. Pedir "página 1 de proveedores + página 1
// de redes" y concatenar produce duplicados y saltea títulos: la lista ordenada
// se reconstruye y crece con cada página, así que un título de una página
// profunda corre el borde entre dos páginas y se lleva puesto lo que queda del
// otro lado. Es el mismo problema que se corrigió en `/lista/miniseries`.
//
// La solución acá NO puede ser la de miniseries —una sola consulta combinada—
// porque TMDB no permite `with_watch_providers` O `with_networks` en el mismo
// query: los combina con AND. Entonces se hace lo otro que funciona: una
// VENTANA FIJA, un orden total determinístico, y las páginas como tajadas de
// esa lista. Mientras la ventana no dependa de la página pedida, las tajadas no
// se pisan ni dejan huecos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { combinarUltimos, ordenUltimos, type CandidatoUltimos } from "./ultimos.ts";
import type { UITitle } from "./types";

const t = (id: number, fecha: string, platforms = ["d"]): UITitle & { fecha: string } => ({
  id, type: "tv", title: `T${id}`, year: 2026, runtime: null, poster: "/p.jpg",
  country: "AR", genres: [], platforms: platforms as UITitle["platforms"],
  tmdb: 7, hasEditorial: false, fecha,
});

const GUTIERREZ = t(275224, "2026-08-26");

test("ordena por fecha descendente", () => {
  const l = [t(1, "2026-08-01"), t(2, "2026-08-20"), t(3, "2026-08-10")].sort(ordenUltimos);
  assert.deepEqual(l.map((x) => x.id), [2, 3, 1]);
});

test("empate de fecha: desempata por id, y es ESTABLE", () => {
  // Sin desempate, dos títulos del mismo día pueden salir en distinto orden en
  // dos requests —el orden de llegada de las fuentes no es estable— y eso solo
  // basta para que una página repita o saltee.
  const a = [t(7, "2026-08-26"), t(3, "2026-08-26"), t(9, "2026-08-26")];
  const uno = [...a].sort(ordenUltimos).map((x) => x.id);
  const dos = [...a].reverse().sort(ordenUltimos).map((x) => x.id);
  assert.deepEqual(uno, dos, "el orden depende del orden de llegada");
  assert.deepEqual(uno, [9, 7, 3]);
});

test("el caso testigo aparece cuando viene por RED y no por proveedor", () => {
  const r = combinarUltimos({
    regionales: [t(1, "2026-08-28")],
    porRed: [GUTIERREZ],
    providers: ["d"], page: 1, porPagina: 20, hoy: "2026-08-30",
  });
  assert.ok(r.items.some((x) => x.id === 275224), "Gutiérrez no entró");
  assert.deepEqual(r.items.map((x) => x.id), [1, 275224]);
});

test("no aparece si Disney+ no está seleccionada", () => {
  const r = combinarUltimos({
    regionales: [t(1, "2026-08-28", ["n"])],
    porRed: [GUTIERREZ],
    providers: ["n"], page: 1, porPagina: 20, hoy: "2026-08-30",
  });
  assert.equal(r.items.some((x) => x.id === 275224), false);
});

test("un candidato SIN evidencia válida no sobrevive", () => {
  // Llega por red pero la resolución lo dejó sin plataformas: no se muestra.
  const r = combinarUltimos({
    regionales: [], porRed: [t(999, "2026-08-27", [])],
    providers: ["d"], page: 1, porPagina: 20, hoy: "2026-08-30",
  });
  assert.deepEqual(r.items, []);
});

test("no entra ninguna serie futura", () => {
  const r = combinarUltimos({
    regionales: [t(1, "2026-09-05")], porRed: [t(2, "2026-08-31")],
    providers: ["d"], page: 1, porPagina: 20, hoy: "2026-08-30",
  });
  assert.deepEqual(r.items, []);
});

test("estrenar HOY sí entra", () => {
  const r = combinarUltimos({
    regionales: [t(1, "2026-08-30")], porRed: [],
    providers: ["d"], page: 1, porPagina: 20, hoy: "2026-08-30",
  });
  assert.deepEqual(r.items.map((x) => x.id), [1]);
});

test("dedup por tipo:id — el mismo título por las dos fuentes entra una vez", () => {
  const r = combinarUltimos({
    regionales: [GUTIERREZ], porRed: [GUTIERREZ],
    providers: ["d"], page: 1, porPagina: 20, hoy: "2026-08-30",
  });
  assert.equal(r.items.length, 1);
});

test("mismo id, distinto tipo: son títulos distintos", () => {
  const peli = { ...t(275224, "2026-08-26"), type: "movie" as const };
  const r = combinarUltimos({
    regionales: [peli], porRed: [GUTIERREZ],
    providers: ["d"], page: 1, porPagina: 20, hoy: "2026-08-30",
  });
  assert.equal(r.items.length, 2);
});

// --- paginación: ni repetidos ni salteos ---

const MUCHOS = Array.from({ length: 47 }, (_, i) =>
  t(1000 + i, `2026-08-${String(1 + (i % 28)).padStart(2, "0")}`));

test("las páginas no repiten ni saltean", () => {
  const vistos: number[] = [];
  for (let p = 1; p <= 5; p++) {
    const r = combinarUltimos({
      regionales: MUCHOS.slice(0, 30), porRed: MUCHOS.slice(20),
      providers: ["d"], page: p, porPagina: 10, hoy: "2026-08-30",
    });
    vistos.push(...r.items.map((x) => x.id));
  }
  assert.equal(new Set(vistos).size, vistos.length, "hay repetidos entre páginas");
  assert.equal(vistos.length, 47, "se saltearon títulos");
});

test("la página 2 continúa exactamente donde terminó la 1", () => {
  const args = {
    regionales: MUCHOS.slice(0, 30), porRed: MUCHOS.slice(20),
    providers: ["d"] as UITitle["platforms"], porPagina: 10, hoy: "2026-08-30",
  };
  const completa = combinarUltimos({ ...args, page: 1, porPagina: 20 }).items.map((x) => x.id);
  const p1 = combinarUltimos({ ...args, page: 1 }).items.map((x) => x.id);
  const p2 = combinarUltimos({ ...args, page: 2 }).items.map((x) => x.id);
  assert.deepEqual([...p1, ...p2], completa, "la clasificación se movió entre páginas");
});

test("hayMas es cierto mientras queden títulos, y falso al final", () => {
  const args = {
    regionales: MUCHOS, porRed: [],
    providers: ["d"] as UITitle["platforms"], porPagina: 20, hoy: "2026-08-30",
  };
  assert.equal(combinarUltimos({ ...args, page: 1 }).hayMas, true);
  assert.equal(combinarUltimos({ ...args, page: 2 }).hayMas, true);
  assert.equal(combinarUltimos({ ...args, page: 3 }).hayMas, false);
});

test("una página más allá del final devuelve vacío, no repite la última", () => {
  const r = combinarUltimos({
    regionales: MUCHOS, porRed: [],
    providers: ["d"], page: 9, porPagina: 20, hoy: "2026-08-30",
  });
  assert.deepEqual(r.items, []);
  assert.equal(r.hayMas, false);
});

test("no se mezclan plataformas no seleccionadas", () => {
  const r = combinarUltimos({
    regionales: [t(1, "2026-08-28", ["n"]), t(2, "2026-08-27", ["d"])],
    porRed: [t(3, "2026-08-26", ["m"])],
    providers: ["d"], page: 1, porPagina: 20, hoy: "2026-08-30",
  });
  assert.deepEqual(r.items.map((x) => x.id), [2]);
});

test("un título en varias plataformas entra si UNA es del usuario", () => {
  const r = combinarUltimos({
    regionales: [t(1, "2026-08-28", ["n", "d"])], porRed: [],
    providers: ["d"], page: 1, porPagina: 20, hoy: "2026-08-30",
  });
  assert.deepEqual(r.items.map((x) => x.id), [1]);
});

test("se descarta lo que no tiene ficha completa", () => {
  const sinPoster = { ...t(5, "2026-08-28"), poster: null };
  const r = combinarUltimos({
    regionales: [sinPoster, t(6, "2026-08-27")], porRed: [],
    providers: ["d"], page: 1, porPagina: 20, hoy: "2026-08-30",
  });
  assert.deepEqual(r.items.map((x) => x.id), [6]);
});

test("sin fecha no entra: no se puede ordenar ni saber si ya estrenó", () => {
  const r = combinarUltimos({
    regionales: [{ ...t(5, "2026-08-28"), fecha: "" }], porRed: [],
    providers: ["d"], page: 1, porPagina: 20, hoy: "2026-08-30",
  });
  assert.deepEqual(r.items, []);
});

// ============================================================================
// Catálogo grande: la lista regional NO se trunca
// ============================================================================
//
// 🔴 LA REGRESIÓN QUE ESTOS TESTS IMPIDEN. La primera versión mezclaba una
// ventana fija de 3 páginas por fuente, así que con Netflix, Max o Prime la
// página 4 salía vacía aunque TMDB tuviera cientos de resultados. Era peor que
// la lista paginada anterior, que sí seguía de largo.

/** 137 títulos regionales con fechas descendentes y sin empates. */
const REGIONAL_GRANDE: CandidatoUltimos[] = Array.from({ length: 137 }, (_, i) => {
  const dia = new Date(Date.UTC(2026, 7, 30) - i * 864e5).toISOString().slice(0, 10);
  return t(5000 + i, dia);
});

test("más de 60 resultados regionales: se sirven todos, sin ventana", () => {
  const vistos: number[] = [];
  for (let p = 1; p <= 7; p++) {
    vistos.push(...combinarUltimos({
      regionales: REGIONAL_GRANDE, porRed: [],
      providers: ["d"], page: p, porPagina: 20, hoy: "2026-08-30",
    }).items.map((x) => x.id));
  }
  assert.equal(vistos.length, 137, "se truncó la lista regional");
  assert.equal(new Set(vistos).size, 137, "hay repetidos");
});

test("páginas 1 a 5: ni intersecciones ni omisiones", () => {
  const paginas: number[][] = [];
  for (let p = 1; p <= 5; p++) {
    paginas.push(combinarUltimos({
      regionales: REGIONAL_GRANDE, porRed: [],
      providers: ["d"], page: p, porPagina: 20, hoy: "2026-08-30",
    }).items.map((x) => x.id));
  }
  const plano = paginas.flat();
  assert.equal(plano.length, 100, "alguna página vino corta");
  assert.equal(new Set(plano).size, 100, "hay repetidos entre páginas");
  // Y son exactamente los 100 primeros de la clasificación completa.
  const completa = combinarUltimos({
    regionales: REGIONAL_GRANDE, porRed: [],
    providers: ["d"], page: 1, porPagina: 100, hoy: "2026-08-30",
  }).items.map((x) => x.id);
  assert.deepEqual(plano, completa, "las páginas no reproducen la clasificación");
});

test("una plataforma SIN red oficial habilitada pagina igual", () => {
  // Netflix no está en el registro de enlace oficial: su riel es sólo regional.
  // Es exactamente el caso que quedaba truncado en la página 4.
  const soloNetflix = REGIONAL_GRANDE.map((x) => ({ ...x, platforms: ["n"] as UITitle["platforms"] }));
  const p4 = combinarUltimos({
    regionales: soloNetflix, porRed: [],
    providers: ["n"], page: 4, porPagina: 20, hoy: "2026-08-30",
  });
  assert.equal(p4.items.length, 20, "la página 4 vino vacía o corta");
  assert.equal(p4.hayMas, true);
});

test("Disney+ mezcla las dos fuentes a lo largo de varias páginas", () => {
  const extras = [GUTIERREZ, t(9001, "2026-08-20"), t(9002, "2026-07-15")];
  const vistos: number[] = [];
  for (let p = 1; p <= 8; p++) {
    vistos.push(...combinarUltimos({
      regionales: REGIONAL_GRANDE, porRed: extras,
      providers: ["d"], page: p, porPagina: 20, hoy: "2026-08-30",
    }).items.map((x) => x.id));
  }
  assert.equal(vistos.length, 140, "no entraron los tres de la fuente por red");
  assert.equal(new Set(vistos).size, 140, "hay repetidos");
  for (const e of extras) assert.ok(vistos.includes(e.id), `falta el extra ${e.id}`);
});

test("hayMas refleja que el catálogo regional sigue, no sólo la ventana en memoria", () => {
  // Con una sola página regional cargada pero más páginas disponibles en TMDB,
  // `hayMas` tiene que ser true aunque la lista en memoria se haya agotado.
  const r = combinarUltimos({
    regionales: REGIONAL_GRANDE.slice(0, 20), porRed: [],
    providers: ["d"], page: 1, porPagina: 20, hoy: "2026-08-30",
    hayMasRegional: true,
  });
  assert.equal(r.items.length, 20);
  assert.equal(r.hayMas, true, "diría que se acabó teniendo más páginas en TMDB");
});

test("sin más páginas regionales y sin sobrantes, hayMas es false", () => {
  const r = combinarUltimos({
    regionales: REGIONAL_GRANDE.slice(0, 20), porRed: [],
    providers: ["d"], page: 1, porPagina: 20, hoy: "2026-08-30",
    hayMasRegional: false,
  });
  assert.equal(r.hayMas, false);
});

test("una página posterior al final está REALMENTE vacía", () => {
  const r = combinarUltimos({
    regionales: REGIONAL_GRANDE, porRed: [],
    providers: ["d"], page: 20, porPagina: 20, hoy: "2026-08-30",
  });
  assert.deepEqual(r.items, []);
  assert.equal(r.hayMas, false);
});
