// La ORQUESTACIÓN de "Últimos lanzamientos · Series", probada por comportamiento.
//
// 🔴 LOS DOS BUGS QUE ESTE ARCHIVO CIERRA.
//
// 1. `ULTIMOS_MAX_PAGINAS = 12` era otra ventana fija con nombre de seguridad:
//    para una plataforma sin suplemento por red, la página 13 no podía reunir
//    260 resultados aunque TMDB tuviera más. El límite ahora es el real de la
//    fuente, `total_pages`.
//
// 2. La página pedida se clasificaba sobre una ventana CRECIENTE: la 1 con una
//    página regional, la 2 con dos. Un título de la segunda página empatado en
//    fecha con el borde reordenaba la clasificación, repetía uno y salteaba
//    otro. Ahora el orden regional respeta el de TMDB (que es descendente por
//    fecha) y **un extra sólo entra cuando el stream regional ya pasó su
//    fecha**: hasta entonces su posición no está decidida y meterlo sería
//    exactamente lo que producía el salteo.
//
// Los tests viejos pasaban una colección completa a `combinarUltimos` y nunca
// ejercitaban el bucle que pide páginas. Estos inyectan la fuente.
import { test } from "node:test";
import assert from "node:assert/strict";
import { paginarUltimos } from "./ultimos.ts";
import type { CandidatoUltimos, PaginaRegional } from "./ultimos.ts";
import type { PlatformCode, UITitle } from "./types";

const HOY = "2026-08-30";
const PLAT = ["d"] as PlatformCode[];

const t = (id: number, fecha: string, platforms = ["d"]): CandidatoUltimos => ({
  id, type: "tv", title: `T${id}`, year: 2026, runtime: null, poster: "/p.jpg",
  country: "AR", genres: [], platforms: platforms as UITitle["platforms"],
  tmdb: 7, hasEditorial: false, fecha,
});

/** Fecha descendente sin empates, a partir de HOY. */
const dia = (i: number) =>
  new Date(Date.UTC(2026, 7, 30) - i * 864e5).toISOString().slice(0, 10);

/** Una fuente regional paginada de `total` títulos, 20 por página. */
function fuente(total: number, hacer: (i: number) => CandidatoUltimos = (i) => t(1000 + i, dia(i))) {
  const todos = Array.from({ length: total }, (_, i) => hacer(i));
  const totalPaginas = Math.max(1, Math.ceil(total / 20));
  const pedidas: number[] = [];
  return {
    pedidas,
    totalPaginas,
    async traer(pagina: number) {
      pedidas.push(pagina);
      return {
        items: todos.slice((pagina - 1) * 20, pagina * 20),
        totalPaginas, totalResultados: total,
      };
    },
  };
}

const sinExtras = async () => [];

// ============================================================================
// 1. No hay ventana fija: la página 13 existe
// ============================================================================

test("más de 260 resultados, sin red habilitada: la página 13 devuelve sus elementos", async () => {
  // 13 × 20 = 260. Con el tope de 12 páginas esto volvía vacío.
  const f = fuente(300);
  const r = await paginarUltimos({
    page: 13, porPagina: 20, providers: PLAT, hoy: HOY,
    traerRegional: f.traer, traerExtras: sinExtras,
  });
  assert.equal(r.items.length, 20, "la página 13 vino vacía o corta");
  assert.equal(r.hayMas, true);
});

test("el bucle se detiene por agotamiento REAL de TMDB, no por un número", async () => {
  // Página 4 con 45 resultados (3 páginas): existe dentro de la cota —45
  // títulos dan hasta 3 páginas de 20, así que la 4 se descarta por cota— pero
  // la 3 sí se recorre hasta agotar la fuente.
  const f = fuente(45);
  const p3 = await paginarUltimos({
    page: 3, porPagina: 20, providers: PLAT, hoy: HOY,
    traerRegional: f.traer, traerExtras: sinExtras,
  });
  assert.equal(p3.items.length, 5, "la última página no trajo el resto");
  assert.equal(p3.hayMas, false);
  assert.equal(Math.max(...f.pedidas), 3, "no llegó hasta el final de la fuente");
  assert.ok(!f.pedidas.includes(4), "pidió una página que TMDB no tiene");
});

