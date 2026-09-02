// La regla de evidencia oficial GENERAL: seis plataformas, series y películas.
//
// Reemplaza a la regla de una sola plataforma. Los números que la justifican
// están en `docs/medidas/2026-08-31-medicion-regla-final.md`: sobre 171 series y
// 23 películas con verdad de campo, **144 + 22 aciertos y CERO falsos
// positivos**.
//
// 🔴 EL CRITERIO DE PRODUCTO CAMBIÓ, y con él la forma de la regla. Antes se
// buscaba certeza; ahora se prioriza COBERTURA aceptando una tasa baja y medida
// de falsos positivos. Es preferible mostrar de vez en cuando un título que no
// esté, antes que ocultar muchos que sí están. Tres reglas viejas se cayeron con
// datos, y los tests de acá las fijan al revés:
//
//   · el tope de regiones (aceptaba 0 títulos y evitaba 0 errores);
//   · el rechazo de locales extranjeros (costaba 4 series y TODA la señal de
//     películas, y evitaba 0 errores);
//   · la exclusión de `hbo.com` (43 casos medidos, 35 en Max AR, 0 en otra).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADAPTADORES_OFICIALES, dedupePorIdentidad, evidenciaOficialDe, hayContradiccionFuerte,
  identidadOficial, resumenRegional,
  type DatosTitulo, type ResumenRegional,
} from "./enlace-oficial.ts";
import type { PlatformCode } from "./types";

const HOY = "2026-08-31";
const SIN_REGIONES: ResumenRegional = { rt: 0, rp: {}, ru: 0 };

const base = (o: Partial<DatosTitulo> = {}): DatosTitulo => ({
  tipo: "tv", estreno: "2026-08-01", redes: [], homepage: "", reg: SIN_REGIONES, ...o,
});

const inferir = (o: Partial<DatosTitulo>, arIds: number[] = []) =>
  evidenciaOficialDe({ datos: base(o), arIds, hoy: HOY });

// ============================================================================
// 1. Los dos casos testigo — sin hardcodear ninguno
// ============================================================================

test("MORIA resuelve Netflix por enlace oficial, SIN Top 10", () => {
  // tv:322428, medido el 2026-08-31: red Netflix(213), homepage de título, y
  // CERO regiones con flatrate en todo el mundo. La evidencia del Top 10 vence a
  // los 14 días; ésta no vence.
  assert.equal(inferir({
    tipo: "tv", estreno: "2026-08-14", redes: [213],
    homepage: "https://www.netflix.com/title/81958141",
  }), "n");
});

test("GUTIÉRREZ conserva Disney+", () => {
  // tv:275224: red Disney+(2739), enlace de entidad, 3 regiones.
  assert.equal(inferir({
    tipo: "tv", estreno: "2026-08-26", redes: [2739],
    homepage: "https://www.disneyplus.com/browse/entity-bafb5cb7-91e5-4b20-85bb-6cf6b5fe2a00",
    reg: { rt: 3, rp: { d: 3 }, ru: 0 },
  }), "d");
});

