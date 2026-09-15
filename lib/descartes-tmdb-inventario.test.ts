// Inventario de TODOS los sitios que atrapan errores (`catch`, `.catch(`,
// `allSettled`) en lib/ y en las rutas API, clasificados.
//
// 🔴 POR QUÉ UN BARRIDO Y NO UNA LISTA DE ONCE. El informe de la Etapa 3
// inventarió once sitios (S1-S11) donde un error de TMDB se convertía en vacío
// o `null`, y la Etapa 3.a los cableó. La auditoría de Codex encontró un
// doceavo (`genreCovers`) que el inventario a mano no tenía. Este archivo
// obliga a clasificar CADA sitio del código que atrapa errores: uno nuevo, o
// uno que cambie de lugar, no compila el test hasta que alguien diga si puede
// tragarse un error de TMDB y, si puede, que registre la causa.
//
// Clases:
//   tmdb-registra   puede recibir un ErrorTmdb y lo registra (registrarDescarteTmdb
//                   en las líneas siguientes, o lo relanza clasificado)
//   tmdb-propaga    catch de una ruta API: responde un estado HTTP; no traga
//                   contenido (la ficha y la búsqueda traducen con respuestaDeErrorTmdb)
//   no-tmdb         lo que atrapa no puede ser un error de TMDB (Supabase, Redis,
//                   JSON del cliente, URL, red del navegador…)
//
// 🔴 ENCONTRAR EL NOMBRE DE LA FUNCIÓN NO DEMUESTRA QUE EL REGISTRO TENGA EFECTO
// (auditoría de Codex sobre 09b9dbe, hallazgo 2): `registrarDescarteTmdb` fuera
// de `withFallosTmdb` era inerte. Y UNA REFERENCIA DOCUMENTAL TAMPOCO (auditoría
// sobre 708bce0, hallazgo 2): "existe un archivo de prueba" o "el wrapper
// aparece en algún lado del archivo" seguían verdes con el contexto quitado o
// con el wrapper fuera de la operación. Cada fila `tmdb-registra` declara su
// EFECTO y trae la EVIDENCIA que lo demuestra, de uno de estos tipos:
//   ejecucion    el sitio se EJECUTA acá, con sus dependencias falladas por un
//                ErrorTmdb, dentro del contexto real (`withFallosTmdb` o
//                `conDescartesRegistrados`), y se comprueba que el contador llega
//                al consumidor (y, fuera de contexto, que deja la línea con su nombre)
//   estructura   el sitio no se puede importar en node (`server-only`, next/server):
//                se verifica sobre el fuente que la APERTURA del contexto (o el
//                wrapper de la ruta) envuelve exactamente la operación que llega
//                al sitio —cadena de llamadas función por función, cuerpo por
//                cuerpo— y que el consumidor lee el contador; con controles
//                MUTADOS (wrapper corrido, apertura quitada, cadena cortada) que
//                hacen fallar el guard
//   banco        además, el recorrido real con dobles de TMDB lo ejercita
//                (docs/medidas/2026-09-14-etapa3a-parcial.json): se lee la evidencia
//                y se comprueba que el escenario que pasa por el sitio salió
//                degradado y sin publicar
// El registrador NUNCA es inerte: fuera de contexto deja una línea estructurada
// (lib/fallos-tmdb.test.ts) y acá se comprueba con el NOMBRE de cada sitio.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { conDescartesRegistrados, withFallosTmdb } from "./fallos-tmdb.ts";
import { ErrorTmdb } from "./tmdb-error.ts";
import { resolverDirectores, resolverPortadas } from "./lotes-tolerantes.ts";
import { enriquecerElegidos, producirBusquedaConFallos } from "./busqueda-enriquecido.ts";
import { resolverConCache, type BackendCache } from "./reparar-y-cachear.ts";
import { settleAll } from "./settle-all.ts";
import { clavePorId, repararLote, repararUno } from "./idioma.ts";
import { resolverDisponibilidad } from "./disponibilidad.ts";
import { resolverTitulo } from "./netflix-resolver.ts";
import type { PlatformCode, UITitle } from "./types.ts";

const raiz = path.resolve(import.meta.dirname, "..");

// ============================================================================
// Fuente sin comentarios, CON los números de línea intactos
// ============================================================================

/**
 * El fuente sin comentarios de bloque ni de línea, conservando cada salto de
 * línea (los números de línea de `sitios()` y los offsets de acá coinciden).
 * El `\r` se quita antes: es terminador de línea para `.` y para `$`, y dejaba
 * pasar comentarios en un checkout con CRLF. Un `//` precedido de `:` (una URL
 * en un string) no es comentario.
 */
function limpio(rel: string): string {
  return fs.readFileSync(path.join(raiz, rel), "utf8").replace(/\r/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[\s;{}(),])\/\/.*$/gm, "$1");
}
const offsetDeLinea = (f: string, linea: number) => f.split("\n").slice(0, linea - 1).reduce((a, l) => a + l.length + 1, 0);
/**
 * Línea (BASADA EN 1, como `sitios()`) del sitio que atrapa: la línea más
 * cercana hacia arriba desde `marcador` (el registro) que cumpla `patron`
 * (por defecto, un `catch`). `findIndex` devuelve base 0: acá se convierte.
 */
function lineaDelCatch(f: string, marcador: string, patron: RegExp = /\bcatch\b/): number {
  const lineas = f.split("\n");
  const i = lineas.findIndex((l) => l.includes(marcador));
  if (i < 0) throw new Error(`no está el marcador ${marcador}`);
  for (let k = i; k >= 0; k--) if (patron.test(lineas[k])) return k + 1;
  throw new Error(`sin ${patron} arriba de ${marcador}`);
}

interface Rango { inicio: number; fin: number }
const dentro = (r: Rango, i: number) => i >= r.inicio && i < r.fin;
const texto = (f: string, r: Rango) => f.slice(r.inicio, r.fin);

/** Índice del cierre que balancea el `(`/`{`/`[` de `f[i]`, saltando strings. */
function cerrar(f: string, i: number): number {
  const pares: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const pila: string[] = [];
  for (let k = i; k < f.length; k++) {
    const c = f[k];
    if (c === '"' || c === "'" || c === "`") {
      for (k++; k < f.length && f[k] !== c; k++) if (f[k] === "\\") k++;
      continue;
    }
    if (pares[c]) pila.push(pares[c]);
    else if (c === ")" || c === "}" || c === "]") {
      if (pila.pop() !== c) throw new Error(`desbalance en ${k}`);
      if (!pila.length) return k;
    }
  }
  throw new Error("sin cierre");
}

/** Todas las llamadas `patron…)` (balanceadas) de un fuente. `patron` termina en `(`. */
function llamadas(f: string, patron: string): Rango[] {
  const out: Rango[] = [];
  for (let i = f.indexOf(patron); i >= 0; i = f.indexOf(patron, i + 1)) {
    out.push({ inicio: i, fin: cerrar(f, i + patron.length - 1) + 1 });
  }
  return out;
}

/**
 * El cuerpo `{…}` de una función declarada como `function NOMBRE(` (con o sin
 * export/async/genéricos) o como `const NOMBRE = async (…) => {`. El tipo de
 * retorno puede traer llaves (`Promise<{ a: b }>`): el cuerpo es la primera
 * llave FUERA de los `<>`, o la que sigue a `=>`.
 */
function cuerpoDe(f: string, nombre: string): Rango {
  const decl = new RegExp(`(?:function\\s+${nombre}\\s*(?:<[^(]*>)?\\(|(?:const|let)\\s+${nombre}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:<[^(]*>)?\\()`);
  const m = decl.exec(f);
  if (!m) throw new Error(`no se encontró la función ${nombre}`);
  const abreParams = m.index + m[0].length - 1;
  let i = cerrar(f, abreParams) + 1;
  let angulos = 0;
  for (; i < f.length; i++) {
    const c = f[i];
    if (c === "=" && f[i + 1] === ">") { i = f.indexOf("{", i); break; }
    if (c === "<") angulos++;
    else if (c === ">") angulos--;
    else if (c === "{" && angulos === 0) break;
  }
  if (i < 0 || f[i] !== "{") throw new Error(`no se encontró el cuerpo de ${nombre}`);
  return { inicio: i, fin: cerrar(f, i) + 1 };
}

// ============================================================================
// Los guards (funciones PURAS sobre el fuente: los controles los mutan)
// ============================================================================

/**
 * RUTA: entre todas las llamadas a `conDescartesRegistrados(` del fuente hay
 * EXACTAMENTE una cuyo callback llama a `operacion(`, y `operacion(` no se llama
 * en ningún otro lugar del archivo (sólo se define). Con esto el wrapper
 * envuelve la operación entera, no una parte ni una llamada de al lado.
 */
function verificarWrapperDeRuta(fuenteRuta: string, operacion: string): Rango {
  const todas = llamadas(fuenteRuta, "conDescartesRegistrados(");
  const conOp = todas.filter((r) => new RegExp(`(?<![\\w.])${operacion}\\(`).test(texto(fuenteRuta, r)));
  assert.equal(conOp.length, 1, `conDescartesRegistrados no envuelve ${operacion}( (envolturas con la operación: ${conOp.length} de ${todas.length})`);
  const fuera = fuenteRuta.slice(0, conOp[0].inicio) + fuenteRuta.slice(conOp[0].fin);
  const sueltas = [...fuera.matchAll(new RegExp(`(?<![\\w.])${operacion}\\(`, "g"))]
    .filter((m) => !/function\s+$/.test(fuera.slice(Math.max(0, m.index - 12), m.index)));
  assert.equal(sueltas.length, 0, `${operacion}( también se llama FUERA del wrapper (${sueltas.length} vez/veces)`);
  return conOp[0];
}

/**
 * CADENA: `a#f1 → b#f2 → …`: el cuerpo de cada función llama a la siguiente, y
 * el cuerpo de la última contiene la línea del sitio.
 */
/**
 * Un enlace de la cadena: `archivo#funcion`, o el mismo con una condición sobre
 * DÓNDE tiene que estar la llamada a la función siguiente dentro del cuerpo:
 * `dentroDe` un bloque `if (…) {` dado, o `fueraDe` todos los bloques dados.
 * Es lo que distingue dos recorridos que pasan por la misma función: en
 * `candidatosDeSuperficie`, con `superficie` se entra al bloque de ejes
 * (`candidatosConEje`) y sin ella (EJES_RIELES=0) se llama a
 * `candidatosDePools` directo, fuera de ese bloque.
 */
type Enlace = string | { ref: string; dentroDe?: string; fueraDe?: string[] };
const refDe = (e: Enlace) => (typeof e === "string" ? e : e.ref);
const nombreDe = (e: Enlace) => refDe(e).split("#")[1];

/** El rango `{…}` del bloque cuyo encabezado (`if (…) {`) es `cabecera`, dentro de `r`. */
function bloque(f: string, r: Rango, cabecera: string): Rango {
  const i = texto(f, r).indexOf(cabecera);
  if (i < 0) throw new Error(`no está el bloque ${cabecera}`);
  const abre = r.inicio + i + cabecera.length - 1;
  return { inicio: abre, fin: cerrar(f, abre) + 1 };
}

