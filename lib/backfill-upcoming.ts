// La DECISIÓN del backfill de idioma de `upcoming_content`, sin nada de I/O.
//
// Vive separada del script a propósito: es la parte que hay que poder probar con
// respuestas de TMDB controladas, campo por campo y sin red. El script
// (`scripts/backfill-upcoming-idioma.mjs`) hace los pedidos y llama a esto; el
// test (`lib/backfill-upcoming.test.ts`) llama a ESTO MISMO con respuestas
// inventadas. Una función, dos llamadores — que es lo que evita el problema de
// la tanda 1: un test que reimplementa lo que dice probar no prueba nada.
//
// El fallback sale del núcleo compartido, el mismo que usan la app y la Edge
// Function. Acá no hay una segunda implementación del predicado.
import { fusionarPorCampo, type Localizable, NO_LATINO } from "../supabase/functions/_shared/idioma-nucleo.ts";

export type MotivoOmision = "frescura" | "episodio-404" | "vacio";

/** Las tres columnas localizadas, y nada más. */
export interface ColumnasLocalizadas {
  title: string | null;
  overview: string | null;
  episode_name: string | null;
}

export interface FilaGuardada extends ColumnasLocalizadas {
  tmdb_id: number;
  media_type: "movie" | "tv";
  season_number: number | null;
  episode_number: number | null;
}

export interface Episodio { name?: string | null }

export interface EntradaPlan {
  clave: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  antes: ColumnasLocalizadas;
  despues: ColumnasLocalizadas;
  omitidos: Partial<Record<keyof ColumnasLocalizadas, MotivoOmision>>;
  /** Dónde actuó el respaldo. Se informa APARTE del diff: cuando repara bien, el
   *  valor queda igual al guardado y desaparece del diff. */
  fallback: { tituloOSinopsis: boolean; episodio: boolean };
  cambia: (keyof ColumnasLocalizadas)[];
}

const vacio = (s: string | null | undefined) => !(s ?? "").trim();
const igual = (a: string | null | undefined, b: string | null | undefined) => (a ?? "") === (b ?? "");

/** Un nombre de episodio no tiene `original_name` contra el cual comparar: de
 *  las tres señales solo aplican vacío y alfabeto no latino. */
export function episodioRoto(nombre: string | null | undefined): boolean {
  return vacio(nombre) || NO_LATINO.test(nombre ?? "");
}

/**
 * Decide, CAMPO POR CAMPO, qué se escribe y qué se conserva.
 *
 * `epMx`/`epEs` son el episodio pedido por COORDENADAS EXACTAS (season/episode
 * de la fila), nunca `next_episode_to_air`: el backfill corre días después del
 * sync y "el próximo" ya avanzó.
 *
 * Los dos en `null` significan 404 y entonces `episode_name` se conserva —
 * pero `title` y `overview` de esa misma fila siguen siendo elegibles.
 */
export function planificarFila(opts: {
  fila: FilaGuardada;
  mx: Localizable | null;
  es: Localizable | null;
  epMx?: Episodio | null;
  epEs?: Episodio | null;
}): EntradaPlan {
  const { fila, mx, es, epMx = null, epEs = null } = opts;
  const esSerie = fila.media_type === "tv";

  // --- Reparación de título y sinopsis, con el núcleo compartido ------------
  // `fusionarPorCampo` devuelve la MISMA referencia si no mejoró nada: es lo que
  // permite saber si el respaldo actuó de verdad.
  const base: Localizable = mx ?? {};
  const reparado = fusionarPorCampo(base, es);
  const fallbackTitulo = reparado !== base;

  // --- Reparación del nombre del episodio ----------------------------------
  const sinCoordenadas = esSerie && (fila.season_number == null || fila.episode_number == null);
  const ep404 = esSerie && (sinCoordenadas || (!epMx && !epEs));
  const epRoto = episodioRoto(epMx?.name);
  const fallbackEpisodio = esSerie && !ep404 && epRoto && !vacio(epEs?.name);

  const propuesto: ColumnasLocalizadas = {
    title: reparado.title ?? reparado.name ?? null,
    overview: reparado.overview ?? null,
    episode_name: epRoto ? (epEs?.name ?? null) : (epMx?.name ?? null),
  };
  const hoyEs: ColumnasLocalizadas = {
    title: es?.title ?? es?.name ?? null,
    overview: es?.overview ?? null,
    episode_name: epEs?.name ?? null,
  };

  const antes: ColumnasLocalizadas = {
    title: fila.title, overview: fila.overview, episode_name: fila.episode_name,
  };
  const despues: ColumnasLocalizadas = { ...antes };
  const omitidos: EntradaPlan["omitidos"] = {};

  for (const c of ["title", "overview", "episode_name"] as const) {
    // Las películas no tienen episodio: no es una omisión, no aplica.
    if (c === "episode_name" && !esSerie) continue;
    // 404 por coordenadas: se conserva el nombre guardado y se sigue con el resto.
    if (c === "episode_name" && ep404) { omitidos[c] = "episodio-404"; continue; }
    // VACÍO antes que FRESCURA, a propósito. Cuando el valor propuesto viene
    // vacío y además el es-ES de hoy cambió, los dos motivos aplican y el
    // resultado es el mismo —se conserva lo guardado—, pero "vacío" dice algo
    // accionable ("TMDB no tiene sinopsis") y "frescura" mandaría a buscar un
    // cambio de contenido que no existe. El orden solo cambia la ETIQUETA:
    // ninguna de las dos ramas escribe nada.
    if (vacio(propuesto[c]) && !vacio(antes[c])) { omitidos[c] = "vacio"; continue; }
    // FRESCURA: si lo guardado ya no es el es-ES de hoy, la fila cambió por otro
    // motivo y eso está fuera de alcance. Se conserva y se reporta.
    if (!igual(antes[c], hoyEs[c])) { omitidos[c] = "frescura"; continue; }
    if (igual(propuesto[c], antes[c])) continue;
    despues[c] = propuesto[c];
  }

  return {
    clave: `${fila.media_type}:${fila.tmdb_id}`,
    tmdb_id: fila.tmdb_id,
    media_type: fila.media_type,
    antes, despues, omitidos,
    fallback: { tituloOSinopsis: fallbackTitulo, episodio: fallbackEpisodio },
    cambia: (["title", "overview", "episode_name"] as const).filter((c) => !igual(antes[c], despues[c])),
  };
}