test("ningún título está hardcodeado en la regla", async () => {
  const fs = await import("node:fs");
  // Se mira el CÓDIGO, no la prosa: los comentarios citan los casos medidos a
  // propósito, y ésa es documentación, no un parche por título.
  const src = fs.readFileSync(new URL("./enlace-oficial.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  for (const id of ["322428", "275224", "81958141", "bafb5cb7"]) {
    assert.equal(src.includes(id), false, `quedó hardcodeado ${id}`);
  }
  // Canario: los ids SÍ están en los comentarios, o el test no probaría nada.
  const conProsa = fs.readFileSync(new URL("./enlace-oficial.ts", import.meta.url), "utf8");
  assert.ok(conProsa.includes("275224"), "el canario dejó de tener sentido");
});

// ============================================================================
// 2. Un positivo y un negativo por plataforma habilitada
// ============================================================================

const POSITIVOS_SERIE: [PlatformCode, number, string][] = [
  ["n",  213,  "https://www.netflix.com/title/80154610"],
  ["d",  2739, "https://www.disneyplus.com/browse/entity-006b5808-ac23-4e0b-9a15-752c4f335220"],
  ["p",  1024, "https://www.primevideo.com/detail/0OFXXAAGVI9TXFD5K1AJD34T5V"],
  ["m",  49,   "https://www.hbo.com/content/task"],
  ["pp", 4330, "https://www.paramountplus.com/shows/the-real-wolf-of-wall-street"],
  ["at", 2552, "https://tv.apple.com/show/umc.cmc.5tugaz9vt498ajn7q64ypaqxn"],
];

for (const [code, red, url] of POSITIVOS_SERIE) {
  test(`POSITIVO serie — ${code}`, () => {
    assert.equal(inferir({ tipo: "tv", redes: [red], homepage: url }), code);
  });
}

// La segunda forma de ruta de Prime, medida en la muestra.
test("POSITIVO serie — Prime con la ruta amzn1.dv.gti", () => {
  assert.equal(inferir({
    tipo: "tv", redes: [1024],
    homepage: "https://www.primevideo.com/detail/amzn1.dv.gti.9859e353-dc45-442a-be2d-5a1b2c3d4e5f",
  }), "p");
});

test("POSITIVO serie — Max con hbo.com y ruta corta", () => {
  // La muestra trae `/content/<slug>` (15) y `/<slug>` (13).
  assert.equal(inferir({ tipo: "tv", redes: [49], homepage: "https://www.hbo.com/fantasmas" }), "m");
  assert.equal(inferir({ tipo: "tv", redes: [3186], homepage: "https://www.hbo.com/content/lanterns" }), "m");
});

const NEGATIVOS: [string, Partial<DatosTitulo>][] = [
  ["Netflix: portada genérica", { redes: [213], homepage: "https://www.netflix.com/browse" }],
  ["Netflix: búsqueda", { redes: [213], homepage: "https://www.netflix.com/search?q=x" }],
  ["Disney+: sección de marca", { redes: [2739], homepage: "https://www.disneyplus.com/brand/marvel" }],
  ["Disney+: entidad incompleta", { redes: [2739], homepage: "https://www.disneyplus.com/browse/entity-bafb5cb7-91e5" }],
  ["Prime: la TIENDA de Amazon", { redes: [1024], homepage: "https://www.amazon.com/dp/B0H49C7NVH" }],
  ["Prime: gp/video de la tienda", { redes: [1024], homepage: "https://www.amazon.com/gp/video/detail/B0GSNDY9MB" }],
  ["Max: hbo.com sin ruta", { redes: [49], homepage: "https://www.hbo.com/" }],
  ["Paramount+: portada", { redes: [4330], homepage: "https://www.paramountplus.com/" }],
  ["Apple: portada", { redes: [2552], homepage: "https://tv.apple.com/" }],
  ["Apple: id que no es umc.cmc", { redes: [2552], homepage: "https://tv.apple.com/show/algo-cualquiera" }],
];

for (const [etiqueta, datos] of NEGATIVOS) {
  test(`NEGATIVO — ${etiqueta}`, () => {
    assert.equal(inferir({ tipo: "tv", ...datos }), null);
  });
}

// ============================================================================
// 3. Dominios: lo que un `includes` dejaría pasar
// ============================================================================

for (const [etiqueta, url] of Object.entries({
  "subdominio malicioso": "https://netflix.com.evil.ru/title/123",
  "dominio parecido": "https://netflix-ar.com/title/123",
  "marca en el path": "https://evil.example/netflix.com/title/123",
  "subdominio propio no aprobado": "https://press.netflix.com/title/123",
  "http en vez de https": "http://www.netflix.com/title/123",
})) {
  test(`DOMINIO rechazado — ${etiqueta}`, () => {
    assert.equal(inferir({ tipo: "tv", redes: [213], homepage: url }), null);
  });
}

test("dominio del mismo GRUPO pero no del servicio", () => {
  // Casos reales de la muestra de Disney+.
  for (const url of [
    "https://www.marvel.com/watch/digital-series/countdown",
    "https://www.espn.com/x",
    "https://www.hulu.com/series/2020-britains-most-notorious",
  ]) {
    assert.equal(inferir({ tipo: "tv", redes: [2739], homepage: url }), null, url);
  }
});

// ============================================================================
// 4. Red y enlace tienen que ser de la MISMA plataforma
// ============================================================================

test("red Netflix con enlace de Disney+: no infiere", () => {
  assert.equal(inferir({
    tipo: "tv", redes: [213],
    homepage: "https://www.disneyplus.com/browse/entity-006b5808-ac23-4e0b-9a15-752c4f335220",
  }), null);
});

test("enlace sin red: no infiere (en SERIES)", () => {
  assert.equal(inferir({ tipo: "tv", redes: [], homepage: "https://www.netflix.com/title/123" }), null);
});

test("red sin enlace: no infiere", () => {
  assert.equal(inferir({ tipo: "tv", redes: [213], homepage: "" }), null);
});

test("dos redes de plataformas soportadas distintas: ambiguo", () => {
  assert.equal(inferir({
    tipo: "tv", redes: [213, 2739], homepage: "https://www.netflix.com/title/123",
  }), null);
});

test("una red soportada más otras que no lo son: sigue valiendo", () => {
  // Caso real: YouTube(247) + Disney+(2739).
  assert.equal(inferir({
    tipo: "tv", redes: [247, 2739],
    homepage: "https://www.disneyplus.com/browse/entity-006b5808-ac23-4e0b-9a15-752c4f335220",
  }), "d");
});

// ============================================================================
// 5. Locales: CUALQUIERA se acepta
// ============================================================================

test("CUALQUIER locale se acepta en una URL de título", () => {
  // Medido: rechazarlos costaba 4 series y el 100% de la señal de películas, y
  // no evitaba ni un falso positivo. El locale identifica la tienda que generó
  // el enlace, no dónde está disponible el título.
  const casos: [string, PlatformCode, number][] = [
    ["https://www.netflix.com/br/title/81714560", "n", 213],
    ["https://www.netflix.com/ng/title/82019182", "n", 213],
    ["https://www.netflix.com/es/title/81278442", "n", 213],
    ["https://www.disneyplus.com/ja-jp/browse/entity-3cd8b19e-d628-43a8-aa62-d0e7841929e0", "d", 2739],
    ["https://www.disneyplus.com/tr-tr/browse/entity-12dafbdf-ee37-4cbb-ab4a-0a3a13b523d5", "d", 2739],
    ["https://www.disneyplus.com/es-es/browse/entity-3c055b32-28f7-4c27-8a0b-7a8cd9109dd4", "d", 2739],
    ["https://tv.apple.com/es/movie/umc.cmc.52sgmi3vdpedurrbtz6louqqo", "at", 2552],
  ];
  for (const [url, code, red] of casos) {
    assert.equal(inferir({ tipo: "tv", redes: [red], homepage: url }), code, url);
  }
});

test("el locale no puede tapar una ruta genérica", () => {
  assert.equal(inferir({ tipo: "tv", redes: [213], homepage: "https://www.netflix.com/br/browse" }), null);
});

// ============================================================================
// 6. Películas: SIN networks, sólo el enlace
// ============================================================================

const POSITIVOS_PELI: [PlatformCode, string][] = [
  ["n",  "https://www.netflix.com/es/title/81975622"],
  ["d",  "https://www.disneyplus.com/es-es/browse/entity-c5b69f75-f159-4749-873d-9a1d1a4eb878"],
  ["p",  "https://www.primevideo.com/detail/0SECUE0M0XPUAT47K4JWQT6573"],
  ["at", "https://tv.apple.com/es/movie/umc.cmc.5q6yvnse5dxw6wbb1sxcwij2k"],
];

for (const [code, url] of POSITIVOS_PELI) {
  test(`POSITIVO película — ${code}, por homepage y sin networks`, () => {
    assert.equal(inferir({ tipo: "movie", redes: [], homepage: url }), code);
  });
}

test("película SIN homepage: no infiere", () => {
  assert.equal(inferir({ tipo: "movie", redes: [], homepage: "" }), null);
});

test("película: `networks` NO se usa aunque venga", () => {
  // Si algo poblara `networks` en una película, no puede alcanzar por sí solo.
  assert.equal(inferir({ tipo: "movie", redes: [213], homepage: "" }), null);
  // Y con enlace de OTRA plataforma, manda el enlace, no la red.
  assert.equal(inferir({
    tipo: "movie", redes: [213],
    homepage: "https://tv.apple.com/movie/umc.cmc.5q6yvnse5dxw6wbb1sxcwij2k",
  }), "at");
});

test("Max y Paramount+ NO se infieren para películas", () => {
  // Medido: 0 de 30 cada una. Habilitarlas sería inventar cobertura.
  assert.equal(inferir({ tipo: "movie", redes: [], homepage: "https://www.hbo.com/content/task" }), null);
  assert.equal(inferir({ tipo: "movie", redes: [], homepage: "https://www.max.com/shows/x/abc12345" }), null);
  assert.equal(inferir({
    tipo: "movie", redes: [], homepage: "https://www.paramountplus.com/shows/the-real-wolf-of-wall-street",
  }), null);
});

test("película con la tienda de Amazon: no infiere", () => {
  assert.equal(inferir({ tipo: "movie", redes: [], homepage: "https://www.amazon.com/dp/B0H49C7NVH" }), null);
});

// ============================================================================
// 7. Fecha
// ============================================================================

test("título FUTURO: no infiere", () => {
  assert.equal(inferir({ tipo: "tv", redes: [213], homepage: "https://www.netflix.com/title/123", estreno: "2026-09-30" }), null);
  assert.equal(inferir({ tipo: "movie", redes: [], homepage: "https://www.netflix.com/title/123", estreno: "2026-09-30" }), null);
});

test("estrena HOY: sí infiere", () => {
  assert.equal(inferir({ tipo: "tv", redes: [213], homepage: "https://www.netflix.com/title/123", estreno: HOY }), "n");
});

test("sin fecha: no infiere", () => {
  assert.equal(inferir({ tipo: "tv", redes: [213], homepage: "https://www.netflix.com/title/123", estreno: null }), null);
});

// ============================================================================
// 8. Contradicción fuerte — y lo que YA NO lo es
// ============================================================================

test("SIN límite por cantidad de regiones", () => {
  // El tope que se había propuesto aceptaba 0 títulos y evitaba 0 errores.
  // Un título en 61 regiones de su plataforma sigue infiriendo.
  assert.equal(inferir({
    tipo: "tv", redes: [1024],
    homepage: "https://www.primevideo.com/detail/0GSS582WZO2ZAE4KZZIRZK8K1E",
    reg: { rt: 61, rp: { p: 61 }, ru: 0 },
  }), "p");
});

test("estar en muchas regiones y NO en AR ya no es contradicción", () => {
  assert.equal(inferir({
    tipo: "tv", redes: [2739],
    homepage: "https://www.disneyplus.com/browse/entity-006b5808-ac23-4e0b-9a15-752c4f335220",
    reg: { rt: 24, rp: { d: 24 }, ru: 0 },
  }), "d");
});

test("CONTRADICCIÓN: otra plataforma domina las regiones", () => {
  // 5+ regiones, ninguna con ésta, y >=60% con otra.
  assert.equal(inferir({
    tipo: "tv", redes: [2739],
    homepage: "https://www.disneyplus.com/browse/entity-006b5808-ac23-4e0b-9a15-752c4f335220",
    reg: { rt: 10, rp: { n: 8 }, ru: 2 },
  }), null);
});

test("por debajo de 5 regiones no alcanza para contradecir", () => {
  assert.equal(inferir({
    tipo: "tv", redes: [2739],
    homepage: "https://www.disneyplus.com/browse/entity-006b5808-ac23-4e0b-9a15-752c4f335220",
    reg: { rt: 4, rp: { n: 4 }, ru: 0 },
  }), "d");
});

test("por debajo del 60% tampoco", () => {
  assert.equal(inferir({
    tipo: "tv", redes: [2739],
    homepage: "https://www.disneyplus.com/browse/entity-006b5808-ac23-4e0b-9a15-752c4f335220",
    reg: { rt: 10, rp: { n: 5 }, ru: 5 },
  }), "d");
});

test("si la plataforma aparece en alguna región, no hay contradicción", () => {
  assert.equal(inferir({
    tipo: "tv", redes: [2739],
    homepage: "https://www.disneyplus.com/browse/entity-006b5808-ac23-4e0b-9a15-752c4f335220",
    reg: { rt: 20, rp: { d: 1, n: 19 }, ru: 0 },
  }), "d");
});

test("CONTRADICCIÓN: AR informa otra plataforma", () => {
  assert.equal(inferir(
    { tipo: "tv", redes: [213], homepage: "https://www.netflix.com/title/123" },
    [337], // AR dice Disney+
  ), null);
});

test("AR informando la MISMA plataforma no contradice", () => {
  assert.equal(inferir(
    { tipo: "tv", redes: [213], homepage: "https://www.netflix.com/title/123" },
    [8],
  ), "n");
});

// --- la función de contradicción, directa ---

test("hayContradiccionFuerte: los cuatro caminos", () => {
  const d = ADAPTADORES_OFICIALES.find((a) => a.code === "d")!;
  assert.equal(hayContradiccionFuerte({ rt: 0, rp: {}, ru: 0 }, d, []), null);
  assert.equal(hayContradiccionFuerte({ rt: 0, rp: {}, ru: 0 }, d, [8]), "AR informa otra plataforma");
  assert.match(String(hayContradiccionFuerte({ rt: 10, rp: { n: 6 }, ru: 4 }, d, [])), /otra plataforma/);
  assert.equal(hayContradiccionFuerte({ rt: 10, rp: { d: 1, n: 6 }, ru: 3 }, d, []), null);
});

// ============================================================================
// 9. El registro: qué está habilitado y para qué
// ============================================================================

test("las SEIS plataformas están habilitadas para series", () => {
  const series = ADAPTADORES_OFICIALES.filter((a) => a.series).map((a) => a.code).sort();
  assert.deepEqual(series, ["at", "d", "m", "n", "p", "pp"]);
});

test("sólo CUATRO están habilitadas para películas", () => {
  // Max y Paramount+ midieron 0 de 30. Sumarlas sería aparentar cobertura.
  const pelis = ADAPTADORES_OFICIALES.filter((a) => a.peliculas).map((a) => a.code).sort();
  assert.deepEqual(pelis, ["at", "d", "n", "p"]);
});

test("cada adaptador declara redes, hosts, rutas e ids globales", () => {
  for (const a of ADAPTADORES_OFICIALES) {
    assert.ok(a.redes.length, `${a.code}: sin redes`);
    assert.ok(a.hosts.length, `${a.code}: sin hosts`);
    assert.ok(a.rutas.length, `${a.code}: sin rutas`);
    assert.ok(a.idsGlobales.length, `${a.code}: sin ids globales`);
    for (const h of a.hosts) assert.doesNotMatch(h, /^https?:|\//, `${a.code}: host con esquema o ruta`);
  }
});

test("`amazon.com` no está en ningún host", () => {
  for (const a of ADAPTADORES_OFICIALES) {
    for (const h of a.hosts) assert.doesNotMatch(h, /(^|\.)amazon\./, `${a.code} acepta ${h}`);
  }
});

test("`hbo.com` está SÓLO en Max y sólo para series", () => {
  const conHbo = ADAPTADORES_OFICIALES.filter((a) => a.hosts.some((h) => h.endsWith("hbo.com")));
  assert.deepEqual(conHbo.map((a) => a.code), ["m"]);
  assert.equal(conHbo[0].peliculas, false);
});

// ============================================================================
// 10. `pv3:` — el resumen regional que la regla consume
// ============================================================================
//
// `pv2:` guardaba ids DEDUPLICADOS y con eso no se puede comprobar la dominancia
// por regiones: la deduplicación se comió la frecuencia. Estos tests fijan los
// tres contadores.

test("pv3: `rt` cuenta REGIONES, no proveedores, y excluye AR", () => {
  const r = resumenRegional({
    AR: { flatrate: [{ provider_id: 8 }] },          // AR no cuenta
    US: { flatrate: [{ provider_id: 8 }, { provider_id: 337 }] },
    GB: { flatrate: [{ provider_id: 8 }] },
    FR: { flatrate: [] },                            // sin flatrate, no cuenta
    IT: undefined,
  });
  assert.equal(r.rt, 2, "contó AR, o contó proveedores en vez de regiones");
});

test("pv3: `rp` cuenta cuántas REGIONES informan cada plataforma", () => {
  const r = resumenRegional({
    US: { flatrate: [{ provider_id: 8 }, { provider_id: 337 }] },
    GB: { flatrate: [{ provider_id: 8 }] },
    ES: { flatrate: [{ provider_id: 8 }] },
  });
  assert.equal(r.rp.n, 3);
  assert.equal(r.rp.d, 1);
  assert.equal(r.rp.m, undefined, "guardó ceros");
});

test("pv3: `ru` cuenta regiones SIN ninguna plataforma soportada", () => {
  // 2336 = JioHotstar, 15 = Hulu: reales y no soportadas en AR.
  const r = resumenRegional({
    IN: { flatrate: [{ provider_id: 2336 }] },
    JP: { flatrate: [{ provider_id: 15 }] },
    US: { flatrate: [{ provider_id: 8 }] },
  });
  assert.equal(r.rt, 3);
  assert.equal(r.ru, 2, "sin `ru`, un título en 20 regiones ajenas parecería no tener datos");
  assert.equal(r.rp.n, 1);
});

test("pv3: un id de plataforma en varias regiones no se deduplica", () => {
  const regiones = Object.fromEntries(
    ["US", "GB", "ES", "IT", "FR", "DE"].map((r) => [r, { flatrate: [{ provider_id: 8 }] }]),
  );
  const r = resumenRegional(regiones);
  assert.equal(r.rt, 6);
  assert.equal(r.rp.n, 6, "se perdió la frecuencia, que es justo lo que pv2 no podía guardar");
  // Y con eso la dominancia se puede comprobar de verdad.
  const d = ADAPTADORES_OFICIALES.find((a) => a.code === "d")!;
  assert.match(String(hayContradiccionFuerte(r, d, [])), /otra plataforma \(n\)/);
});

test("pv3: sin datos regionales no hay contradicción posible", () => {
  const r = resumenRegional({});
  assert.deepEqual(r, { rt: 0, rp: {}, ru: 0 });
  const n = ADAPTADORES_OFICIALES.find((a) => a.code === "n")!;
  assert.equal(hayContradiccionFuerte(r, n, []), null);
});

// ============================================================================
// 11. Identidad oficial: `?jbv=` y deduplicación sin heurística
// ============================================================================
//
// EL CASO. TMDB tiene el mismo programa cargado DOS veces: `tv:322428` y
// `movie:1752041`, mismo día, misma productora y **el mismo id de Netflix**.
// La búsqueda mostraba dos cards, una en color y otra en gris.
//
// La gris se rechazaba porque su `homepage` es `netflix.com/browse?jbv=<n>`: la
// ruta es `/browse`, que es el canario de portada genérica. Pero el parámetro
// `jbv` SÍ identifica un título concreto. Medido: de 80 series de Netflix con
// homepage, 71 usan `/title/<n>` y **1** usa `/browse?jbv=<n>`.
//
// 🔴 LA DEDUPLICACIÓN NO USA NINGUNA HEURÍSTICA. No mira título, ni fecha, ni
// productora, ni sinopsis, ni parecido textual: esas señales esconden obras
// legítimamente distintas. Compara el IDENTIFICADOR OFICIAL de la plataforma,
// que es un dato comprobable.

test("`/browse?jbv=<n>` se acepta como ruta de título", () => {
  assert.equal(inferir({
    tipo: "movie", redes: [],
    homepage: "https://www.netflix.com/browse?jbv=81958141",
  }), "n");
});

test("`/browse` SIN jbv se sigue rechazando", () => {
  for (const url of [
    "https://www.netflix.com/browse",
    "https://www.netflix.com/browse/",
    "https://www.netflix.com/browse?foo=1",
    "https://www.netflix.com/browse?jbv=",
    "https://www.netflix.com/browse?jbv=abc",
    "https://www.netflix.com/browse?jbv=12ab",
    "https://www.netflix.com/browse?jbv=1&jbv=2",
  ]) {
    assert.equal(inferir({ tipo: "tv", redes: [213], homepage: url }), null, url);
  }
});

test("identidadOficial extrae el mismo id de las DOS formas de Netflix", () => {
  assert.equal(identidadOficial("https://www.netflix.com/title/81958141"), "n:81958141");
  assert.equal(identidadOficial("https://www.netflix.com/browse?jbv=81958141"), "n:81958141");
  // Y con locale, que también se acepta.
  assert.equal(identidadOficial("https://www.netflix.com/es/title/81958141"), "n:81958141");
});

test("identidadOficial devuelve null donde no hay evidencia", () => {
  for (const url of [
    "", "https://www.netflix.com/browse", "https://www.netflix.com/",
    "https://netflix-ar.com/title/123", "http://www.netflix.com/title/123",
    "https://www.amazon.com/dp/B0H49C7NVH", "no-es-una-url",
  ]) {
    assert.equal(identidadOficial(url), null, url);
  }
});

test("identidadOficial funciona en las seis plataformas", () => {
  assert.equal(identidadOficial("https://www.netflix.com/title/80154610"), "n:80154610");
  assert.equal(
    identidadOficial("https://www.disneyplus.com/browse/entity-006b5808-ac23-4e0b-9a15-752c4f335220"),
    "d:006b5808-ac23-4e0b-9a15-752c4f335220",
  );
  assert.equal(
    identidadOficial("https://www.primevideo.com/detail/0OFXXAAGVI9TXFD5K1AJD34T5V"),
    "p:0OFXXAAGVI9TXFD5K1AJD34T5V",
  );
  assert.equal(identidadOficial("https://www.hbo.com/content/task"), "m:task");
  assert.equal(
    identidadOficial("https://www.paramountplus.com/shows/the-real-wolf-of-wall-street"),
    "pp:the-real-wolf-of-wall-street",
  );
  assert.equal(
    identidadOficial("https://tv.apple.com/es/movie/umc.cmc.52sgmi3vdpedurrbtz6louqqo"),
    "at:umc.cmc.52sgmi3vdpedurrbtz6louqqo",
  );
});

test("dos plataformas distintas nunca comparten identidad", () => {
  const a = identidadOficial("https://www.netflix.com/title/123");
  const b = identidadOficial("https://www.primevideo.com/detail/0000000000000000123");
  assert.notEqual(a, b);
  assert.match(String(a), /^n:/);
  assert.match(String(b), /^p:/);
});

// --- la deduplicación en sí ---

test("dedupePorIdentidad junta movie y tv con el MISMO id oficial", () => {
  // El caso real: mismo id de Netflix, dos entradas de TMDB.
  const items = [
    { type: "tv" as const, id: 322428, identidad: "n:81958141" },
    { type: "movie" as const, id: 1629369, identidad: "n:99999999" },
    { type: "movie" as const, id: 1752041, identidad: "n:81958141" },
  ];
  const r = dedupePorIdentidad(items);
  assert.deepEqual(r.map((x) => `${x.type}:${x.id}`), ["tv:322428", "movie:1629369"]);
});

test("dedupePorIdentidad respeta el ORDEN ya calculado: gana el primero", () => {
  // No inventa un criterio de calidad. El orden de relevancia ya existe y decide.
  const items = [
    { type: "movie" as const, id: 2, identidad: "n:1" },
    { type: "tv" as const, id: 1, identidad: "n:1" },
  ];
  assert.deepEqual(dedupePorIdentidad(items).map((x) => x.id), [2]);
});

test("dedupePorIdentidad NO toca lo que no tiene identidad", () => {
  // Sin identidad oficial no se deduplica: dos títulos sin evidencia son dos
  // títulos, aunque se llamen parecido.
  const items = [
    { type: "tv" as const, id: 1, identidad: null },
    { type: "movie" as const, id: 2, identidad: null },
    { type: "movie" as const, id: 3, identidad: undefined },
  ];
  assert.equal(dedupePorIdentidad(items).length, 3);
});

test("dedupePorIdentidad no confunde `tipo:id` con identidad oficial", () => {
  // Mismo id numérico en tipos distintos y SIN identidad: son dos títulos.
  const items = [
    { type: "tv" as const, id: 700, identidad: null },
    { type: "movie" as const, id: 700, identidad: null },
  ];
  assert.equal(dedupePorIdentidad(items).length, 2);
});

test("no hay ningún id de Moria hardcodeado en la deduplicación", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("./enlace-oficial.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  for (const id of ["1752041", "81958141", "322428"]) {
    assert.equal(src.includes(id), false, `quedó hardcodeado ${id}`);
  }
});
