// El resolver de ayudas de búsqueda: filtrado, deduplicación y los dos
// switches, que son INDEPENDIENTES.
//
// Todo se prueba contra la función REAL. La primera versión de este test leía
// la configuración adentro del módulo y por eso tenía que duplicar la lógica en
// una réplica — que es exactamente lo que después se desincroniza y deja de
// probar nada. `ayudasDeBusqueda` recibe la configuración por argumento.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ayudasDeBusqueda } from "./consultas-verificadas.ts";
import type { PlatformCode } from "./types.ts";

const melBrooks = {
  tipo: "movie" as const, tmdbId: 12535,
  tituloVisible: "Angustias del Doctor Mel Brooks",
  originalTitle: "High Anxiety",
  plataformas: ["d"] as PlatformCode[],
};

// ============================================================================
// LAS CUATRO COMBINACIONES DE SWITCHES
// ============================================================================
// `CONSULTA_VERIFICADA=0` apaga SOLO el mapa por plataforma. El respaldo al
// título original es otra ayuda y no depende de ese switch.

test("es-ES + mapa encendido → ayuda verificada, SIN respaldo original", async () => {
  const r = await ayudasDeBusqueda({ ...melBrooks, idiomaBase: "es-ES", mapaActivo: true });
  assert.deepEqual(r.ayudas, [{ plataforma: "d", consulta: "High Anxiety" }]);
  assert.equal(r.ayudaOriginal, undefined, "con es-ES el respaldo genérico NO se emite");
});

test("es-ES + mapa apagado → nada", async () => {
  const r = await ayudasDeBusqueda({ ...melBrooks, idiomaBase: "es-ES", mapaActivo: false });
  assert.equal(r.ayudas, undefined);
  assert.equal(r.ayudaOriginal, undefined);
});

test("es-MX + mapa encendido → la verificada, y el original NO se duplica", async () => {
  const r = await ayudasDeBusqueda({ ...melBrooks, idiomaBase: "es-MX", mapaActivo: true });
  assert.deepEqual(r.ayudas, [{ plataforma: "d", consulta: "High Anxiety" }]);
  assert.equal(r.ayudaOriginal, undefined, "sería la misma cadena dos veces");
});

test("es-MX + mapa APAGADO → el original sigue funcionando como respaldo", async () => {
  // El caso que prueba que los switches son independientes. Si la dedup mirara
  // el MAPA en vez de las ayudas EMITIDAS, Mel Brooks se quedaría sin nada:
  // suprimido por una ayuda que nunca se mostró.
  const r = await ayudasDeBusqueda({ ...melBrooks, idiomaBase: "es-MX", mapaActivo: false });
  assert.equal(r.ayudas, undefined);
  assert.equal(r.ayudaOriginal, "High Anxiety", "apagar el mapa NO apaga el respaldo");
});

// ============================================================================
// movie:278 — el respaldo genérico NO se despliega antes que es-MX
// ============================================================================

test("movie:278 con es-ES NO ofrece el título original", async () => {
  // Medido: en Netflix, "Cadena perpetua" no encuentra nada y "The Shawshank
  // Redemption" tampoco. Lo único que funciona es el es-MX "Sueño de fuga".
  // Ofrecer el original al lado de un título que tampoco sirve manda al usuario
  // a fallar DOS veces. Unión es-ES + original: 28/29. es-MX + original: 29/29.
  const r = await ayudasDeBusqueda({
    tipo: "movie", tmdbId: 278, tituloVisible: "Cadena perpetua",
    originalTitle: "The Shawshank Redemption", plataformas: ["n"],
    idiomaBase: "es-ES", mapaActivo: true,
  });
  assert.equal(r.ayudaOriginal, undefined);
  assert.equal(r.ayudas, undefined);
});

test("movie:278 con es-MX SÍ lo ofrece", async () => {
  const r = await ayudasDeBusqueda({
    tipo: "movie", tmdbId: 278, tituloVisible: "Sueño de fuga",
    originalTitle: "The Shawshank Redemption", plataformas: ["n"],
    idiomaBase: "es-MX", mapaActivo: true,
  });
  assert.equal(r.ayudaOriginal, "The Shawshank Redemption");
});

// ============================================================================
// Filtrado
// ============================================================================

