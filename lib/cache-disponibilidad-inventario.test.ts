// Inventario de cachés exteriores que pueden congelar disponibilidad incompleta.
//
// 🔴 POR QUÉ HACE FALTA UN INVENTARIO Y NO UNA LISTA DE TRES. La primera versión
// cubrió card, Home y "Últimos lanzamientos" —las que se habían nombrado— y dio
// el requisito por resuelto. Quedaban afuera `search()` (1 h), `popularBlock()`
// del Top (24 h) y el riel de recomendaciones (6 h), que cachean títulos
// enriquecidos exactamente igual. Este archivo obliga a clasificar CADA llamada
// a `cachedLoc`/`cachedLocIf`: una superficie nueva no compila el test hasta que
// alguien decida si necesita el contexto o explique por qué no.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");

function codigo(rel: string): string {
  return fs.readFileSync(path.join(raiz, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Todo lo que termina llamando a `disponibilidadDe`, directa o indirectamente. */
const ENRIQUECEN = [
  "toUITitle", "enrichRaw", "cardsByIds", "titleCard",
  "listByCategory", "listByCategoryCacheable", "disponibilidadDe",
];

interface Superficie {
  /** Nombre humano. */
  nombre: string;
  archivo: string;
  /** Fragmento único que identifica la llamada al cache. */
  ancla: string;
  ttl: string;
  /** ¿Su contenido incluye títulos enriquecidos? */
  enriquece: boolean;
  /** Si no enriquece: por qué. */
  motivo?: string;
}

/**
 * EL INVENTARIO. Una fila por cada `cachedLoc`/`cachedLocIf` del proyecto.
 *
 * `enriquece: true` obliga a que esa superficie abra el contexto de fallos.
 * `enriquece: false` obliga a un motivo escrito.
 */
const SUPERFICIES: Superficie[] = [
  // --- Cachean títulos enriquecidos: NECESITAN el contexto -------------------
  {
    nombre: "card de un título (cardsByIds)", archivo: "lib/enrich.ts",
    ancla: "cachedLocIf(claveCard(", ttl: "TTL.catalog (24 h)", enriquece: true,
  },
  {
    nombre: "búsqueda", archivo: "lib/enrich.ts",
    ancla: "claveSearch(q.toLowerCase()", ttl: "TTL.search (1 h)", enriquece: true,
  },
  {
    nombre: "últimos · página regional", archivo: "lib/enrich.ts",
    ancla: "`reg:p${pagina}`", ttl: "TTL.providers (8 h)", enriquece: true,
  },
  {
    nombre: "últimos · suplemento por redes", archivo: "lib/enrich.ts",
    ancla: 'claveUltimosSeries(hoy, orden, "red"', ttl: "TTL.providers (8 h)", enriquece: true,
  },
  {
    nombre: "payload del Home", archivo: "lib/home.ts",
    ancla: "cachedLocIf(", ttl: "TTL.home (6 h)", enriquece: true,
  },
  {
    nombre: "Top por popularidad", archivo: "lib/top.ts",
    ancla: "cachedLocIf(claveTopPop(", ttl: "TTL.catalog (24 h)", enriquece: true,
  },
  {
    nombre: "riel Elegidas para vos", archivo: "lib/reco.ts",
    ancla: "cachedLocIf(clv, TTL.reco", ttl: "TTL.reco (6 h)", enriquece: true,
  },

  // --- NO cachean títulos enriquecidos: no necesitan el contexto -------------
  {
    nombre: "actores populares", archivo: "lib/enrich.ts",
    ancla: "cachedLocIf(clavePeoplePopular(", ttl: "TTL.providers (8 h)", enriquece: false,
    motivo: "guarda personas; sus `known_for` son crudos de TMDB y NO pasan por "
      + "`toUITitle`, así que no hay resolución de disponibilidad que pueda fallar",
  },
  {
    nombre: "recomendados del mismo título", archivo: "lib/reco.ts",
    ancla: "cachedLocIf(claveRecoMismo(", ttl: "TTL.catalog (24 h)", enriquece: false,
    motivo: "guarda los `recommendations` CRUDOS que vienen dentro de titleDetails, "
      + "sin enriquecer: el enriquecido pasa después, ya fuera de esta caché",
  },
  {
    nombre: "perfil de un título", archivo: "lib/reco.ts",
    ancla: "cachedLocIf(claveRecoPerfil(", ttl: "TTL.catalog (24 h)", enriquece: false,
    motivo: "guarda keywords y géneros para puntuar, no títulos ni plataformas",
  },
  {
    nombre: "cruce de recomendaciones", archivo: "lib/reco.ts",
    ancla: "cachedLocIf(", ttl: "TTL.catalog (24 h)", enriquece: false,
    motivo: "guarda candidatos CRUDOS de discover; el enriquecido y su filtro por "
      + "plataformas ocurren después, fuera de la caché",
  },
  {
    nombre: "pool de discover por plataforma", archivo: "lib/pools.ts",
    ancla: "cachedLocIf(clavePool(", ttl: "TTL.pool (30 h)", enriquece: false,
    motivo: "guarda RawTitle sin `providersOf`: es justamente el diseño del pool, "
      + "enriquecer sólo lo que se va a mostrar (ver el Home Composer)",
  },
  {
    nombre: "pool combinado de miniseries", archivo: "lib/pools.ts",
    ancla: "claveCombinada(opts.tipo", ttl: "TTL.pool (30 h)", enriquece: false,
    motivo: "ídem: candidatos crudos, sin resolución de disponibilidad adentro",
  },
];

// ============================================================================
// El inventario cierra
// ============================================================================

/** Todas las llamadas a cachedLoc/cachedLocIf del proyecto, por archivo. */
function llamadasCache(): { archivo: string; total: number }[] {
  const out: { archivo: string; total: number }[] = [];
  const rec = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { rec(p); continue; }
      if (!/\.ts$/.test(e.name) || /\.test\.ts$/.test(e.name)) continue;
      const rel = path.relative(raiz, p).split(path.sep).join("/");
      const n = (codigo(rel).match(/\bcachedLoc(?:If)?\s*\(/g) ?? []).length;
      if (n) out.push({ archivo: rel, total: n });
    }
  };
  rec(path.join(raiz, "lib"));
  return out;
}

test("el inventario cubre TODAS las llamadas a cachedLoc del proyecto", () => {
  const enDisco = llamadasCache();
  const porArchivo = new Map<string, number>();
  for (const s of SUPERFICIES) porArchivo.set(s.archivo, (porArchivo.get(s.archivo) ?? 0) + 1);

  const faltantes: string[] = [];
  for (const { archivo, total } of enDisco) {
    const declaradas = porArchivo.get(archivo) ?? 0;
    if (declaradas !== total) {
      faltantes.push(`${archivo}: ${total} llamadas, ${declaradas} en el inventario`);
    }
  }
  assert.deepEqual(faltantes, [],
    "hay cachés sin clasificar. Decidí si su contenido lleva títulos enriquecidos "
    + "y agregala al inventario:\n" + faltantes.join("\n"));
});

test("cada ancla del inventario existe de verdad en su archivo", () => {
  // Sin esto, una superficie renombrada quedaría "cubierta" por un ancla muerta.
  for (const s of SUPERFICIES) {
    assert.ok(codigo(s.archivo).includes(s.ancla),
      `${s.nombre}: el ancla "${s.ancla}" ya no está en ${s.archivo}`);
  }
});

test("las que NO enriquecen tienen un motivo escrito", () => {
  for (const s of SUPERFICIES.filter((x) => !x.enriquece)) {
    assert.ok((s.motivo ?? "").length > 40, `${s.nombre}: el motivo no explica nada`);
  }
});

test("toda superficie con TTL tiene el TTL declarado", () => {
  for (const s of SUPERFICIES) assert.match(s.ttl, /TTL\.\w+/, `${s.nombre}: falta el TTL`);
});

// ============================================================================
// Las que enriquecen ABREN el contexto
// ============================================================================

test("cada archivo con superficies que enriquecen abre el contexto", () => {
  const archivos = [...new Set(SUPERFICIES.filter((s) => s.enriquece).map((s) => s.archivo))];
  for (const a of archivos) {
    assert.match(codigo(a), /withFallosDisponibilidad\s*\(/,
      `${a} cachea títulos enriquecidos y no abre el contexto de fallos`);
  }
});

test("hay un contexto por cada superficie que enriquece", () => {
  const porArchivo = new Map<string, number>();
  for (const s of SUPERFICIES.filter((x) => x.enriquece)) {
    porArchivo.set(s.archivo, (porArchivo.get(s.archivo) ?? 0) + 1);
  }
  for (const [archivo, esperados] of porArchivo) {
    const hay = (codigo(archivo).match(/withFallosDisponibilidad\s*\(/g) ?? []).length;
    assert.equal(hay, esperados,
      `${archivo}: ${esperados} superficie(s) que enriquecen y ${hay} contexto(s)`);
  }
});

test("los archivos que enriquecen importan la señal", () => {
  for (const s of SUPERFICIES.filter((x) => x.enriquece)) {
    assert.match(codigo(s.archivo), /from "\.\/fallos-disponibilidad"/,
      `${s.archivo} no importa el módulo de la señal`);
  }
});

// --- canarios: el barrido detecta de verdad ---

test("CANARIO: una superficie nueva sin clasificar rompe el inventario", () => {
  const enDisco = llamadasCache();
  const total = enDisco.reduce((a, b) => a + b.total, 0);
  assert.equal(total, SUPERFICIES.length,
    `hay ${total} llamadas a cachedLoc y ${SUPERFICIES.length} filas en el inventario`);
});

test("CANARIO: un ancla inventada no pasa", () => {
  assert.equal(codigo("lib/top.ts").includes("cachedLocIf(claveQueNoExiste("), false);
});