test("una página posterior al final vuelve vacía", async () => {
  const f = fuente(45);
  const r = await paginarUltimos({
    page: 9, porPagina: 20, providers: PLAT, hoy: HOY,
    traerRegional: f.traer, traerExtras: sinExtras,
  });
  assert.deepEqual(r.items, []);
  assert.equal(r.hayMas, false);
});

test("una página enriquecida VACÍA en el medio no corta el bucle", async () => {
  // El filtrado puede dejar una página entera en cero (todo de otra plataforma).
  // Si TMDB dice que hay más páginas, hay que seguir.
  const pedidas: number[] = [];
  const traerRegional = async (pagina: number) => {
    pedidas.push(pagina);
    if (pagina === 2) return { items: [], totalPaginas: 4, totalResultados: 80 };
    const base = (pagina - 1) * 20;
    return {
      items: Array.from({ length: 20 }, (_, i) => t(2000 + base + i, dia(base + i))),
      totalPaginas: 4, totalResultados: 80,
    };
  };
  const r = await paginarUltimos({
    page: 2, porPagina: 20, providers: PLAT, hoy: HOY, traerRegional, traerExtras: sinExtras,
  });
  assert.equal(r.items.length, 20, "se cortó en la página vacía");
  assert.ok(pedidas.includes(3), "no pidió la página siguiente a la vacía");
});

// ============================================================================
// 2. Estabilidad: ampliar la ventana no cambia lo ya servido
// ============================================================================

test("EMPATE EN EL BORDE: la página 2 no repite ni saltea", async () => {
  // 🔴 El caso exacto del bug. La página 1 termina en un título del día D. La
  // página 2 de TMDB trae más títulos del MISMO día D, con ids más altos. Con
  // un `sort` por (fecha, id desc) sobre la ventana creciente, esos títulos se
  // colaban ANTES del borde y desplazaban lo ya servido.
  const traerRegional = async (pagina: number) => {
    if (pagina === 1) {
      return {
        // 19 días distintos + el último empatado en el día 19.
        items: [
          ...Array.from({ length: 19 }, (_, i) => t(100 + i, dia(i))),
          t(500, dia(19)),
        ],
        totalPaginas: 2, totalResultados: 40,
      };
    }
    return {
      // Mismo día 19, ids MÁS ALTOS que el borde: el caso que reordenaba.
      items: [
        t(900, dia(19)), t(901, dia(19)),
        ...Array.from({ length: 18 }, (_, i) => t(600 + i, dia(20 + i))),
      ],
      totalPaginas: 2, totalResultados: 40,
    };
  };
  const args = { porPagina: 20, providers: PLAT, hoy: HOY, traerRegional, traerExtras: sinExtras };
  const p1 = (await paginarUltimos({ ...args, page: 1 })).items.map((x) => x.id);
  const p2 = (await paginarUltimos({ ...args, page: 2 })).items.map((x) => x.id);

  assert.equal(p1.length, 20);
  assert.equal(p2.length, 20);
  const juntas = [...p1, ...p2];
  assert.equal(new Set(juntas).size, 40, `hay repetidos entre páginas: ${juntas}`);
  // Y el borde de la página 1 sigue siendo el mismo título.
  assert.equal(p1[19], 500, "el borde de la página 1 se movió al ampliar la ventana");
});

test("concatenar páginas reproduce EXACTAMENTE la clasificación completa", async () => {
  const f = fuente(137);
  const args = {
    porPagina: 20, providers: PLAT, hoy: HOY,
    traerRegional: f.traer, traerExtras: sinExtras,
  };
  const porPaginas: number[] = [];
  for (let p = 1; p <= 7; p++) {
    porPaginas.push(...(await paginarUltimos({ ...args, page: p })).items.map((x) => x.id));
  }
  const completa = (await paginarUltimos({ ...args, page: 1, porPagina: 1000 }))
    .items.map((x) => x.id);
  assert.deepEqual(porPaginas, completa,
    "las páginas no reproducen la clasificación: hay repetidos o salteos");
  assert.equal(porPaginas.length, 137);
});

