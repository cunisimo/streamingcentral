// Estado persistente del mantenimiento de la ruleta.
//
// Un solo archivo (`data/ruleta-estado.json`) guarda lo que ya se sabe de cada
// título y CUÁNDO se supo. Es lo que permite no volver a preguntarle a TMDB lo
// que ya respondió: metadatos, disponibilidad con su fecha, sagas resueltas y
// títulos descartados con su motivo.
//
// El estado se escribe UNA vez, al final de una corrida completa, y de forma
// atómica (archivo temporal + rename). Mientras la corrida avanza, cada
// operación terminada se agrega a un DIARIO (`data/ruleta-progreso.jsonl`, una
// línea por operación, escrita al instante). Si la corrida se corta —por
// presupuesto, por un error o con Ctrl+C— el estado queda intacto y el diario
// conserva lo hecho: la próxima corrida lo relee y no repite esas consultas.
//
// La primera vez no hay estado: se arma desde los archivos que ya existen
// (`pool-ruleta.json`, `copy-ruleta.json`, `colecciones-ruleta.json`) sin
// consultar TMDB. Ver `migrarDesdeLegado`.

import { readFileSync, writeFileSync, renameSync, existsSync, appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export const VERSION_ESTADO = 1;

export const archivos = (dir) => ({
  estado: join(dir, "ruleta-estado.json"),
  diario: join(dir, "ruleta-progreso.jsonl"),
  pool: join(dir, "pool-ruleta.json"),
  copy: join(dir, "copy-ruleta.json"),
  colecciones: join(dir, "colecciones-ruleta.json"),
  contexto: join(dir, "contexto-ruleta.json"),
});

const leerJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const leerJsonSiExiste = (p) => (existsSync(p) ? leerJson(p) : null);

/** Escritura atómica: o queda el archivo completo nuevo, o el anterior. */
export function escribirAtomico(ruta, contenido) {
  const tmp = `${ruta}.tmp-${process.pid}`;
  writeFileSync(tmp, contenido, "utf8");
  renameSync(tmp, ruta);
}

/**
 * Arma el estado inicial desde los archivos del pipeline anterior.
 *
 * Fechas: la disponibilidad y los metadatos valen desde `pool.generated_at`
 * (es cuando se consultaron). Las sagas valen desde `colecciones.fetched_at`.
 * Ninguna fecha se inventa: si falta, queda `null` y cuenta como vencida.
 */
export function migrarDesdeLegado({ pool, copy, colecciones }) {
  const desde = pool?.generated_at ?? null;
  const conTexto = new Set((copy?.rows ?? []).filter((r) => r.conoce).map((r) => r.tmdb_id));
  const filasCol = new Map((colecciones?.rows ?? []).map((r) => [r.tmdb_id, r]));
  const colAt = colecciones?.fetched_at ?? null;

  const titulos = {};
  for (const t of pool?.titles ?? []) {
    const c = filasCol.get(t.tmdb_id);
    titulos[t.tmdb_id] = {
      ...t,
      con_texto: conTexto.has(t.tmdb_id),
      meta_at: desde,
      disp_at: desde,
      // undefined = nunca se averiguó; null = se averiguó y no tiene saga.
      coleccion: c ? (c.collection_id ? { id: c.collection_id, name: c.collection_name } : null) : undefined,
      es_secuela: c ? !!c.es_secuela : null,
      coleccion_at: c ? colAt : null,
    };
  }

  // Sagas ya procesadas. El pipeline anterior no guardaba las partes de cada
  // colección, sólo cuál de los títulos del pool era la primera. Alcanza para
  // decidir sin consultar si un título NUEVO es secuela (ver `esSecuelaInferida`).
  const sagas = {};
  for (const r of colecciones?.rows ?? []) {
    if (!r.collection_id) continue;
    const s = (sagas[r.collection_id] ??= { name: r.collection_name, miembros: [], primera: null, at: colAt });
    s.miembros.push({ id: r.tmdb_id, year: r.year, es_secuela: !!r.es_secuela });
    if (!r.es_secuela) s.primera = { id: r.tmdb_id, year: r.year };
  }

  return {
    version: VERSION_ESTADO,
    region: pool?.region ?? "AR",
    migrado_de_legado: { pool_generated_at: desde, colecciones_fetched_at: colAt },
    titulos,
    sagas,
    descartados: {},
    descubrimiento: null,
  };
}

export function cargarEstado(dir) {
  const a = archivos(dir);
  const guardado = leerJsonSiExiste(a.estado);
  if (guardado) {
    if (guardado.version !== VERSION_ESTADO) throw new Error(`estado versión ${guardado.version}, se esperaba ${VERSION_ESTADO}`);
    return { estado: guardado, origen: "estado" };
  }
  const pool = leerJsonSiExiste(a.pool);
  if (!pool) throw new Error(`no hay ${a.estado} ni ${a.pool}: no hay de dónde partir`);
  return {
    estado: migrarDesdeLegado({ pool, copy: leerJsonSiExiste(a.copy), colecciones: leerJsonSiExiste(a.colecciones) }),
    origen: "legado",
  };
}

// --- Diario -----------------------------------------------------------------

export function leerDiario(dir) {
  const p = archivos(dir).diario;
  if (!existsSync(p)) return new Map();
  const m = new Map();
  for (const linea of readFileSync(p, "utf8").split("\n")) {
    if (!linea.trim()) continue;
    try {
      const e = JSON.parse(linea);
      m.set(e.k, e.r);
    } catch {
      // Una línea a medio escribir (corte en seco): se ignora y esa operación
      // se repite. Es la única que puede repetirse.
    }
  }
  return m;
}

export function crearDiario(dir, previo = new Map()) {
  const p = archivos(dir).diario;
  const hechos = new Map(previo);
  return {
    tiene: (k) => hechos.has(k),
    leer: (k) => hechos.get(k),
    anotar(k, r) {
      appendFileSync(p, JSON.stringify({ k, r }) + "\n", "utf8");
      hechos.set(k, r);
    },
    entradas: () => hechos,
    borrar: () => rmSync(p, { force: true }),
  };
}

/** Diario en memoria para los tests y para el plan. */
export function diarioEnMemoria(previo = new Map()) {
  const hechos = new Map(previo);
  return {
    tiene: (k) => hechos.has(k),
    leer: (k) => hechos.get(k),
    anotar: (k, r) => { hechos.set(k, r); },
    entradas: () => hechos,
    borrar: () => hechos.clear(),
  };
}