/**
 * El payload de la RPC. Describe la fila COMPLETA: en un campo que no cambia,
 * `nuevo_` es igual a `esperado_`.
 *
 * La MISMA función sirve para ida y para vuelta — el rollback pasa `despues`
 * como esperado y `antes` como nuevo. Por eso el estado posterior nunca se
 * recalcula pidiéndoselo otra vez a TMDB: sale del snapshot.
 */
export function filaDePayload(e: EntradaPlan, direccion: "aplicar" | "revertir") {
  const de = direccion === "aplicar" ? e.antes : e.despues;
  const a = direccion === "aplicar" ? e.despues : e.antes;
  return {
    tmdb_id: e.tmdb_id,
    media_type: e.media_type,
    esperado_title: de.title,
    esperado_overview: de.overview,
    esperado_episode_name: de.episode_name,
    nuevo_title: a.title,
    nuevo_overview: a.overview,
    nuevo_episode_name: a.episode_name,
  };
}

// ============================================================================
// VALIDACIÓN DE UN SNAPSHOT
// ============================================================================
// Un snapshot no es un objeto en memoria: es un archivo que estuvo en disco
// mientras alguien lo revisaba, y que se le pasa a una función que ESCRIBE. Se
// valida antes de que su contenido llegue a la base.
//
// El chequeo que más importa es el de DESTINO: un snapshot del espejo aplicado a
// la tabla real —o al revés— escribiría valores que nadie revisó para ese
// destino, y encima con el bloqueo optimista pasando, porque las filas del
// espejo son copia de las reales.

export interface DestinoSnapshot {
  tabla: string;
  idioma: string;
}

export function validarSnapshot(doc: unknown, destino: DestinoSnapshot): string[] {
  const errores: string[] = [];
  const d = doc as {
    tabla?: unknown; idioma_destino?: unknown; entradas?: unknown;
    filas?: unknown; filas_que_cambian?: unknown; campos_que_cambian?: unknown;
  } | null;

  if (!d || typeof d !== "object") return ["no es un objeto JSON"];
  if (d.tabla !== destino.tabla) {
    errores.push(`destino equivocado: el snapshot es de \`${String(d.tabla)}\` y se apunta a \`${destino.tabla}\``);
  }
  if (d.idioma_destino !== destino.idioma) {
    errores.push(`idioma equivocado: el snapshot es de \`${String(d.idioma_destino)}\` y se pidió \`${destino.idioma}\``);
  }
  if (!Array.isArray(d.entradas)) errores.push("no tiene `entradas`");
  if (errores.length) return errores;

  const entradas = d.entradas as EntradaPlan[];
  const vistas = new Set<string>();
  for (const [i, e] of entradas.entries()) {
    const donde = `entradas[${i}] (${e?.clave ?? "sin clave"})`;
    if (typeof e?.tmdb_id !== "number") errores.push(`${donde}: tmdb_id no es número`);
    if (e?.media_type !== "movie" && e?.media_type !== "tv") errores.push(`${donde}: media_type inválido`);
    if (e?.clave !== `${e?.media_type}:${e?.tmdb_id}`) errores.push(`${donde}: la clave no coincide con media_type:tmdb_id`);
    if (vistas.has(e?.clave)) errores.push(`${donde}: clave repetida`);
    vistas.add(e?.clave);

    for (const lado of ["antes", "despues"] as const) {
      const o = e?.[lado] as unknown as Record<string, unknown> | undefined;
      if (!o || typeof o !== "object") { errores.push(`${donde}: falta \`${lado}\``); continue; }
      for (const c of ["title", "overview", "episode_name"] as const) {
        if (!(c in o)) errores.push(`${donde}.${lado}: falta la columna \`${c}\``);
      }
    }

    if (!Array.isArray(e?.cambia)) { errores.push(`${donde}: \`cambia\` no es un array`); continue; }
    // `cambia` decide cuántas filas se le declaran a la RPC como esperadas: si
    // no describe lo que de verdad difiere entre antes y después, el conteo
    // miente y el bloqueo optimista aborta —o peor, no aborta—.
    const real = (["title", "overview", "episode_name"] as const)
      .filter((c) => e.antes?.[c] !== e.despues?.[c]);
    if ([...real].sort().join(",") !== [...e.cambia].sort().join(",")) {
      errores.push(`${donde}: \`cambia\` dice [${e.cambia}] pero antes/después difieren en [${real}]`);
    }
  }

  if (d.filas !== entradas.length) errores.push(`\`filas\` (${String(d.filas)}) != entradas (${entradas.length})`);
  const cambian = entradas.filter((e) => e.cambia?.length).length;
  if (d.filas_que_cambian !== cambian) errores.push(`\`filas_que_cambian\` (${String(d.filas_que_cambian)}) != ${cambian}`);
  const campos = entradas.reduce((a, e) => a + (e.cambia?.length ?? 0), 0);
  if (d.campos_que_cambian !== campos) errores.push(`\`campos_que_cambian\` (${String(d.campos_que_cambian)}) != ${campos}`);

  return errores;
}