function verificarCadena(cadena: Enlace[], sitio: { archivo: string; linea: number }, fuentes: Record<string, string> = {}, recorrido = "") {
  const donde = recorrido ? `recorrido ${recorrido}: ` : "";
  for (let i = 0; i < cadena.length; i++) {
    const enlace = cadena[i];
    const [archivo, nombre] = refDe(enlace).split("#");
    const f = fuentes[archivo] ?? limpio(archivo);
    const r = cuerpoDe(f, nombre);
    if (i + 1 < cadena.length) {
      const siguiente = nombreDe(cadena[i + 1]);
      const llamada = new RegExp(`(?<![\\w.])${siguiente}\\(`, "g");
      const posiciones = [...texto(f, r).matchAll(llamada)].map((m) => r.inicio + m.index);
      if (typeof enlace === "string") {
        assert.ok(posiciones.length > 0, `${donde}${refDe(enlace)} no llama a ${siguiente}(`);
      } else if (enlace.dentroDe) {
        const b = bloque(f, r, enlace.dentroDe);
        assert.ok(posiciones.some((p) => dentro(b, p)), `${donde}${enlace.ref} no llama a ${siguiente}( dentro de \`${enlace.dentroDe}\``);
      } else {
        const bloques = (enlace.fueraDe ?? []).map((c) => bloque(f, r, c));
        assert.ok(posiciones.some((p) => bloques.every((b) => !dentro(b, p))), `${donde}${enlace.ref} no llama a ${siguiente}( fuera de ${(enlace.fueraDe ?? []).map((c) => `\`${c}\``).join(" y ")}`);
      }
    } else {
      assert.equal(archivo, sitio.archivo, `${donde}la cadena termina en ${archivo} y el sitio está en ${sitio.archivo}`);
      assert.ok(dentro(r, offsetDeLinea(f, sitio.linea)), `${donde}${sitio.archivo}:${sitio.linea} no está dentro de ${refDe(enlace)}`);
    }
  }
}

interface Estructura {
  /** `archivo#funcion` que contiene la apertura y el consumo (todo el archivo si se omite). */
  contenedor?: string;
  /** `withFallosDeFuentes(` / `withFallosTmdb(`. */
  apertura: string;
  /** La operación que la apertura envuelve; si se omite, el sitio está inline en el callback. */
  operacion?: string;
  /** De la operación al sitio, función por función (un solo recorrido). */
  cadena?: Enlace[];
  /**
   * Varios recorridos SOPORTADOS que llegan al mismo sitio (por nombre): TODOS
   * tienen que arrancar en la operación y terminar en el sitio. Un recorrido
   * distinto no es un error (EJES_RIELES=0 es deliberado): lo que se exige es
   * que cada uno conserve el contexto abierto por el contenedor.
   */
  recorridos?: Record<string, Enlace[]>;
  /** Cómo el contenedor consume el contador. */
  consumo: RegExp[];
}

/** CONTEXTO: la apertura envuelve lo que llega al sitio y el contenedor consume el contador. */
function verificarContexto(est: Estructura, sitio: { archivo: string; linea: number }, fuentes: Record<string, string> = {}) {
  const archivo = est.contenedor ? est.contenedor.split("#")[0] : sitio.archivo;
  const f = fuentes[archivo] ?? limpio(archivo);
  const rango = est.contenedor ? cuerpoDe(f, est.contenedor.split("#")[1]) : { inicio: 0, fin: f.length };
  const aperturas = llamadas(f, est.apertura).filter((r) => dentro(rango, r.inicio));
  assert.ok(aperturas.length >= 1, `${est.contenedor ?? archivo} no abre ${est.apertura}`);
  if (est.operacion) {
    const conOp = aperturas.filter((r) => new RegExp(`(?<![\\w.])${est.operacion}\\(`).test(texto(f, r)));
    assert.equal(conOp.length, 1, `${est.apertura} no envuelve ${est.operacion}( en ${est.contenedor ?? archivo}`);
    // 🔴 La cadena tiene que ARRANCAR en la operación envuelta y terminar en el
    // sitio, enlace por enlace, aunque cruce archivos. Si arrancara más abajo
    // (auditoría sobre 03ad4b9: la fila de pools declaraba sólo la función del
    // sitio), el wrapper y el sitio se verificarían por separado y un enlace
    // perdido en el medio quedaría verde.
    const recorridos: [string, Enlace[]][] = est.recorridos ? Object.entries(est.recorridos) : [["", est.cadena ?? []]];
    for (const [nombre, cadena] of recorridos) {
      const donde = nombre ? `recorrido ${nombre}: ` : "";
      assert.equal(cadena[0] ? nombreDe(cadena[0]) : undefined, est.operacion, `${donde}la cadena no arranca en ${est.operacion} (arranca en ${cadena[0] ? refDe(cadena[0]) : "nada"})`);
      verificarCadena(cadena, sitio, fuentes, nombre);
    }
  } else {
    assert.equal(archivo, sitio.archivo);
    assert.ok(aperturas.some((r) => dentro(r, offsetDeLinea(f, sitio.linea))), `${sitio.archivo}:${sitio.linea} no está dentro del callback de ${est.apertura}`);
  }
  for (const re of est.consumo) assert.match(texto(f, rango), re, `${est.contenedor ?? archivo} no consume el contador: falta ${re}`);
}

// ============================================================================
// Las ejecuciones (sitios importables): dependencias falladas con un ErrorTmdb
// ============================================================================

const e429 = (p = "/x") => new ErrorTmdb({ estado: 429, clase: "http429", path: p, retryAfterMs: 2000 });
function backend(): BackendCache & { escrituras: number } {
  const datos = new Map<string, unknown>();
  return {
    escrituras: 0,
    async leer(clave: string) { return datos.has(clave) ? datos.get(clave) : null; },
    async escribir(clave: string, valor: unknown) { this.escrituras++; datos.set(clave, valor); },
  } as BackendCache & { escrituras: number };
}
const ui = (id: number, platforms: string[]): UITitle => ({
  id, type: "movie", title: `T${id}`, year: null, runtime: null, poster: null, country: null, genres: [],
  platforms: platforms as UITitle["platforms"], tmdb: 7, hasEditorial: false,
});
const crudo = (o: Record<string, unknown> = {}) => ({ id: 1, title: "Un título", overview: "Una sinopsis.", original_title: "A Title", original_language: "en", ...o });
const silencio = () => {};

interface Ejecucion {
  /** El `sitio` que el código pasa a `registrarDescarteTmdb` (la línea fuera de contexto lo trae). */
  sitio: string;
  /** Corre el sitio con su dependencia caída. Devuelve lo que el consumidor necesita. */
  correr: () => Promise<unknown>;
  /** Cuántos descartes tiene que ver el contexto. */
  descartes?: number;
  /** Cuántas líneas deja SIN contexto (si difiere: parte del recorrido abre su propio contexto). */
  lineasSinContexto?: number;
  /** Lo que el consumidor hizo con eso (no guardar, marcar `fallo`, …). */
  consumidor?: (r: never) => void;
}

const EJECUCIONES = {
  directores: {
    sitio: "directorCards",
    correr: async () => {
      const cache = backend();
      const res = await resolverDirectores({ ids: [1, 2, 3], ttl: 60, cache, pedirDetalle: async (id) => { if (id === 2) throw e429("/person/2"); return { id, name: `D${id}`, profile_path: null }; } });
      return { cache, res };
    },
    consumidor: (r: { cache: { escrituras: number }; res: unknown[] }) => { assert.equal(r.res.length, 2); assert.equal(r.cache.escrituras, 0, "el parcial NO se guarda"); },
  },
  portadas: {
    sitio: "genreCovers",
    correr: async () => {
      const cache = backend();
      const res = await resolverPortadas({ slugs: ["accion", "terror"], ttl: 60, cache, pedirPosters: async (slug) => { if (slug === "terror") throw e429("/discover/terror"); return [`/${slug}.jpg`]; }, img: (p) => p });
      return { cache, res };
    },
    consumidor: (r: { cache: { escrituras: number }; res: Record<string, string | null> }) => { assert.equal(r.res.terror, null); assert.equal(r.cache.escrituras, 0, "el mapa incompleto NO se guarda"); },
  },
  busqueda: {
    sitio: "search:providersOf",
    correr: async () => {
      const cache = backend();
      const elegidos = [1, 2].map((id) => ({ raw: { id }, tipo: "movie" as const }));
      const deps = {
        enriquecer: async (c: { raw: { id: number } }) => { if (c.raw.id === 2) throw e429("/movie/2/watch/providers"); return ui(c.raw.id, ["n"]); },
        sinPlataformas: (c: { raw: { id: number } }) => ui(c.raw.id, []),
        identidadDe: async () => null,
      };
      // La composición real de `search()`: resolverConCache + producirBusquedaConFallos.
      const res = await resolverConCache({ clave: "search:x", ttl: 60, backend: cache, producir: () => producirBusquedaConFallos({ paginas: async () => ({ elegidos, people: [], falloIdioma: false }), ...deps }) });
      // Y el enriquecido suelto, para ver el contador desde afuera (producirBusquedaConFallos abre su propio contexto y lo suma al padre).
      await enriquecerElegidos(elegidos, deps);
      return { cache, res };
    },
    descartes: 2,
    // producirBusquedaConFallos abre su propio contexto (y ahí cuenta y calla): fuera de todo contexto sólo loguea el enriquecido suelto.
    lineasSinContexto: 1,
    consumidor: (r: { cache: { escrituras: number }; res: { degradacion?: { proveedores?: number } } }) => { assert.equal(r.res.degradacion?.proveedores, 1); assert.equal(r.cache.escrituras, 0, "la búsqueda degradada NO se guarda"); },
  },
  settleAll: {
    sitio: "prueba",
    correr: () => settleAll([Promise.resolve(1), Promise.reject(e429())], "prueba", { relanzar: false, log: silencio }),
    consumidor: (r: number[]) => { assert.deepEqual(r, [1]); },
  },
  idiomaLote: {
    sitio: "respaldo-idioma",
    correr: () => repararLote([crudo({ id: 1, title: "런닝맨", original_language: "ko", overview: "" })], async () => { throw e429("/discover?language=es-ES"); }, "test", { clave: clavePorId, activo: true }),
    consumidor: (r: { fallo: boolean }) => { assert.equal(r.fallo, true, "el lote sale marcado: no se cachea"); },
  },
  idiomaUno: {
    sitio: "respaldo-idioma",
    correr: () => repararUno(crudo({ id: 1, title: "런닝맨", original_language: "ko", overview: "" }), async () => { throw e429("/movie/1?language=es-ES"); }, "test", true),
    consumidor: (r: { fallo: boolean }) => { assert.equal(r.fallo, true); },
  },
  disponibilidad: {
    sitio: "disponibilidad:leerDatosTitulo",
    correr: () => resolverDisponibilidad({ tipo: "tv", id: 1, deTmdb: [] as PlatformCode[], hoy: "2026-09-14", leerTopOficial: async () => new Set<string>(), leerDatosTitulo: async () => { throw e429("/tv/1?language=es-ES"); } }),
    consumidor: (r: { fallo: boolean; plataformas: unknown[] }) => { assert.equal(r.fallo, true, "un fallo nunca es una ausencia, y no se cachea"); assert.deepEqual(r.plataformas, []); },
  },
  resolverBuscar: {
    sitio: "netflix-resolver:buscar",
    correr: () => resolverTitulo("Moria", { buscar: async () => { throw e429("/search/tv"); }, enNetflixAR: async () => true }),
    consumidor: (r: { tmdbId: number | null; needsReview: boolean }) => { assert.deepEqual(r, { tmdbId: null, needsReview: true }, "'no sé', no 'no está'"); },
  },
  resolverBuscarReducida: {
    sitio: "netflix-resolver:buscar-reducida",
    correr: () => resolverTitulo("Operation Safed Sagar: The Highest Air Force Mission", {
      buscar: async (consulta) => { if (consulta.includes(":")) return [{ id: 7, title: "Otra cosa" }]; throw e429("/search/tv"); },
      enNetflixAR: async () => false,
    }),
    consumidor: (r: { tmdbId: number | null }) => { assert.equal(r.tmdbId, null); },
  },
} satisfies Record<string, Ejecucion>;
type ClaveEjecucion = keyof typeof EJECUCIONES;

// ============================================================================
// El barrido
// ============================================================================

function archivos(): string[] {
  const out: string[] = [];
  for (const f of fs.readdirSync(path.join(raiz, "lib"))) {
    if (f.endsWith(".ts") && !f.endsWith(".test.ts")) out.push(`lib/${f}`);
  }
  const rutas = (dir: string) => {
    for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      if (e.isDirectory()) rutas(`${dir}/${e.name}`);
      else if (e.name === "route.ts") out.push(`${dir}/${e.name}`);
    }
  };
  rutas("app/api");
  return out.sort();
}

interface Sitio { archivo: string; linea: number; texto: string }
function sitios(): Sitio[] {
  const out: Sitio[] = [];
  for (const rel of archivos()) {
    limpio(rel).split("\n").forEach((l, i) => {
      if (/\bcatch\b/.test(l) || /allSettled\(/.test(l)) out.push({ archivo: rel, linea: i + 1, texto: l.trim() });
    });
  }
  return out;
}

/**
 * Empareja cada sitio con su fila del inventario. Un mismo texto de ancla
 * puede aparecer varias veces en un archivo (`} catch (e) {`): las filas se
 * asignan EN ORDEN de aparición.
 */
function emparejar(): { sitio: Sitio; fila: Fila | null }[] {
  const usadas = new Set<Fila>();
  return sitios().map((sitio) => {
    const fila = INVENTARIO.find((f) => !usadas.has(f) && f.archivo === sitio.archivo && sitio.texto.includes(f.ancla)) ?? null;
    if (fila) usadas.add(fila);
    return { sitio, fila };
  });
}

type Evidencia =
  | { efecto: "contexto"; ejecucion: ClaveEjecucion }
  | { efecto: "contexto"; estructura: Estructura; banco?: "sinUB" | "discover" }
  | { efecto: "ruta"; ruta: string; operacion: string; cadena: string[]; ejecucion?: ClaveEjecucion }
  | { efecto: "observable"; campo: string; funcion: string }
  | { efecto: "relanza" };
type Fila = { archivo: string; ancla: string; motivo?: string } & (
  | ({ clase: "tmdb-registra" } & Evidencia)
  | { clase: "tmdb-propaga" }
  | { clase: "no-tmdb" }
);

const CRON = "app/api/cron/netflix-top10/route.ts";
const RECORDATORIO = "app/api/recordatorio/route.ts";
/** Los dos bloques de `candidatosDeSuperficie` que deciden el recorrido. */
const BLOQUE_EJES = "if (opts.superficie && poolsHabilitados) {";
const BLOQUE_SIN_POOLS = "if (!poolsHabilitados) {";
/** La rama de la página extra con el eje ya resuelto (dentro de BLOQUE_EJES). */
const BLOQUE_EJE_FIJO = "if (opts.ejeFijo) {";
/** En audienceTitles: la adquisición con eje (adentro) vs. las páginas siguientes (afuera). */
const BLOQUE_AUD_POOLS = "if (poolsHabilitados) {";

/** EL INVENTARIO: un ancla (fragmento único de la línea) por sitio, en orden de aparición. */
const INVENTARIO: Fila[] = [
  // --- pueden recibir un ErrorTmdb: registran la causa, con su EFECTO y su EVIDENCIA ---
  { archivo: "lib/enrich.ts", ancla: "providersOf(type, id).catch", clase: "tmdb-registra", efecto: "observable", campo: "degradacion.proveedores", funcion: "detail" },
  { archivo: "lib/enrich.ts", ancla: "pickTrailer((await titleVideos(type, id, lang)).results, lang)).catch", clase: "tmdb-registra", efecto: "observable", campo: "degradacion.trailer", funcion: "detail" },
  // titleCard: el catch está INLINE en el callback de withFallosDeFuentes, y el
  // cachedLocIf de la card no guarda con `fallo` (`if (fallos) fallo = true`).
  { archivo: "lib/enrich.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "contexto", banco: "sinUB",
    estructura: { contenedor: "lib/enrich.ts#titleCard", apertura: "withFallosDeFuentes(", consumo: [/if \(fallos\) fallo = true/, /\(\) => !fallo\)/] } },
  { archivo: "lib/lotes-tolerantes.ts", ancla: "Promise.allSettled(o.ids.map", clase: "tmdb-registra", efecto: "contexto", ejecucion: "directores" },
  { archivo: "lib/lotes-tolerantes.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "contexto", ejecucion: "portadas" },
  { archivo: "lib/busqueda-enriquecido.ts", ancla: "deps.enriquecer(c).then((t) => ({ t, degradado: false })).catch", clase: "tmdb-registra", efecto: "contexto", ejecucion: "busqueda" },
  { archivo: "lib/settle-all.ts", ancla: "Promise.allSettled(tareas)", clase: "tmdb-registra", efecto: "contexto", ejecucion: "settleAll" },
  // pools: el contexto lo abre el Home (por contexto async) y hay VARIOS
  // recorridos soportados desde composeHome que llegan al mismo sitio, todos
  // cruzando archivos (el inventario de call sites de abajo, CALL_SITES, lista
  // cada llamada productiva y a qué recorrido pertenece):
  //   con-ejes            rieles con `superficie`: candidatosDeSuperficie entra al
  //                       bloque de ejes → candidatosConEje → candidatosDePools
  //   sin-ejes            EJES_RIELES=0: home.ts no pasa `superficie` y
  //                       candidatosDeSuperficie llama a candidatosDePools DIRECTO
  //   extra-*-ejeFijo     página extra de genreRail / miniseriesRail con el eje ya
  //                       resuelto: categoryCandidates → candidatosDeSuperficie,
  //                       rama `opts.ejeFijo` → candidatosDePools directo, SIN
  //                       pasar por candidatosConEje
  //   extra-*-sin-ejes    la misma página extra con EJES_RIELES=0: llamada directa
  //   hero                recommendations → tandaAncha → categoryCandidates con
  //                       `superficie: "hero"` (siempre) → candidatosConEje
  //   audiencia-inicial   audienceTitles → candidatosConEje (adquisición)
  //   audiencia-paginas   audienceTitles → candidatosDePools directo (páginas
  //                       siguientes, fuera del bloque de candidatosConEje)
  // Cada enlace se verifica cuerpo por cuerpo. El banco (429 parcial en
  // /discover con EJES_RIELES encendido y en 0; página extra identificada por
  // sus parámetros, con y sin ejes) es evidencia ADICIONAL de algunos de ellos,
  // no de todos: ver `cobertura` en CALL_SITES. Con POOL_CACHE=0 este sitio NO
  // se alcanza (candidatosDeSuperficie y audienceTitles van a `discover` directo
  // y un fallo lo atrapa el `safe()` del Home): queda fuera de estos recorridos.
  { archivo: "lib/pools.ts", ancla: "Promise.allSettled(tareas)", clase: "tmdb-registra", efecto: "contexto", banco: "discover",
    estructura: { contenedor: "lib/home.ts#producirHome", apertura: "withFallosDeFuentes(", operacion: "composeHome",
      recorridos: {
        "con-ejes": ["lib/home.ts#composeHome", { ref: "lib/enrich.ts#candidatosDeSuperficie", dentroDe: BLOQUE_EJES }, "lib/pools.ts#candidatosConEje", "lib/pools.ts#candidatosDePools"],
        "sin-ejes": ["lib/home.ts#composeHome", { ref: "lib/enrich.ts#candidatosDeSuperficie", fueraDe: [BLOQUE_EJES, BLOQUE_SIN_POOLS] }, "lib/pools.ts#candidatosDePools"],
        "extra-genero-ejeFijo": ["lib/home.ts#composeHome", "lib/home.ts#genreRail", "lib/enrich.ts#categoryCandidates", { ref: "lib/enrich.ts#candidatosDeSuperficie", dentroDe: BLOQUE_EJE_FIJO }, "lib/pools.ts#candidatosDePools"],
        "extra-miniseries-ejeFijo": ["lib/home.ts#composeHome", "lib/home.ts#miniseriesRail", "lib/enrich.ts#categoryCandidates", { ref: "lib/enrich.ts#candidatosDeSuperficie", dentroDe: BLOQUE_EJE_FIJO }, "lib/pools.ts#candidatosDePools"],
        "extra-genero-sin-ejes": ["lib/home.ts#composeHome", "lib/home.ts#genreRail", "lib/enrich.ts#categoryCandidates", { ref: "lib/enrich.ts#candidatosDeSuperficie", fueraDe: [BLOQUE_EJES, BLOQUE_SIN_POOLS] }, "lib/pools.ts#candidatosDePools"],
        "extra-miniseries-sin-ejes": ["lib/home.ts#composeHome", "lib/home.ts#miniseriesRail", "lib/enrich.ts#categoryCandidates", { ref: "lib/enrich.ts#candidatosDeSuperficie", fueraDe: [BLOQUE_EJES, BLOQUE_SIN_POOLS] }, "lib/pools.ts#candidatosDePools"],
        "hero": ["lib/home.ts#composeHome", "lib/enrich.ts#recommendations", "lib/enrich.ts#tandaAncha", "lib/enrich.ts#categoryCandidates", { ref: "lib/enrich.ts#candidatosDeSuperficie", dentroDe: BLOQUE_EJES }, "lib/pools.ts#candidatosConEje", "lib/pools.ts#candidatosDePools"],
        "audiencia-inicial": ["lib/home.ts#composeHome", { ref: "lib/enrich.ts#audienceTitles", dentroDe: BLOQUE_AUD_POOLS }, "lib/pools.ts#candidatosConEje", "lib/pools.ts#candidatosDePools"],
        "audiencia-paginas": ["lib/home.ts#composeHome", { ref: "lib/enrich.ts#audienceTitles", fueraDe: [BLOQUE_AUD_POOLS] }, "lib/pools.ts#candidatosDePools"],
      },
      consumo: [/degradado: true/, /fallosTmdb/] } },
  { archivo: "lib/home.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "contexto",
    estructura: { contenedor: "lib/home.ts#producirHome", apertura: "withFallosDeFuentes(", operacion: "composeHome", cadena: ["lib/home.ts#composeHome", "lib/home.ts#safe"], consumo: [/degradado: true/, /fallosTmdb/] } },
  { archivo: "lib/top.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "ruta", ruta: "app/api/top/route.ts", operacion: "buildTop", cadena: ["lib/top.ts#buildTop", "lib/top.ts#safe"] },
  { archivo: "lib/idioma.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "contexto", ejecucion: "idiomaLote" },
  { archivo: "lib/idioma.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "contexto", ejecucion: "idiomaUno" },
  { archivo: "lib/netflix-top10.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "ruta", ruta: CRON, operacion: "ingestLatestWeek", cadena: ["lib/netflix-top10.ts#ingestLatestWeek", "lib/netflix-top10.ts#resolveTitle", "lib/netflix-top10.ts#enNetflixAR"] },
  { archivo: "lib/netflix-resolver.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "ruta", ruta: CRON, operacion: "ingestLatestWeek", cadena: ["lib/netflix-top10.ts#ingestLatestWeek", "lib/netflix-top10.ts#resolveTitle", "lib/netflix-resolver.ts#resolverTitulo"], ejecucion: "resolverBuscar" },
  { archivo: "lib/netflix-resolver.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "ruta", ruta: CRON, operacion: "ingestLatestWeek", cadena: ["lib/netflix-top10.ts#ingestLatestWeek", "lib/netflix-top10.ts#resolveTitle", "lib/netflix-resolver.ts#resolverTitulo"], ejecucion: "resolverBuscarReducida" },
  { archivo: "lib/disponibilidad.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "contexto", ejecucion: "disponibilidad" },
  { archivo: "lib/tmdb.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "relanza", motivo: "es el cliente: clasifica el fetch y relanza ErrorTmdb" },
  { archivo: "lib/tmdb.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "relanza", motivo: "es el cliente: clasifica el cuerpo y relanza ErrorTmdb" },
  { archivo: "lib/tmdb-politica.ts", ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "relanza", motivo: "el bucle decide con la política y relanza" },
  { archivo: RECORDATORIO, ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "ruta", ruta: RECORDATORIO, operacion: "datosDe", cadena: [`${RECORDATORIO}#datosDe`, `${RECORDATORIO}#digitalAR`] },
  { archivo: RECORDATORIO, ancla: "} catch (e) {", clase: "tmdb-registra", efecto: "ruta", ruta: RECORDATORIO, operacion: "datosDe", cadena: [`${RECORDATORIO}#datosDe`] },
  // --- rutas: propagan como estado HTTP --------------------------------------
  { archivo: "app/api/title/[tipo]/[id]/route.ts", ancla: "} catch (e) {", clase: "tmdb-propaga" },
  { archivo: "app/api/search/route.ts", ancla: "} catch (e) {", clase: "tmdb-propaga" },
  ...["admin-search", "audience", "cards", "cron/netflix-top10", "directores", "discover", "genre-covers", "hacete-cargo", "home", "latest", "mas-votados", "miniseries", "person/[id]", "personas", "providers", "recomendaciones", "ruleta", "top", "upcoming", "admin/top", "te-va-a-gustar"]
    .map((r) => ({ archivo: `app/api/${r}/route.ts`, ancla: "} catch (e) {", clase: "tmdb-propaga" as const })),
  { archivo: "lib/cors.ts", ancla: "} catch (error) {", clase: "tmdb-propaga", motivo: "envoltorio de rutas: 500 con CORS" },
  { archivo: "lib/home-servir.ts", ancla: "} catch (error) {", clase: "tmdb-propaga", motivo: "productor rechazado: libera el turno y sirve UB o propaga" },
  // --- no pueden ser errores de TMDB -----------------------------------------
  { archivo: "lib/disponibilidad.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "top oficial: Supabase" },
  { archivo: "lib/disponibilidad.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "top manual: Supabase" },
  { archivo: "lib/curated.ts", ancla: "}).catch((e) => {", clase: "no-tmdb", motivo: "blocklist de un chip: Supabase" },
  { archivo: "lib/top.ts", ancla: "} catch (e) {", clase: "no-tmdb", motivo: "publicaciones manuales: Supabase (segunda aparición)" },
  { archivo: "lib/top-manual.ts", ancla: "} catch (e) {", clase: "no-tmdb", motivo: "Supabase" },
  { archivo: "lib/cache.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/cache.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/cache.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/cache.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/cache.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/escritura-cache.ts", ancla: "} catch (error) {", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno.ts", ancla: "catch", clase: "no-tmdb", motivo: "Redis" },
  { archivo: "lib/turno-memoria.ts", ancla: "catch", clase: "no-tmdb", motivo: "JSON en memoria" },
  { archivo: "lib/supabase.ts", ancla: "catch", clase: "no-tmdb", motivo: "Supabase" },
  { archivo: "lib/supabase.ts", ancla: "catch", clase: "no-tmdb", motivo: "Supabase" },
  { archivo: "lib/supabase.ts", ancla: "catch", clase: "no-tmdb", motivo: "Supabase" },
  { archivo: "lib/admin-auth.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "Supabase auth" },
  { archivo: "lib/admin-auth-nucleo.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "token" },
  { archivo: "lib/api-base.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "URL en el navegador" },
  { archivo: "lib/barra-estado.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "navegador" },
  { archivo: "lib/enlace-oficial.ts", ancla: "catch { return null; }", clase: "no-tmdb", motivo: "new URL()" },
  { archivo: "lib/netflix-top10.ts", ancla: "reader.cancel().catch", clase: "no-tmdb", motivo: "stream del TSV" },
  { archivo: "app/api/admin/top/route.ts", ancla: "catch { return NextResponse.json({ error: \"cuerpo inválido\" }", clase: "no-tmdb", motivo: "JSON del cliente" },
  { archivo: "app/api/admin/top/route.ts", ancla: "} catch (e) {", clase: "tmdb-propaga", motivo: "segundo handler de la ruta de admin (Supabase)" },
  { archivo: "app/api/cuenta/eliminar/route.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "Supabase" },
  { archivo: "app/api/te-va-a-gustar/route.ts", ancla: "} catch {", clase: "no-tmdb", motivo: "JSON del cliente" },
];

const registran = () => emparejar().filter((p): p is { sitio: Sitio; fila: Fila & { clase: "tmdb-registra" } } => p.fila?.clase === "tmdb-registra");
const ventana = (sitio: Sitio, n = 14) => limpio(sitio.archivo).split("\n").slice(sitio.linea - 1, sitio.linea + n).join("\n");

test("cada sitio que atrapa errores está clasificado, y cada fila del inventario corresponde a un sitio", () => {
  const pares = emparejar();
  const sinClasificar = pares.filter((p) => !p.fila).map((p) => p.sitio);
  assert.deepEqual(sinClasificar, [], `sitios sin clasificar: ${JSON.stringify(sinClasificar, null, 1)}`);
  const usadas = new Set(pares.map((p) => p.fila));
  const huerfanas = INVENTARIO.filter((f) => !usadas.has(f));
  assert.deepEqual(huerfanas, [], "filas del inventario sin sitio (ancla muerta o de más)");
});

test("los sitios `tmdb-registra` registran la causa (registrarDescarteTmdb o relanzan un ErrorTmdb) en las 14 líneas siguientes, con el nombre del sitio que la ejecución espera", () => {
  for (const { sitio, fila } of registran()) {
    const v = ventana(sitio);
    assert.match(v, /registrarDescarteTmdb\(|new ErrorTmdb\(|decidir\(e,/, `${sitio.archivo}:${sitio.linea} no registra la causa: ${sitio.texto}`);
    if ("ejecucion" in fila && fila.ejecucion) {
      assert.ok(v.includes(`"${EJECUCIONES[fila.ejecucion].sitio}"`) || v.includes("etiqueta"), `${sitio.archivo}:${sitio.linea} no registra con el nombre "${EJECUCIONES[fila.ejecucion].sitio}"`);
    }
  }
});

// ============================================================================
// EVIDENCIA 1: ejecución — el contador llega al consumidor
// ============================================================================

test("🔴 ejecución: cada sitio importable, con su dependencia caída por TMDB, cuenta en el contexto y el consumidor lo ve", async () => {
  const cubiertos = new Set<ClaveEjecucion>();
  for (const { sitio, fila } of registran()) {
    if (!("ejecucion" in fila) || !fila.ejecucion) continue;
    const ej = EJECUCIONES[fila.ejecucion] as Ejecucion;
    cubiertos.add(fila.ejecucion);
    const { res, fallos } = await withFallosTmdb(ej.correr);
    assert.equal(fallos, ej.descartes ?? 1, `${sitio.archivo}:${sitio.linea} (${fila.ejecucion}): el contexto no vio el descarte`);
    ej.consumidor?.(res as never);
  }
  assert.deepEqual([...cubiertos].sort(), Object.keys(EJECUCIONES).sort(), "toda ejecución declarada está enganchada a una fila");
});

test("🔴 ejecución (rutas): un sitio que llega por conDescartesRegistrados deja UNA línea de resumen con la cuenta", async () => {
  for (const { sitio, fila } of registran()) {
    if (fila.efecto !== "ruta" || !fila.ejecucion) continue;
    const ej = EJECUCIONES[fila.ejecucion] as Ejecucion;
    const lineas: string[] = [];
    await conDescartesRegistrados("cron/netflix-top10", ej.correr, { log: (...a) => { lineas.push(String(a[0])); } });
    assert.deepEqual(lineas, ["[tmdb] cron/netflix-top10: 1 descarte(s) por error de TMDB"], `${sitio.archivo}:${sitio.linea}`);
  }
});

test("CONTROL: fuera de todo contexto, cada sitio ejecutable deja la línea estructurada CON SU NOMBRE (el contador no fue a ningún lado)", async () => {
  const original = console.error;
  const lineas: string[] = [];
  console.error = (...a: unknown[]) => { lineas.push(a.map(String).join(" ")); };
  try {
    for (const [clave, ej] of Object.entries(EJECUCIONES) as [ClaveEjecucion, Ejecucion][]) {
      lineas.length = 0;
      await ej.correr();
      const propias = lineas.filter((l) => l.startsWith("[tmdb] descarte sin contexto"));
      assert.equal(propias.length, ej.lineasSinContexto ?? ej.descartes ?? 1, `${clave}: ${JSON.stringify(lineas)}`);
      for (const l of propias) assert.match(l, new RegExp(`sitio=${ej.sitio.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} clase=http429 estado=429 path=`));
    }
  } finally {
    console.error = original;
  }
});

// ============================================================================
// EVIDENCIA 2: estructura — el wrapper/la apertura envuelve exactamente lo que
// llega al sitio, y el consumidor lee el contador
// ============================================================================

test("🔴 rutas: conDescartesRegistrados envuelve EXACTAMENTE la operación que llega al sitio (y la cadena de llamadas termina en el sitio)", () => {
  for (const { sitio, fila } of registran()) {
    if (fila.efecto !== "ruta") continue;
    const donde = `${sitio.archivo}:${sitio.linea}`;
    try {
      verificarWrapperDeRuta(limpio(fila.ruta), fila.operacion);
      verificarCadena(fila.cadena, sitio);
    } catch (e) {
      throw new Error(`${donde} (ruta ${fila.ruta}): ${(e as Error).message}`);
    }
  }
});

test("🔴 contextos server-only: la apertura envuelve lo que llega al sitio y el contenedor consume el contador", () => {
  for (const { sitio, fila } of registran()) {
    if (fila.efecto !== "contexto" || !("estructura" in fila)) continue;
    try {
      verificarContexto(fila.estructura, sitio);
    } catch (e) {
      throw new Error(`${sitio.archivo}:${sitio.linea}: ${(e as Error).message}`);
    }
  }
});

test("observable: el registro y la marca `degradacion.<campo> = true` están en el MISMO catch de detail(), y la marca viaja en la respuesta", () => {
  const f = limpio("lib/enrich.ts");
  const detalle = cuerpoDe(f, "detail");
  assert.match(texto(f, detalle), /\{ degradacion \}/, "detail() no incluye `degradacion` en lo que devuelve");
  for (const { sitio, fila } of registran()) {
    if (fila.efecto !== "observable") continue;
    const off = offsetDeLinea(f, sitio.linea) + f.split("\n")[sitio.linea - 1].indexOf("catch");
    assert.ok(dentro(detalle, off), `${sitio.archivo}:${sitio.linea} no está en detail()`);
    const cb = llamadas(f, ".catch(").find((r) => dentro(r, off));
    assert.ok(cb, `${sitio.archivo}:${sitio.linea}: no es un .catch(`);
    assert.match(texto(f, cb), /registrarDescarteTmdb\(/);
    assert.match(texto(f, cb), new RegExp(`${fila.campo.replace(".", "\\.")} = true`), `${sitio.archivo}:${sitio.linea}: el catch no marca ${fila.campo}`);
  }
});

test("relanza: el bloque catch relanza (throw dentro del bloque, no en las líneas de al lado)", () => {
  for (const { sitio, fila } of registran()) {
    if (fila.efecto !== "relanza") continue;
    const f = limpio(sitio.archivo);
    const i = f.indexOf("{", offsetDeLinea(f, sitio.linea) + f.split("\n")[sitio.linea - 1].indexOf("catch"));
    assert.match(f.slice(i, cerrar(f, i) + 1), /\bthrow\b/, `${sitio.archivo}:${sitio.linea} dice relanza y no relanza`);
  }
});

// ============================================================================
// EVIDENCIA 3: banco — el recorrido real con dobles de TMDB
// ============================================================================

test("banco: los sitios que sólo se ejercitan con dobles tienen su escenario degradado y sin publicar en la evidencia", () => {
  const ev = JSON.parse(fs.readFileSync(path.join(raiz, "docs/medidas/2026-09-14-etapa3a-parcial.json"), "utf8"));
  for (const { sitio, fila } of registran()) {
    if (fila.efecto !== "contexto" || !("banco" in fila) || !fila.banco) continue;
    // pools: los DOS recorridos (EJES_RIELES encendido y en 0), cada uno con su
    // corrida y sus cachés vaciadas; el banco es evidencia ADICIONAL de la
    // relación estructural que verifica la fila, no un sustituto.
    type Escenario = { http: number; degradado: boolean; parciales429: number; linea: { descartes: number }; escrito: { fresca: number; ub: number } } | undefined;
    const escenarios: [string, Escenario][] = fila.banco === "sinUB"
      ? [["sinUB", ev.despues.sinUB]]
      : [["pools.conEjes (EJES_RIELES=1)", ev.despues.pools?.conEjes], ["pools.sinEjes (EJES_RIELES=0)", ev.despues.pools?.sinEjes]];
    for (const [nombre, esc] of escenarios) {
      assert.ok(esc, `${sitio.archivo}:${sitio.linea}: falta el escenario ${nombre} en la evidencia`);
      assert.equal(esc.http, 200, `${nombre}: http`);
      assert.equal(esc.degradado, true, `${nombre}: el Home no salió degradado`);
      assert.ok(esc.parciales429 > 0, `${nombre}: el doble no devolvió ningún 429`);
      assert.ok(esc.linea.descartes > 0, `${nombre}: la línea [home] no cuenta descartes`);
      assert.equal(esc.escrito.fresca, 0, `${nombre}: se publicó como fresca`);
      assert.equal(esc.escrito.ub, 0, `${nombre}: se publicó como último bueno`);
    }
    if (fila.banco !== "discover") continue;
    // La PÁGINA EXTRA (rama `opts.ejeFijo` con ejes; llamada directa sin ejes):
    // el doble rechazó SÓLO la consulta identificada por sus parámetros, y esa
    // consulta ocurrió (≥ 1 rechazo), produjo exactamente esos descartes, marcó
    // el Home degradado y no escribió fresca ni último bueno.
    type Extra = { valido: boolean; http: number; consulta: { path: string; params: Record<string, string> }; consultas429: number; degradado: boolean; linea: { descartes: number }; escrito: { fresca: number; ub: number } } | undefined;
    const extras: [string, Extra][] = [["paginaExtra.conEjes (rama ejeFijo)", ev.despues.paginaExtra?.conEjes], ["paginaExtra.sinEjes (llamada directa)", ev.despues.paginaExtra?.sinEjes]];
    for (const [nombre, ex] of extras) {
      assert.ok(ex, `${sitio.archivo}:${sitio.linea}: falta el escenario ${nombre} en la evidencia`);
      assert.equal(ex.valido, true, `${nombre}: el banco no pudo identificar la consulta de la página extra`);
      assert.equal(ex.consulta.path, "/discover/movie");
      assert.equal(ex.consulta.params.page, "4", `${nombre}: la consulta identificada no es la página extra`);
      assert.ok(ex.consultas429 >= 1, `${nombre}: la consulta de la página extra no ocurrió`);
      assert.equal(ex.linea.descartes, ex.consultas429, `${nombre}: los descartes contados no son exactamente las consultas rechazadas`);
      assert.equal(ex.http, 200); assert.equal(ex.degradado, true, `${nombre}: el Home no salió degradado`);
      assert.equal(ex.escrito.fresca, 0, `${nombre}: se publicó como fresca`); assert.equal(ex.escrito.ub, 0, `${nombre}: se publicó como último bueno`);
    }
  }
});

// ============================================================================
// CONTROLES MUTADOS: los guards estructurales fallan cuando el wrapper o el
// contexto se quita o se corre
// ============================================================================

test("CONTROL mutado (ruta): wrapper corrido fuera de la operación, operación llamada también fuera, wrapper quitado, cadena cortada", () => {
  const top = limpio("app/api/top/route.ts");
  assert.doesNotThrow(() => verificarWrapperDeRuta(top, "buildTop"), "el fuente real pasa");
  const wrapper = 'conDescartesRegistrados("api/top", () => buildTop(tipo, providers))';
  assert.ok(top.includes(wrapper));
  // 1) el wrapper queda, pero la operación se ejecuta al lado: nada la envuelve.
  assert.throws(() => verificarWrapperDeRuta(top.replace(wrapper, 'conDescartesRegistrados("api/top", async () => null), await buildTop(tipo, providers)'), "buildTop"), /no envuelve buildTop\(/);
  // 2) envuelta Y además llamada fuera (una de las dos no resume).
  assert.throws(() => verificarWrapperDeRuta(top.replace("export const dynamic", "const precalentar = () => buildTop(\"movie\", []);\nexport const dynamic"), "buildTop"), /FUERA del wrapper/);
  // 3) sin wrapper.
  assert.throws(() => verificarWrapperDeRuta(top.replace(wrapper, "buildTop(tipo, providers)"), "buildTop"), /no envuelve buildTop\(/);
  // 4) la cadena se corta: buildTop deja de pasar por safe.
  const topLib = limpio("lib/top.ts");
  const sitio = { archivo: "lib/top.ts", linea: lineaDelCatch(topLib, "registrarDescarteTmdb(e, `top:") };
  assert.doesNotThrow(() => verificarCadena(["lib/top.ts#buildTop", "lib/top.ts#safe"], sitio));
  const buildTop = cuerpoDe(topLib, "buildTop");
  const sinSafe = topLib.slice(0, buildTop.inicio) + texto(topLib, buildTop).replace(/(?<![\w.])safe\(/g, "directo(") + topLib.slice(buildTop.fin);
  assert.throws(() => verificarCadena(["lib/top.ts#buildTop", "lib/top.ts#safe"], sitio, { "lib/top.ts": sinSafe }), /buildTop no llama a safe\(/);
  // 5) la cadena de la ruta cron también: ingestLatestWeek sin resolveTitle.
  const nt = limpio("lib/netflix-top10.ts");
  const ingest = cuerpoDe(nt, "ingestLatestWeek");
  const sinResolver = nt.slice(0, ingest.inicio) + texto(nt, ingest).replace("resolveTitle(", "resolverAparte(") + nt.slice(ingest.fin);
  const sitioNetflix = { archivo: "lib/netflix-top10.ts", linea: lineaDelCatch(nt, 'registrarDescarteTmdb(e, "enNetflixAR")') };
  assert.doesNotThrow(() => verificarCadena(["lib/netflix-top10.ts#ingestLatestWeek", "lib/netflix-top10.ts#resolveTitle", "lib/netflix-top10.ts#enNetflixAR"], sitioNetflix));
  assert.throws(() => verificarCadena(["lib/netflix-top10.ts#ingestLatestWeek", "lib/netflix-top10.ts#resolveTitle", "lib/netflix-top10.ts#enNetflixAR"], sitioNetflix, { "lib/netflix-top10.ts": sinResolver }), /ingestLatestWeek no llama a resolveTitle\(/);
  // 6) recordatorio: datosDe deja de pasar por digitalAR.
  const rec = limpio(RECORDATORIO);
  const datosDe = cuerpoDe(rec, "datosDe");
  const sinDigital = rec.slice(0, datosDe.inicio) + texto(rec, datosDe).replace(/digitalAR\(/g, "fechaFija(") + rec.slice(datosDe.fin);
  const sitioDigital = { archivo: RECORDATORIO, linea: lineaDelCatch(rec, '"recordatorio:digitalAR"') };
  assert.doesNotThrow(() => verificarCadena([`${RECORDATORIO}#datosDe`, `${RECORDATORIO}#digitalAR`], sitioDigital));
  assert.throws(() => verificarCadena([`${RECORDATORIO}#datosDe`, `${RECORDATORIO}#digitalAR`], sitioDigital, { [RECORDATORIO]: sinDigital }), /datosDe no llama a digitalAR\(/);
});

test("CONTROL mutado (contexto): apertura quitada, sitio sacado del callback, operación desenvuelta, consumo quitado", () => {
  const enrich = limpio("lib/enrich.ts");
  const sitio = { archivo: "lib/enrich.ts", linea: lineaDelCatch(enrich, 'registrarDescarteTmdb(e, "titleCard")') };
  const est: Estructura = { contenedor: "lib/enrich.ts#titleCard", apertura: "withFallosDeFuentes(", consumo: [/if \(fallos\) fallo = true/, /\(\) => !fallo\)/] };
  assert.doesNotThrow(() => verificarContexto(est, sitio), "el fuente real pasa");
  const card = cuerpoDe(enrich, "titleCard");
  const mutar = (fn: (cuerpo: string) => string) => ({ "lib/enrich.ts": enrich.slice(0, card.inicio) + fn(texto(enrich, card)) + enrich.slice(card.fin) });
  // 1) sin apertura: el productor corre sin contexto.
  assert.throws(() => verificarContexto(est, sitio, mutar((c) => c.replace("withFallosDeFuentes(", "sinContexto("))), /no abre withFallosDeFuentes\(/);
  // 2) el sitio queda fuera del callback: el catch se muda a después de la apertura.
  assert.throws(() => verificarContexto(est, sitio, mutar((c) => {
    const i = c.indexOf("withFallosDeFuentes(");
    const fin = cerrar(c, i + "withFallosDeFuentes".length) + 1;
    return c.slice(0, i) + "withFallosDeFuentes(async () => 1);\n" + c.slice(i, fin).replace("withFallosDeFuentes(", "(") + c.slice(fin);
  })), /no está dentro del callback/);
  // 3) el consumo se quita: el contador se calcula y no decide nada.
  assert.throws(() => verificarContexto(est, sitio, mutar((c) => c.replace("if (fallos) fallo = true;", ""))), /no consume el contador/);
  // 4) Home: composeHome desenvuelto (la apertura queda, con otra cosa adentro).
  const home = limpio("lib/home.ts");
  const lineaSafe = lineaDelCatch(home, "registrarDescarteTmdb(e, `home:");
  const estHome: Estructura = { contenedor: "lib/home.ts#producirHome", apertura: "withFallosDeFuentes(", operacion: "composeHome", cadena: ["lib/home.ts#composeHome", "lib/home.ts#safe"], consumo: [/degradado: true/, /fallosTmdb/] };
  assert.doesNotThrow(() => verificarContexto(estHome, { archivo: "lib/home.ts", linea: lineaSafe }));
  const desenvuelto = home.replace("() => composeHome({ providers, types }),", "async () => ({ hero: [], rails: [], fallos: 0, degradado: false }),");
  assert.notEqual(desenvuelto, home);
  assert.throws(() => verificarContexto(estHome, { archivo: "lib/home.ts", linea: lineaSafe }, { "lib/home.ts": desenvuelto }), /no envuelve composeHome\(/);
});

// ============================================================================
// INVENTARIO DE CALL SITES que pueden llegar al descarte de pools (auditoría de
// Codex sobre c6b299e). Cada llamada productiva a `candidatosDePools(`,
// `candidatosConEje(` y `categoryCandidates(` (en lib/ y en las rutas API) está
// clasificada: consumidor, si se ejecuta desde composeHome, condición, dónde se
// abre el contexto, cómo llega el descarte al consumidor y qué cobertura tiene.
// Un call site nuevo sin clasificar hace fallar el barrido de abajo.
// ============================================================================

/**
 * Cuatro categorías EXCLUYENTES (auditoría sobre 37f1ca1):
 *   identificada  ejecutada en el banco con la consulta de ESE recorrido
 *                 rechazada y sus descartes contados individualmente
 *   agregada      el recorrido corre en una corrida del banco cuyo descarte
 *                 total se cuenta sin atribución por recorrido (no se sabe si
 *                 un 429 cayó en SU consulta)
 *   estructural   sólo la cadena de llamadas verificada sobre el fuente
 *   inferida      ni ejecutado ni verificado estructuralmente
 */
type Cobertura = "identificada" | "agregada" | "estructural" | "inferida";
const ORDEN_COBERTURA: Cobertura[] = ["identificada", "agregada", "estructural", "inferida"];
/** Una categoría por recorrido (la suma da los nueve, sin contar ninguno dos veces). */
const COBERTURA_RECORRIDOS: Record<string, Cobertura> = {
  "con-ejes": "agregada", "sin-ejes": "agregada", "hero": "agregada", "audiencia-inicial": "agregada",
  "extra-genero-ejeFijo": "identificada", "extra-genero-sin-ejes": "identificada",
  "extra-miniseries-ejeFijo": "estructural", "extra-miniseries-sin-ejes": "estructural", "audiencia-paginas": "estructural",
};
interface CallSite {
  archivo: string;
  funcion: string;
  /** Fragmento único de la línea de la llamada. */
  ancla: string;
  llamada: "candidatosDePools" | "candidatosConEje" | "categoryCandidates";
  consumidor: string;
  desdeComposeHome: boolean;
  condicion: string;
  contexto: string;
  llegada: string;
  /** Recorridos de la fila de pools que pasan por esta llamada (si desdeComposeHome). */
  recorridos?: string[];
  /** Ruta API independiente que también la alcanza (sin contexto abierto). */
  ruta?: string;
  cobertura: Cobertura;
  evidencia: string;
}

const CALL_SITES: CallSite[] = [
  { archivo: "lib/pools.ts", funcion: "candidatosConEje", ancla: "const traer = (r: { receta: Receta; startPage: number }) => candidatosDePools({", llamada: "candidatosDePools",
    consumidor: "toda adquisición con eje (rieles, hero, audiencia): la ventana del eje del día y el suelo `pop`", desdeComposeHome: true, condicion: "ejes activos (superficie presente) y POOL_CACHE≠0",
    contexto: "producirHome (withFallosDeFuentes) — o ninguno desde /api/recomendaciones y /api/audience", llegada: "contador → `degradado: true` → no se publica (cachedIf / UB)",
    recorridos: ["con-ejes", "hero", "audiencia-inicial"], cobertura: "agregada", evidencia: "banco D conEjes: 8 × 429 en /discover (EJES_RIELES=1), 8 descartes, degradado, sin publicar (agregado: no distingue riel/hero/audiencia)" },
  { archivo: "lib/enrich.ts", funcion: "candidatosDeSuperficie", ancla: "const candidatos = await candidatosDePools({", llamada: "candidatosDePools",
    consumidor: "página extra de genreRail / miniseriesRail con el eje ya resuelto (`opts.ejeFijo`)", desdeComposeHome: true, condicion: "ejes activos + el riel no llenó su ventana (armarRiel pide la extra)",
    contexto: "producirHome (withFallosDeFuentes)", llegada: "contador → `degradado: true` → no se publica",
    recorridos: ["extra-genero-ejeFijo", "extra-miniseries-ejeFijo"], cobertura: "identificada", evidencia: "banco E conEjes: 429 sólo en la consulta de la página extra (page=4 de una receta que no pidió la 5), 3 rechazadas = 3 descartes, degradado, sin publicar (riel de género; el de miniseries sólo estructural)" },
  { archivo: "lib/enrich.ts", funcion: "candidatosDeSuperficie", ancla: "const candidatos = await candidatosDePools({\n    tipo: opts.tipo,", llamada: "candidatosDePools",
    consumidor: "rieles y páginas extra sin `superficie` (EJES_RIELES=0)", desdeComposeHome: true, condicion: "EJES_RIELES=0 y POOL_CACHE≠0",
    contexto: "producirHome (withFallosDeFuentes)", llegada: "contador → `degradado: true` → no se publica",
    recorridos: ["sin-ejes", "extra-genero-sin-ejes", "extra-miniseries-sin-ejes"], cobertura: "identificada", evidencia: "banco D sinEjes (7 × 429 parciales) y banco E sinEjes (página extra identificada: 3 = 3), degradado, sin publicar" },
  { archivo: "lib/enrich.ts", funcion: "audienceTitles", ancla: "? await candidatosDePools({ tipo: tp, providers, receta, pages: 1, startPage: pagina })", llamada: "candidatosDePools",
    consumidor: "carruseles de audiencia: páginas siguientes a la adquisición", desdeComposeHome: true, condicion: "POOL_CACHE≠0 y el carrusel no llenó con la primera tanda",
    contexto: "producirHome (withFallosDeFuentes) — o ninguno desde /api/audience", llegada: "contador → `degradado: true` → no se publica",
    recorridos: ["audiencia-paginas"], ruta: "app/api/audience/route.ts", cobertura: "estructural", evidencia: "cadena y bloque verificados sobre el fuente; ningún banco identifica esta consulta (inferido en ejecución)" },
  { archivo: "lib/enrich.ts", funcion: "candidatosDeSuperficie", ancla: "const r = await candidatosConEje({", llamada: "candidatosConEje",
    consumidor: "rieles con `superficie` y el hero (tandaAncha)", desdeComposeHome: true, condicion: "ejes activos (superficie presente, sin ejeFijo) y POOL_CACHE≠0",
    contexto: "producirHome (withFallosDeFuentes) — o ninguno desde /api/recomendaciones", llegada: "contador → `degradado: true` → no se publica",
    recorridos: ["con-ejes", "hero"], ruta: "app/api/recomendaciones/route.ts", cobertura: "agregada", evidencia: "banco D conEjes (agregado; no distingue riel de hero)" },
  { archivo: "lib/enrich.ts", funcion: "audienceTitles", ancla: "const r = await candidatosConEje({", llamada: "candidatosConEje",
    consumidor: "carruseles de audiencia: adquisición con eje", desdeComposeHome: true, condicion: "POOL_CACHE≠0",
    contexto: "producirHome (withFallosDeFuentes) — o ninguno desde /api/audience", llegada: "contador → `degradado: true` → no se publica",
    recorridos: ["audiencia-inicial"], ruta: "app/api/audience/route.ts", cobertura: "agregada", evidencia: "cadena y bloque verificados sobre el fuente; el banco D agrega sin distinguir audiencia (inferido en ejecución)" },
  { archivo: "lib/enrich.ts", funcion: "tandaAncha", ancla: "const crudos = await categoryCandidates({", llamada: "categoryCandidates",
    consumidor: "hero (recommendations con HERO_ANCHO≠0 y sin enriquecido especial)", desdeComposeHome: true, condicion: "HERO_ANCHO≠0; `superficie: \"hero\"` siempre → candidatosConEje",
    contexto: "producirHome (withFallosDeFuentes) — desde /api/recomendaciones NINGUNO: el registro queda fuera de contexto (línea `[tmdb] descarte sin contexto sitio=pool`)", llegada: "Home: contador → `degradado: true`; ruta: sólo la línea de log, la respuesta sale con lo que hay",
    recorridos: ["hero"], ruta: "app/api/recomendaciones/route.ts", cobertura: "agregada", evidencia: "cadena verificada sobre el fuente; la ruta independiente no abre conDescartesRegistrados (envolverla es un cambio productivo, fuera de esta corrección): inferido" },
  { archivo: "lib/home.ts", funcion: "genreRail", ancla: "categoryCandidates({", llamada: "categoryCandidates",
    consumidor: "página extra de un riel de género", desdeComposeHome: true, condicion: "el riel no llenó su ventana; con ejes lleva `ejeFijo`, sin ejes va directo",
    contexto: "producirHome (withFallosDeFuentes)", llegada: "contador → `degradado: true` → no se publica",
    recorridos: ["extra-genero-ejeFijo", "extra-genero-sin-ejes"], cobertura: "identificada", evidencia: "banco E conEjes y sinEjes (with_genres=28)" },
  { archivo: "lib/home.ts", funcion: "miniseriesRail", ancla: "categoryCandidates({", llamada: "categoryCandidates",
    consumidor: "página extra del riel de miniseries", desdeComposeHome: true, condicion: "el riel no llenó su ventana; con ejes `ejeFijo`, sin ejes directo",
    contexto: "producirHome (withFallosDeFuentes)", llegada: "contador → `degradado: true` → no se publica",
    recorridos: ["extra-miniseries-ejeFijo", "extra-miniseries-sin-ejes"], cobertura: "estructural", evidencia: "cadena verificada sobre el fuente; el banco E eligió una receta de /discover/movie (género), no la de miniseries (inferido en ejecución)" },
];

// ----------------------------------------------------------------------------
// DESCUBRIMIENTO de call sites (auditoría de Codex sobre 37f1ca1): función pura
// sobre un mapa `ruta → fuente`, para poder probarla con fuentes inyectados. En
// producción se alimenta con `archivosProductivos()`, que recorre RECURSIVAMENTE
// lib/, app/, components/, hooks/ y supabase/ (.ts .tsx .mts .js .mjs), sin
// tests (*.test.*), sin declaraciones (*.d.ts), sin node_modules ni .next; los
// scripts del banco (scripts/) y docs/ quedan afuera por no ser productivos.
//
// LO QUE GARANTIZA (sobre el fuente sin comentarios):
//   - detecta toda llamada directa con el nombre canónico: `candidatosDePools(`,
//     `candidatosConEje(`, `categoryCandidates(` (no precedida de `.`, `$` ni
//     de `function `);
//   - RECHAZA (hace fallar el inventario, no las clasifica) las formas por las
//     que una llamada podría escapar al nombre canónico:
//       · import/export con alias: `{ candidatosDePools as x }`;
//       · import de namespace o dinámico de los módulos que las definen
//         (`import * as p from "…/pools"`, `import("…/enrich")`);
//       · acceso por miembro: `p.candidatosDePools(`;
//       · desestructuración con renombre: `const { candidatosDePools: x } = …`;
//       · cualquier referencia SIN llamar (pasarla como valor: `f = candidatosDePools`),
//         salvo dentro de un import/export.
// LO QUE NO ES: un parser de TypeScript. Limitaciones estructurales aceptadas:
//   - una aparición dentro de un string o template literal se toma como llamada
//     o referencia (falso positivo: obliga a clasificar o a reescribir);
//   - el acceso computado (`mod["candidatosDePools"]`) y el `require()` no se
//     reconocen (no se usan en este repo: sólo módulos ES con imports estáticos);
//   - un módulo que re-exporte la función con OTRO nombre y otro archivo que
//     llame a ese otro nombre no se ve (el re-export con alias sí se rechaza,
//     así que esa cadena no puede armarse sin fallar acá).
// ----------------------------------------------------------------------------

const NOMBRES_POOLS = ["candidatosDePools", "candidatosConEje", "categoryCandidates"] as const;
type NombrePools = (typeof NOMBRES_POOLS)[number];
const RAICES_PRODUCTIVAS = ["lib", "app", "components", "hooks", "supabase"];
const EXTENSIONES = [".ts", ".tsx", ".mts", ".js", ".mjs"];
const DIRECTORIOS_EXCLUIDOS = new Set(["node_modules", ".next"]);

/** Todos los archivos productivos, recursivamente, desde `raizRepo`. */
function archivosProductivos(raizRepo: string = raiz): string[] {
  const out: string[] = [];
  const recorrer = (rel: string) => {
    const abs = path.join(raizRepo, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const hijo = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!DIRECTORIOS_EXCLUIDOS.has(e.name)) recorrer(hijo); continue; }
      if (!EXTENSIONES.some((x) => e.name.endsWith(x))) continue;
      if (/\.test\.[cm]?[jt]sx?$/.test(e.name) || e.name.endsWith(".d.ts")) continue;
      out.push(hijo);
    }
  };
  for (const r of RAICES_PRODUCTIVAS) recorrer(r);
  return out.sort();
}

/** El fuente sin comentarios (líneas intactas), a partir de un texto en vez de un archivo. */
function limpiarFuente(texto: string): string {
  return texto.replace(/\r/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[\s;{}(),])\/\/.*$/gm, "$1");
}

interface LlamadaDescubierta { archivo: string; linea: number; llamada: NombrePools; texto: string; offset: number }
interface Descubrimiento {
  llamadas: LlamadaDescubierta[];
  /** Formas alternativas de llegar a las funciones: cada una hace fallar el inventario. */
  alternativas: string[];
}

function descubrirCallSites(fuentes: Record<string, string>): Descubrimiento {
  const llamadas: LlamadaDescubierta[] = [];
  const alternativas: string[] = [];
  const nombres = NOMBRES_POOLS.join("|");
  const modulos = "(?:pools|enrich)(?:\\.[mc]?[jt]s)?";
  for (const [archivo, crudo] of Object.entries(fuentes).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const f = limpiarFuente(crudo);
    const lineaDe = (i: number) => f.slice(0, i).split("\n").length;
    const anotar = (i: number, que: string) => alternativas.push(`${archivo}:${lineaDe(i)} ${que}`);
    // Import/export con alias, namespace o dinámico.
    for (const m of f.matchAll(new RegExp(`(?<![\\w.$])(${nombres})\\s+as\\s+\\w+`, "g"))) anotar(m.index, `alias de ${m[1]} (\`${m[0]}\`)`);
    for (const m of f.matchAll(new RegExp(`\\b(?:import|export)\\s*\\*\\s*as\\s+\\w+\\s+from\\s+["'][^"']*\\/${modulos}["']`, "g"))) anotar(m.index, `namespace (\`${m[0]}\`)`);
    for (const m of f.matchAll(new RegExp(`\\bimport\\(\\s*["'][^"']*\\/${modulos}["']\\s*\\)`, "g"))) anotar(m.index, `import dinámico (\`${m[0]}\`)`);
    // Desestructuración con renombre.
    for (const m of f.matchAll(new RegExp(`\\{[^}]*\\b(${nombres})\\s*:\\s*\\w+[^}]*\\}\\s*=`, "g"))) anotar(m.index, `desestructuración con renombre de ${m[1]}`);
    // Acceso por miembro.
    for (const m of f.matchAll(new RegExp(`\\.(${nombres})\\s*\\(`, "g"))) anotar(m.index, `acceso por miembro .${m[1]}(`);
    // Llamadas directas canónicas y referencias sueltas (fuera de import/export).
    const sinImports = f.replace(/\b(?:import|export)\s*(?:\{[^}]*\}|\*\s*as\s+\w+|[\w$]+)?\s*(?:,\s*\{[^}]*\})?\s*from\s+["'][^"']+["'];?/g, (m) => m.replace(/[^\n]/g, " "));
    for (const m of sinImports.matchAll(new RegExp(`(?<![\\w.$])(${nombres})(?![\\w$])`, "g"))) {
      if (/function\s+$/.test(sinImports.slice(Math.max(0, m.index - 12), m.index))) continue;   // la definición
      const resto = sinImports.slice(m.index + m[1].length);
      if (/^\s*\(/.test(resto)) {
        const linea = lineaDe(m.index);
        llamadas.push({ archivo, linea, llamada: m[1] as NombrePools, texto: f.split("\n")[linea - 1].trim(), offset: m.index });
      } else {
        anotar(m.index, `referencia sin llamar a ${m[1]}`);
      }
    }
  }
  return { llamadas, alternativas };
}

/** Los call sites productivos reales (disco), con su línea (base 1). */
function llamadasAPools(): Descubrimiento {
  const fuentes: Record<string, string> = {};
  for (const rel of archivosProductivos()) fuentes[rel] = fs.readFileSync(path.join(raiz, rel), "utf8");
  return descubrirCallSites(fuentes);
}

test("descubrimiento: recorre recursivamente los directorios productivos (subcarpetas de lib/, archivos servidor de app/) y excluye tests, declaraciones, .next, node_modules y scripts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "descubrimiento-"));
  const escribir = (rel: string) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), "export const x = candidatosDePools({});\n"); };
  for (const rel of ["lib/a.ts", "lib/sub/nuevo.ts", "lib/sub/hondo/mas.tsx", "app/api/x/route.ts", "app/servidor.ts", "app/(grupo)/page.tsx", "components/C.tsx", "hooks/h.ts", "supabase/functions/f/index.ts",
    "lib/a.test.ts", "lib/tipos.d.ts", "lib/node_modules/p/i.ts", "app/.next/s.js", "scripts/banco/dobles.mjs", "docs/x.ts", "lib/notas.md"]) escribir(rel);
  const vistos = archivosProductivos(dir);
  assert.deepEqual(vistos, ["app/(grupo)/page.tsx", "app/api/x/route.ts", "app/servidor.ts", "components/C.tsx", "hooks/h.ts", "lib/a.ts", "lib/sub/hondo/mas.tsx", "lib/sub/nuevo.ts", "supabase/functions/f/index.ts"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("🔴 descubrimiento: un call site directo en una subcarpeta de lib/ o en un archivo servidor de app/ ya no escapa", () => {
  const d = descubrirCallSites({
    "lib/sub/nuevo.ts": 'import { candidatosDePools } from "../pools";\nexport const nuevo = () => candidatosDePools({} as never);\n',
    "app/servidor.ts": 'import { candidatosConEje } from "@/lib/pools";\nexport const servidor = async () => {\n  return candidatosConEje({} as never);\n};\n',
    "app/(grupo)/page.tsx": 'import { categoryCandidates } from "@/lib/enrich";\nexport default async function Page() { const c = await categoryCandidates({} as never); return c; }\n',
  });
  assert.deepEqual(d.llamadas.map((l) => `${l.archivo}:${l.linea} ${l.llamada}`), ["app/(grupo)/page.tsx:2 categoryCandidates", "app/servidor.ts:3 candidatosConEje", "lib/sub/nuevo.ts:2 candidatosDePools"]);
  assert.deepEqual(d.alternativas, []);
});

test("🔴 descubrimiento: las importaciones con alias, namespace o dinámicas, el acceso por miembro, el renombre y la referencia sin llamar se RECHAZAN", () => {
  const d = descubrirCallSites({
    "lib/alias.ts": 'import { categoryCandidates as cc } from "./enrich";\nexport const alias = () => cc({} as never);\n',
    "lib/ns.ts": 'import * as pools from "./pools";\nexport const ns = () => pools.candidatosDePools({} as never);\n',
    "lib/dinamico.ts": 'export const din = async () => (await import("./pools")).candidatosConEje({} as never);\n',
    "lib/renombre.ts": 'import * as todo from "@/lib/pools";\nconst { candidatosDePools: traer } = todo;\nexport const r = () => traer({} as never);\n',
    "lib/valor.ts": 'import { candidatosDePools } from "./pools";\nexport const pedir = candidatosDePools;\n',
    "lib/reexport.ts": 'export { candidatosConEje as conEje } from "./pools";\n',
  });
  assert.deepEqual(d.llamadas, [], "ninguna es una llamada canónica");
  assert.deepEqual(d.alternativas, [
    "lib/alias.ts:1 alias de categoryCandidates (`categoryCandidates as cc`)",
    "lib/dinamico.ts:1 import dinámico (`import(\"./pools\")`)",
    "lib/dinamico.ts:1 acceso por miembro .candidatosConEje(",
    "lib/ns.ts:1 namespace (`import * as pools from \"./pools\"`)",
    "lib/ns.ts:2 acceso por miembro .candidatosDePools(",
    "lib/reexport.ts:1 alias de candidatosConEje (`candidatosConEje as conEje`)",
    "lib/renombre.ts:1 namespace (`import * as todo from \"@/lib/pools\"`)",
    "lib/renombre.ts:2 desestructuración con renombre de candidatosDePools",
    "lib/renombre.ts:2 referencia sin llamar a candidatosDePools",
    "lib/valor.ts:2 referencia sin llamar a candidatosDePools",
  ]);
});

test("descubrimiento: la importación canónica, la definición y los comentarios no cuentan; una aparición en un string sí (limitación aceptada)", () => {
  const d = descubrirCallSites({
    "lib/pools.ts": "export async function candidatosDePools(o: unknown) { return o; }\nexport async function candidatosConEje(o: unknown) { return candidatosDePools(o); }\n",
    "lib/uso.ts": 'import {\n  candidatosConEje, candidatosDePools,\n} from "./pools";\n// candidatosDePools( en un comentario\n/* candidatosConEje( en bloque */\nexport const u = () => candidatosConEje({});\nexport const s = "candidatosDePools(";\n',
  });
  assert.deepEqual(d.llamadas.map((l) => `${l.archivo}:${l.linea} ${l.llamada}`), ["lib/pools.ts:2 candidatosDePools", "lib/uso.ts:6 candidatosConEje", "lib/uso.ts:7 candidatosDePools"]);
  assert.deepEqual(d.alternativas, []);
});

test("descubrimiento sobre el repo real: sólo los nueve call sites clasificados, y ninguna importación alternativa", () => {
  const d = llamadasAPools();
  assert.deepEqual(d.alternativas, [], "importaciones alternativas en código productivo");
  assert.equal(d.llamadas.length, CALL_SITES.length);
});

test("🔴 inventario de call sites: cada llamada productiva a candidatosDePools/candidatosConEje/categoryCandidates está clasificada, y cada fila corresponde a una llamada", () => {
  const usadas = new Set<CallSite>();
  const sinClasificar: string[] = [];
  const pares: { sitio: LlamadaDescubierta; fila: CallSite }[] = [];
  const descubierto = llamadasAPools();
  assert.deepEqual(descubierto.alternativas, [], `formas alternativas de llegar a las funciones de pools (alias, namespace, miembro, referencia sin llamar):\n${descubierto.alternativas.join("\n")}`);
  for (const sitio of descubierto.llamadas) {
    const f = limpio(sitio.archivo);
    const fila = CALL_SITES.find((c) => !usadas.has(c) && c.archivo === sitio.archivo && c.llamada === sitio.llamada
      && dentro(cuerpoDe(f, c.funcion), sitio.offset) && f.slice(sitio.offset - 200, sitio.offset + 200).includes(c.ancla.split("\n")[0]));
    if (!fila) { sinClasificar.push(`${sitio.archivo}:${sitio.linea} ${sitio.llamada}( — ${sitio.texto}`); continue; }
    usadas.add(fila); pares.push({ sitio, fila });
  }
  assert.deepEqual(sinClasificar, [], `call sites sin clasificar:\n${sinClasificar.join("\n")}`);
  assert.deepEqual(CALL_SITES.filter((c) => !usadas.has(c)).map((c) => `${c.archivo}#${c.funcion} ${c.llamada}`), [], "filas del inventario de call sites sin llamada (ancla muerta)");
  // Cada call site desde composeHome está en los recorridos que declara, y en el
  // lugar que el recorrido exige (el bloque `dentroDe`/`fueraDe` del enlace).
  const filaPools = INVENTARIO.find((x) => x.archivo === "lib/pools.ts" && x.clase === "tmdb-registra");
  assert.ok(filaPools && filaPools.clase === "tmdb-registra" && filaPools.efecto === "contexto" && "estructura" in filaPools);
  const recorridos = filaPools.estructura.recorridos ?? {};
  for (const { sitio, fila } of pares) {
    if (!fila.desdeComposeHome) continue;
    assert.ok(fila.recorridos?.length, `${sitio.archivo}:${sitio.linea}: desde composeHome sin recorrido declarado`);
    for (const nombre of fila.recorridos) {
      const cadena = recorridos[nombre];
      assert.ok(cadena, `${sitio.archivo}:${sitio.linea}: el recorrido ${nombre} no existe en la fila de pools`);
      const i = cadena.findIndex((e) => refDe(e) === `${fila.archivo}#${fila.funcion}`);
      assert.ok(i >= 0 && i + 1 < cadena.length && nombreDe(cadena[i + 1]) === fila.llamada, `${sitio.archivo}:${sitio.linea}: el recorrido ${nombre} no pasa por ${fila.funcion} → ${fila.llamada}(`);
      const enlace = cadena[i];
      const f = limpio(fila.archivo);
      const cuerpo = cuerpoDe(f, fila.funcion);
      if (typeof enlace !== "string" && enlace.dentroDe) assert.ok(dentro(bloque(f, cuerpo, enlace.dentroDe), sitio.offset), `${sitio.archivo}:${sitio.linea}: el recorrido ${nombre} exige la llamada dentro de \`${enlace.dentroDe}\` y ésta está afuera`);
      if (typeof enlace !== "string" && enlace.fueraDe) assert.ok(enlace.fueraDe.every((c) => !dentro(bloque(f, cuerpo, c), sitio.offset)), `${sitio.archivo}:${sitio.linea}: el recorrido ${nombre} exige la llamada fuera de los bloques y ésta está adentro`);
    }
    if (fila.ruta) assert.match(limpio(fila.ruta), new RegExp(`(?<![\\w.])(recommendations|audienceTitles)\\(`), `${fila.ruta} no llama al consumidor`);
  }
  // Todo recorrido declarado en la fila de pools tiene al menos un call site que lo reclama.
  const reclamados = new Set(CALL_SITES.flatMap((c) => c.recorridos ?? []));
  assert.deepEqual(Object.keys(recorridos).filter((r) => !reclamados.has(r)), [], "recorridos de la fila de pools sin call site");
  // Cobertura: una categoría por recorrido, los nueve, y la de cada call site es
  // la mejor entre sus recorridos (lo que el informe resume).
  assert.deepEqual(Object.keys(COBERTURA_RECORRIDOS).sort(), Object.keys(recorridos).sort(), "cada recorrido tiene exactamente una categoría de cobertura");
  const cuenta = Object.fromEntries(ORDEN_COBERTURA.map((c) => [c, Object.values(COBERTURA_RECORRIDOS).filter((x) => x === c).length]));
  assert.deepEqual(cuenta, { identificada: 2, agregada: 4, estructural: 3, inferida: 0 });
  assert.equal(Object.values(cuenta).reduce((a, b) => a + b, 0), 9);
  for (const c of CALL_SITES) {
    const mejor = ORDEN_COBERTURA.find((k) => (c.recorridos ?? []).some((r) => COBERTURA_RECORRIDOS[r] === k));
    assert.equal(c.cobertura, mejor, `${c.archivo}#${c.funcion} ${c.llamada}: la cobertura declarada no es la mejor de sus recorridos`);
  }
});

test("CONTROL mutado (pools, los nueve recorridos inventariados): cada tipo de rama real se corta por separado y falla SÓLO el recorrido que le corresponde", () => {
  const fila = INVENTARIO.find((f) => f.archivo === "lib/pools.ts" && f.clase === "tmdb-registra");
  assert.ok(fila && fila.clase === "tmdb-registra" && fila.efecto === "contexto" && "estructura" in fila, "la fila de pools declara estructura");
  const est = fila.estructura;
  const todos = Object.keys(est.recorridos ?? {});
  assert.deepEqual(todos, ["con-ejes", "sin-ejes", "extra-genero-ejeFijo", "extra-miniseries-ejeFijo", "extra-genero-sin-ejes", "extra-miniseries-sin-ejes", "hero", "audiencia-inicial", "audiencia-paginas"]);
  const pools = limpio("lib/pools.ts");
  const sitio = { archivo: "lib/pools.ts", linea: lineaDelCatch(pools, 'registrarDescarteTmdb(r.reason, "pool")', /allSettled\(/) };
  assert.doesNotThrow(() => verificarContexto(est, sitio), "el fuente real pasa por los nueve recorridos inventariados");
  const home = limpio("lib/home.ts");
  const enrich = limpio("lib/enrich.ts");
  const solo = (nombres: string[]): Estructura => ({ ...est, recorridos: Object.fromEntries(nombres.map((n) => [n, est.recorridos![n]])) });
  const cortar = (f: string, funcion: string, llamada: string, region?: (r: Rango) => Rango) => {
    const r = region ? region(cuerpoDe(f, funcion)) : cuerpoDe(f, funcion);
    const mutado = f.slice(0, r.inicio) + texto(f, r).replace(new RegExp(`(?<![\\w.])${llamada}\\(`, "g"), `${llamada}Cortada(`) + f.slice(r.fin);
    assert.notEqual(mutado, f, `${funcion} no llamaba a ${llamada}( en esa región — la mutación no muta`);
    return mutado;
  };
  /** El corte `fuentes` tiene que invalidar EXACTAMENTE `caen` (cada uno con su mensaje) y dejar vivos los demás. */
  const esperar = (etiqueta: string, fuentes: Record<string, string>, caen: Record<string, RegExp>) => {
    for (const [nombre, mensaje] of Object.entries(caen)) {
      assert.throws(() => verificarContexto(solo([nombre]), sitio, fuentes), mensaje, `${etiqueta}: ${nombre} tenía que caer`);
    }
    const vivos = todos.filter((n) => !(n in caen));
    assert.doesNotThrow(() => verificarContexto(solo(vivos), sitio, fuentes), `${etiqueta}: ${vivos.join(", ")} tenían que seguir vivos`);
  };
  const superficie = cuerpoDe(enrich, "candidatosDeSuperficie");
  const ejes = bloque(enrich, superficie, BLOQUE_EJES);
  const ejeFijo = bloque(enrich, superficie, BLOQUE_EJE_FIJO);
  const audiencia = cuerpoDe(enrich, "audienceTitles");
  const audPools = bloque(enrich, audiencia, BLOQUE_AUD_POOLS);
  // 1) corte común composeHome → candidatosDeSuperficie: los dos de rieles.
  esperar("composeHome→candidatosDeSuperficie", { "lib/home.ts": cortar(home, "composeHome", "candidatosDeSuperficie") },
    { "con-ejes": /recorrido con-ejes: .*composeHome no llama a candidatosDeSuperficie\(/, "sin-ejes": /recorrido sin-ejes: .*composeHome no llama a candidatosDeSuperficie\(/ });
  // 2) vía candidatosConEje: candidatosConEje → candidatosDePools (traer): con-ejes, hero y audiencia-inicial.
  esperar("candidatosConEje→candidatosDePools", { "lib/pools.ts": cortar(pools, "candidatosConEje", "candidatosDePools") },
    { "con-ejes": /recorrido con-ejes: .*candidatosConEje no llama a candidatosDePools\(/, "hero": /recorrido hero: .*candidatosConEje no llama a candidatosDePools\(/, "audiencia-inicial": /recorrido audiencia-inicial: .*candidatosConEje no llama a candidatosDePools\(/ });
  // 3) directa SIN ejes (fuera del bloque de ejes): sin-ejes y las extras sin ejes.
  esperar("directa sin ejes", { "lib/enrich.ts": cortar(enrich, "candidatosDeSuperficie", "candidatosDePools", () => ({ inicio: ejes.fin, fin: superficie.fin })) },
    { "sin-ejes": /recorrido sin-ejes: .*no llama a candidatosDePools\( fuera de/, "extra-genero-sin-ejes": /recorrido extra-genero-sin-ejes: .*no llama a candidatosDePools\( fuera de/, "extra-miniseries-sin-ejes": /recorrido extra-miniseries-sin-ejes: .*no llama a candidatosDePools\( fuera de/ });
  // 4) directa CON ejeFijo (dentro de `if (opts.ejeFijo) {`): sólo las extras con eje.
  esperar("directa ejeFijo", { "lib/enrich.ts": cortar(enrich, "candidatosDeSuperficie", "candidatosDePools", () => ejeFijo) },
    { "extra-genero-ejeFijo": /recorrido extra-genero-ejeFijo: .*no llama a candidatosDePools\( dentro de `if \(opts\.ejeFijo\) \{`/, "extra-miniseries-ejeFijo": /recorrido extra-miniseries-ejeFijo: .*no llama a candidatosDePools\( dentro de `if \(opts\.ejeFijo\) \{`/ });
  // 5) directa adicional: audienceTitles → candidatosDePools (páginas siguientes).
  esperar("audienceTitles→candidatosDePools", { "lib/enrich.ts": cortar(enrich, "audienceTitles", "candidatosDePools", () => ({ inicio: audPools.fin, fin: audiencia.fin })) },
    { "audiencia-paginas": /recorrido audiencia-paginas: .*audienceTitles no llama a candidatosDePools\( fuera de/ });
  // 6) audienceTitles → candidatosConEje (adquisición).
  esperar("audienceTitles→candidatosConEje", { "lib/enrich.ts": cortar(enrich, "audienceTitles", "candidatosConEje", () => audPools) },
    { "audiencia-inicial": /recorrido audiencia-inicial: .*audienceTitles no llama a candidatosConEje\( dentro de/ });
  // 7) candidatosDeSuperficie → candidatosConEje (dentro del bloque de ejes): con-ejes y hero.
  esperar("candidatosDeSuperficie→candidatosConEje", { "lib/enrich.ts": cortar(enrich, "candidatosDeSuperficie", "candidatosConEje") },
    { "con-ejes": /recorrido con-ejes: .*no llama a candidatosConEje\( dentro de/, "hero": /recorrido hero: .*no llama a candidatosConEje\( dentro de/ });
  // 8) categoryCandidates en cada consumidor: genreRail, miniseriesRail, tandaAncha.
  esperar("genreRail→categoryCandidates", { "lib/home.ts": cortar(home, "genreRail", "categoryCandidates") },
    { "extra-genero-ejeFijo": /recorrido extra-genero-ejeFijo: .*genreRail no llama a categoryCandidates\(/, "extra-genero-sin-ejes": /recorrido extra-genero-sin-ejes: .*genreRail no llama a categoryCandidates\(/ });
  esperar("miniseriesRail→categoryCandidates", { "lib/home.ts": cortar(home, "miniseriesRail", "categoryCandidates") },
    { "extra-miniseries-ejeFijo": /recorrido extra-miniseries-ejeFijo: .*miniseriesRail no llama a categoryCandidates\(/, "extra-miniseries-sin-ejes": /recorrido extra-miniseries-sin-ejes: .*miniseriesRail no llama a categoryCandidates\(/ });
  esperar("tandaAncha→categoryCandidates", { "lib/enrich.ts": cortar(enrich, "tandaAncha", "categoryCandidates") },
    { "hero": /recorrido hero: .*tandaAncha no llama a categoryCandidates\(/ });
  // 9) composeHome → recommendations / audienceTitles / genreRail / miniseriesRail.
  esperar("composeHome→recommendations", { "lib/home.ts": cortar(home, "composeHome", "recommendations") }, { "hero": /recorrido hero: .*composeHome no llama a recommendations\(/ });
  esperar("composeHome→audienceTitles", { "lib/home.ts": cortar(home, "composeHome", "audienceTitles") },
    { "audiencia-inicial": /recorrido audiencia-inicial: .*composeHome no llama a audienceTitles\(/, "audiencia-paginas": /recorrido audiencia-paginas: .*composeHome no llama a audienceTitles\(/ });
  esperar("composeHome→genreRail", { "lib/home.ts": cortar(home, "composeHome", "genreRail") },
    { "extra-genero-ejeFijo": /recorrido extra-genero-ejeFijo: .*composeHome no llama a genreRail\(/, "extra-genero-sin-ejes": /recorrido extra-genero-sin-ejes: .*composeHome no llama a genreRail\(/ });
  // 10) el sitio mudado fuera de candidatosDePools: caen TODOS.
  const sitioAjeno = { archivo: "lib/pools.ts", linea: lineaDelCatch(pools, "export async function candidatosCombinados", /function/) };
  for (const n of todos) assert.throws(() => verificarContexto(solo([n]), sitioAjeno), new RegExp(`recorrido ${n}: .*no está dentro de lib/pools\\.ts#candidatosDePools`));
  // 11) CONTROL del verificador y de las filas anteriores: 03ad4b9 (no arranca en
  //     composeHome), 6ef35c5 (sólo con ejes: no distingue la llamada directa) y
  //     c6b299e (con y sin ejes: no distingue la rama ejeFijo ni audiencia).
  assert.throws(() => verificarContexto({ ...est, recorridos: undefined, cadena: ["lib/pools.ts#candidatosDePools"] }, sitio), /la cadena no arranca en composeHome/);
  const filaDe6ef35c5: Estructura = { ...est, recorridos: undefined, cadena: ["lib/home.ts#composeHome", "lib/enrich.ts#candidatosDeSuperficie", "lib/pools.ts#candidatosConEje", "lib/pools.ts#candidatosDePools"] };
  assert.doesNotThrow(() => verificarContexto(filaDe6ef35c5, sitio, { "lib/enrich.ts": cortar(enrich, "candidatosDeSuperficie", "candidatosDePools", () => ({ inicio: ejes.fin, fin: superficie.fin })) }), "la fila de 6ef35c5 no distingue el recorrido sin ejes");
  const filaDeC6b299e = solo(["con-ejes", "sin-ejes"]);
  assert.doesNotThrow(() => verificarContexto(filaDeC6b299e, sitio, { "lib/enrich.ts": cortar(enrich, "candidatosDeSuperficie", "candidatosDePools", () => ejeFijo) }), "la fila de c6b299e no distingue la rama ejeFijo");
  assert.doesNotThrow(() => verificarContexto(filaDeC6b299e, sitio, { "lib/enrich.ts": cortar(enrich, "audienceTitles", "candidatosDePools", () => ({ inicio: audPools.fin, fin: audiencia.fin })) }), "la fila de c6b299e no distingue las páginas de audiencia");
});

test("el inventario cubre los doce sitios del informe (S1-S11 + genreCovers) y no afirma que sean sólo once", () => {
  const registranArchivos = new Set(INVENTARIO.filter((i) => i.clase === "tmdb-registra").map((i) => i.archivo));
  for (const a of ["lib/home.ts", "lib/settle-all.ts", "lib/enrich.ts", "lib/lotes-tolerantes.ts", "lib/pools.ts", "lib/top.ts", "lib/netflix-top10.ts", "lib/idioma.ts", "lib/busqueda-enriquecido.ts", "lib/disponibilidad.ts", "lib/netflix-resolver.ts", RECORDATORIO]) {
    assert.ok(registranArchivos.has(a), `${a} falta entre los que registran`);
  }
});