// ============================================================================
// 3. El suplemento por redes
// ============================================================================

test("un extra sólo entra cuando el stream regional YA PASÓ su fecha", async () => {
  // El extra es viejo (día 40). Con una sola página regional cargada su posición
  // no está decidida: si se lo pusiera al final de la página 1, la página 2 lo
  // volvería a mostrar más abajo. Se retiene hasta que el stream lo alcanza.
  const f = fuente(100);
  const extra = t(7777, dia(40));
  const args = {
    porPagina: 20, providers: PLAT, hoy: HOY,
    traerRegional: f.traer, traerExtras: async () => [extra],
  };
  const p1 = (await paginarUltimos({ ...args, page: 1 })).items.map((x) => x.id);
  assert.equal(p1.includes(7777), false, "metió un extra cuya posición no estaba decidida");

  const todas: number[] = [];
  for (let p = 1; p <= 6; p++) {
    todas.push(...(await paginarUltimos({ ...args, page: p })).items.map((x) => x.id));
  }
  assert.equal(todas.filter((x) => x === 7777).length, 1, "el extra salió repetido o nunca");
  assert.equal(new Set(todas).size, todas.length, "hay repetidos");
});

test("un extra MÁS NUEVO que todo lo regional entra en la primera página", async () => {
  const f = fuente(100);
  const extra = t(7777, dia(0)); // el mismo día que el más nuevo regional
  const nuevo = t(7778, "2026-08-30");
  const r = await paginarUltimos({
    page: 1, porPagina: 20, providers: PLAT, hoy: HOY,
    traerRegional: f.traer, traerExtras: async () => [extra, nuevo],
  });
  assert.ok(r.items.some((x) => x.id === 7778), "un extra recentísimo no apareció");
});

test("al agotarse TMDB entran todos los extras que queden", async () => {
  const f = fuente(25); // 2 páginas
  const extraViejo = t(7777, "2020-01-01");
  const todas: number[] = [];
  for (let p = 1; p <= 3; p++) {
    todas.push(...(await paginarUltimos({
      page: p, porPagina: 20, providers: PLAT, hoy: HOY,
      traerRegional: f.traer, traerExtras: async () => [extraViejo],
    })).items.map((x) => x.id));
  }
  assert.ok(todas.includes(7777), "el extra más viejo que todo el catálogo se perdió");
  assert.equal(new Set(todas).size, todas.length);
});

// ============================================================================
// 4. Costo: pedir la página 2 no repite la 1
// ============================================================================

test("la segunda petición equivalente reutiliza los tramos cacheados", async () => {
  // La fuente inyectada cuenta cuántas veces la llaman. En producción cada
  // página está detrás de su propio `cachedLocIf`, así que "pedir de nuevo" es
  // un HIT; acá se comprueba que la orquestación no pide de más.
  const f = fuente(100);
  const cache = new Map<number, PaginaRegional>();
  const traerRegional = async (pagina: number) => {
    const hit = cache.get(pagina);
    if (hit) return hit;
    const r = await f.traer(pagina);
    cache.set(pagina, r);
    return r;
  };
  const args = { porPagina: 20, providers: PLAT, hoy: HOY, traerRegional, traerExtras: sinExtras };

  await paginarUltimos({ ...args, page: 1 });
  const trasP1 = f.pedidas.length;
  await paginarUltimos({ ...args, page: 2 });
  const trasP2 = f.pedidas.length;
  await paginarUltimos({ ...args, page: 2 });
  const trasRepetir = f.pedidas.length;

  assert.equal(trasP2 - trasP1, 1, "pedir la página 2 costó más de una página nueva");
  assert.equal(trasRepetir, trasP2, "repetir la página 2 volvió a pedir a la fuente");
});

// ============================================================================
// 5. Los filtros se conservan
// ============================================================================