test("no emite ayuda para una plataforma donde el título no está", async () => {
  // Mel Brooks tiene entrada para Disney+. Con Netflix y Max, nada: una ayuda
  // para una plataforma que no lo tiene mandaría al usuario a buscar al lugar
  // equivocado.
  const r = await ayudasDeBusqueda({
    ...melBrooks, plataformas: ["n", "m"], idiomaBase: "es-ES", mapaActivo: true,
  });
  assert.equal(r.ayudas, undefined);
});

test("descarta la ayuda cuando la consulta ES el título que ya se muestra", async () => {
  // En 13 de los 17 casos medidos la consulta verificada es el título es-MX:
  // sin esta regla el bloque aparecería casi siempre y diría lo obvio.
  const r = await ayudasDeBusqueda({
    ...melBrooks, tituloVisible: "high anxiety", idiomaBase: "es-ES", mapaActivo: true,
  });
  assert.equal(r.ayudas, undefined, "la comparación ignora mayúsculas y acentos");
});

test("un título sin entrada en el mapa no emite ayudas", async () => {
  const r = await ayudasDeBusqueda({
    tipo: "movie", tmdbId: 557, tituloVisible: "El hombre araña",
    originalTitle: "Spider-Man", plataformas: ["p", "m"],
    idiomaBase: "es-ES", mapaActivo: true,
  });
  assert.equal(r.ayudas, undefined);
});

test("con es-MX y sin entrada, el original solo sale si difiere del visible", async () => {
  const base = {
    tipo: "movie" as const, tmdbId: 557, plataformas: ["p"] as PlatformCode[],
    idiomaBase: "es-MX", mapaActivo: true,
  };
  const difiere = await ayudasDeBusqueda({
    ...base, tituloVisible: "El hombre araña", originalTitle: "Spider-Man",
  });
  assert.equal(difiere.ayudaOriginal, "Spider-Man");

  // "Zootopia 2" es a la vez el es-MX y el original: no hay nada que sugerir.
  const igual = await ayudasDeBusqueda({
    ...base, tituloVisible: "Zootopia 2", originalTitle: "Zootopia 2",
  });
  assert.equal(igual.ayudaOriginal, undefined);
});

test("una plataforma con entrada y otra sin ella: una sola línea", async () => {
  const r = await ayudasDeBusqueda({
    ...melBrooks, plataformas: ["d", "n", "m"], idiomaBase: "es-ES", mapaActivo: true,
  });
  assert.equal(r.ayudas?.length, 1);
  assert.equal(r.ayudas?.[0].plataforma, "d");
});

test("otro país no matchea la entrada AR", async () => {
  const r = await ayudasDeBusqueda({
    ...melBrooks, pais: "MX", idiomaBase: "es-ES", mapaActivo: true,
  });
  assert.equal(r.ayudas, undefined, "la resolución es por país, no solo por plataforma");
});

test("devuelve campos AUSENTES, no arrays vacíos", async () => {
  const r = await ayudasDeBusqueda({
    tipo: "movie", tmdbId: 999999, tituloVisible: "Nada", plataformas: [],
    idiomaBase: "es-MX", mapaActivo: true,
  });
  assert.equal("ayudas" in r, false);
  assert.equal("ayudaOriginal" in r, false);
});

// ============================================================================
// El componente NO resuelve nada
// ============================================================================

test("ningún componente cliente importa el mapa, el idioma ni las claves", () => {
  // Reemplaza al guard `server-only` y es más preciso: lo que hay que impedir es
  // que un "use client" lo importe, no que el módulo exista. Si esto falla, el
  // mapa de excepciones se está yendo al bundle del navegador y la ficha estaría
  // decidiendo cosas que le tocan al servidor.
  const prohibidos = ["consultas-verificadas", "/idioma", "/claves"];
  const infractores: string[] = [];

  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === "node_modules" || e.startsWith(".")) continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) { recorrer(p); continue; }
      if (!/\.tsx?$/.test(e) || e.endsWith(".test.ts")) continue;
      const src = readFileSync(p, "utf8");
      if (!/^\s*["']use client["']/m.test(src)) continue;
      for (const mod of prohibidos) {
        if (new RegExp(`from\\s+["'][^"']*${mod}["']`).test(src)) infractores.push(`${p} → ${mod}`);
      }
    }
  };
  recorrer("components");
  recorrer("app");

  assert.deepEqual(infractores, [],
    `un componente cliente importa lógica de servidor:\n${infractores.join("\n")}`);
});