test("se conservan plataformas, ficha completa y fecha argentina", async () => {
  const traerRegional = async () => ({
    items: [
      t(1, dia(1)),
      t(2, dia(2), ["n"]),                        // otra plataforma
      { ...t(3, dia(3)), poster: null },          // ficha incompleta
      { ...t(4, "2026-09-10") },                  // futuro
      { ...t(5, dia(5)), fecha: "" },             // sin fecha
    ],
    totalPaginas: 1, totalResultados: 5,
  });
  const r = await paginarUltimos({
    page: 1, porPagina: 20, providers: PLAT, hoy: HOY, traerRegional, traerExtras: sinExtras,
  });
  assert.deepEqual(r.items.map((x) => x.id), [1]);
});

// ============================================================================
// 6. Sin plataformas válidas no se pide NADA
// ============================================================================
//
// 🔴 EL BUG. `listByCategory` tiene `if (!opts.providers.length) return []` desde
// siempre, pero la rama `tv` de `latestReleases` dejó de pasar por ahí y perdió
// el retorno temprano. Con `providers: []` y una fuente de 50 páginas,
// `paginarUltimos` pedía las 50 y devolvía cero elementos: un barrido completo
// de TMDB para nada.
//
// La segunda mitad es peor: `codesToTmdbIds` descarta los códigos que no conoce,
// así que con un código inválido devuelve `[]` y `discover` sale **sin
// `with_watch_providers`** — o sea, el catálogo entero sin filtrar.

/** Cuenta llamadas a las dos puertas. */
function fuenteContada(total = 1000) {
  const f = fuente(total);
  const llamadas = { regional: 0, extras: 0 };
  return {
    llamadas,
    async traerRegional(pagina: number) { llamadas.regional++; return f.traer(pagina); },
    async traerExtras() { llamadas.extras++; return [t(9999, dia(1))]; },
  };
}

test("sin plataformas: cero llamadas a traerRegional y a traerExtras", async () => {
  const f = fuenteContada();
  const r = await paginarUltimos({
    page: 1, porPagina: 20, providers: [], hoy: HOY,
    traerRegional: f.traerRegional, traerExtras: f.traerExtras,
  });
  assert.deepEqual(r.items, []);
  assert.equal(r.hayMas, false);
  assert.equal(f.llamadas.regional, 0, "pidió páginas regionales sin plataformas");
  assert.equal(f.llamadas.extras, 0, "pidió el suplemento por redes sin plataformas");
});

test("códigos DESCONOCIDOS cuentan como ninguna plataforma", async () => {
  // Sin esto, `codesToTmdbIds` devuelve [] y el discover sale sin filtro de
  // proveedor: TMDB entero, filtrado después por unas plataformas que no existen.
  const f = fuenteContada();
  const r = await paginarUltimos({
    page: 1, porPagina: 20, providers: ["zz", "qq"] as unknown as PlatformCode[], hoy: HOY,
    traerRegional: f.traerRegional, traerExtras: f.traerExtras,
  });
  assert.deepEqual(r.items, []);
  assert.equal(f.llamadas.regional, 0);
  assert.equal(f.llamadas.extras, 0);
});

test("mezcla de códigos válidos e inválidos: se usan SÓLO los válidos", async () => {
  // La orquestación normaliza UNA vez y le pasa la lista limpia a las dos
  // puertas: así el llamador no puede usar la cruda ni por accidente.
  const vistos: PlatformCode[][] = [];
  const r = await paginarUltimos({
    page: 1, porPagina: 20, hoy: HOY,
    providers: ["zz", "d", "qq"] as unknown as PlatformCode[],
    traerRegional: async (_p, providers) => {
      vistos.push(providers);
      return {
        items: [t(1, dia(1), ["d"]), t(2, dia(2), ["n"])],
        totalPaginas: 1, totalResultados: 2,
      };
    },
    traerExtras: async (providers) => { vistos.push(providers); return []; },
  });
  assert.ok(vistos.length >= 1, "no llamó a ninguna puerta");
  for (const v of vistos) assert.deepEqual(v, ["d"], "no normalizó la lista de plataformas");
  assert.deepEqual(r.items.map((x) => x.id), [1], "el filtro final usó códigos inválidos");
});

// ============================================================================
// 7. El contrato de `page`
// ============================================================================
//
// `app/api/latest/route.ts` hacía `Number(...)` sin validar: `page=x` daba NaN,
// la condición de cobertura nunca se cumplía y se recorría `total_pages` entero.

for (const [etiqueta, page] of Object.entries({
  NaN: Number.NaN,
  cero: 0,
  negativa: -5,
  "infinito negativo": Number.NEGATIVE_INFINITY,
})) {
  test(`page ${etiqueta} se normaliza a 1 y no recorre la fuente`, async () => {
    const f = fuenteContada(1000); // 50 páginas
    const r = await paginarUltimos({
      page, porPagina: 20, providers: PLAT, hoy: HOY,
      traerRegional: f.traerRegional, traerExtras: f.traerExtras,
    });
    assert.equal(r.items.length, 20, "no devolvió la página 1");
    assert.equal(f.llamadas.regional, 1, `pidió ${f.llamadas.regional} páginas`);
  });
}

test("page fraccionaria se trunca a entero", async () => {
  const f = fuenteContada(1000);
  const r = await paginarUltimos({
    page: 2.7, porPagina: 20, providers: PLAT, hoy: HOY,
    traerRegional: f.traerRegional, traerExtras: f.traerExtras,
  });
  const p2 = await paginarUltimos({
    page: 2, porPagina: 20, providers: PLAT, hoy: HOY,
    traerRegional: fuenteContada(1000).traerRegional, traerExtras: async () => [t(9999, dia(1))],
  });
  assert.deepEqual(r.items.map((x) => x.id), p2.items.map((x) => x.id));
});

test("page infinita positiva cae a la página 1, como cualquier valor inválido", async () => {
  // El contrato es UNO SOLO: lo que no sea un entero finito >= 1 es la página 1.
  // Tratar +Infinity distinto de NaN sería una regla más para recordar y para
  // equivocarse, y lo que importa —que no entre a la orquestación— se cumple.
  const f = fuenteContada(1000);
  const r = await paginarUltimos({
    page: Number.POSITIVE_INFINITY, porPagina: 20, providers: PLAT, hoy: HOY,
    traerRegional: f.traerRegional, traerExtras: f.traerExtras,
  });
  assert.equal(r.items.length, 20);
  assert.equal(f.llamadas.regional, 1, `pidió ${f.llamadas.regional} páginas`);
});

test("una página ENORME pero finita corta apenas conoce el límite", async () => {
  // 1000 resultados + 1 extra = 51 páginas posibles como mucho. La 9999 es
  // imposible, y para saberlo alcanza con UNA página regional.
  const f = fuenteContada(1000);
  const r = await paginarUltimos({
    page: 9999, porPagina: 20, providers: PLAT, hoy: HOY,
    traerRegional: f.traerRegional, traerExtras: f.traerExtras,
  });
  assert.deepEqual(r.items, []);
  assert.equal(r.hayMas, false);
  assert.equal(f.llamadas.regional, 1,
    `para descartar una página imposible alcanza 1 consulta, hizo ${f.llamadas.regional}`);
});

test("el límite superior NO declara imposible una página que sí puede tener resultados", async () => {
  // 300 resultados + 0 extras = 15 páginas posibles. La 15 tiene que intentarse.
  const f = fuente(300);
  const r = await paginarUltimos({
    page: 15, porPagina: 20, providers: PLAT, hoy: HOY,
    traerRegional: f.traer, traerExtras: sinExtras,
  });
  assert.equal(r.items.length, 20, "descartó una página que sí tenía resultados");
});

test("los extras cuentan para el límite superior", async () => {
  // 20 resultados regionales (1 página) + 5 extras = 25 títulos = 2 páginas.
  const extras = Array.from({ length: 5 }, (_, i) => t(8000 + i, dia(50 + i)));
  const f = fuente(20);
  const r = await paginarUltimos({
    page: 2, porPagina: 20, providers: PLAT, hoy: HOY,
    traerRegional: f.traer, traerExtras: async () => extras,
  });
  assert.equal(r.items.length, 5, "los extras no entraron en la página 2");
});
