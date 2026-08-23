// "Elegidas para vos" — el único riel personalizado del Home.
//
// QUÉ NO ES: no personaliza el Home. El Home sigue siendo universal y compartido
// (ver la decisión sobre "Ya la vi" en CLAUDE.md). Esto es un riel más, aislado,
// que se pide aparte y que si falla no aparece y no arrastra a nadie.
//
// EL SERVIDOR NO SABE QUIÉN SOS. Las señales y las exclusiones las manda el
// cliente, que es el único que puede leerlas: `votes` y `user_items` tienen RLS
// `auth.uid() = user_id`, así que una lectura del servidor con la anon key
// devuelve cero filas —y encima sin error, en silencio—. Que el servidor sea
// anónimo no es una limitación que haya que sortear: es lo que mantiene el
// historial de cada uno fuera de los logs y del cache compartido.
//
// LOS CUATRO CAMINOS. El riel es UNO SOLO y mixto (películas y series en la
// misma fila, sin toggle), pero TMDB recomienda dentro del mismo tipo: una
// película origina películas y una serie origina series. Así que hay cuatro
// caminos y dos mecanismos:
//
//   película → películas  ┐  `/recommendations` del origen. Es comportamiento
//   serie    → series     ┘  agregado de gente real y NUNCA vino vacío: medido
//                            sobre 72 títulos, incluso con 5 votos (0 de 72).
//
//   película → series     ┐  keywords del origen + géneros mapeados al tipo
//   serie    → películas  ┘  opuesto. Las keywords cruzan tipos de forma nativa
//                            (mismo espacio de ids en TMDB); los géneros NO
//                            —Acción es 28 en película y 10759 en serie— y el
//                            puente es `lib/categories.ts`, el mismo que usan
//                            los rieles de género.
//
// SIN KEYWORDS NO SE CRUZA, y esto es lo más importante de todo el archivo.
// Medido el 2026-08-17 con The Last of Us cruzando a películas: solo por género
// el universo son 2918 títulos (Cadena perpetua, Camp Rock 3, Interstellar), y
// con una keyword son 29 (Marte, El renacido, El amanecer del planeta de los
// simios). Cien veces más grande y sin relación entre sí: eso no es una
// recomendación, es un listado de género. Cuando el origen no tiene ninguna
// keyword —2 de cada 40 títulos del catálogo AR, siempre de pocos votos— ese
// título aporta solo por su mismo tipo.
import "server-only";
import { cached, cachedLoc, cachedLocIf, TTL } from "./cache";
import { claveReco, claveRecoCruce, claveRecoMismo, claveRecoPerfil } from "./claves";
import {
  HUELLA_EN_CLAVES, IDIOMA_BASE, IDIOMA_FALLBACK, anotarLlamadaIdioma,
  claveMixta, clavePorId, metricasIdiomaActuales, repararLote, repararUno,
} from "./idioma";
import { discover, titleDetails, tmdbKeywords, type RawDetail } from "./tmdb";
import { crearSingleFlight } from "./single-flight";
import { enrichRaw } from "./enrich";
import { genreIdsToSlugs, resolveCategory } from "./categories";
import { codesToTmdbIds } from "./providers-ar";
import type { MediaType, PlatformCode, UITitle } from "./types";
import type { RawTitle } from "./tmdb";
import { elegirOrigenes, mezclarTipos, type Senal } from "./reco-mezcla";
import {
  coincidencia, componentes, esAnime, mejorRespaldo, ordenarTurnosPonderados, permiteAnime,
  type Candidato, type Respaldo,
} from "./reco-puntaje";
export type { Senal, PesoSenal } from "./reco-mezcla";

// Cuántos títulos del usuario se usan como origen. El costo real no está acá
// —6 orígenes son 18 llamadas, todas cacheadas POR TÍTULO y compartidas entre
// usuarios— sino en el enriquecido, que se acota aparte.
export const MAX_ORIGENES = 6;

// Cuántos candidatos se enriquecen (1 `providersOf` cada uno). Se ordena ANTES
// de cortar, así que son los 80 mejores y no los 80 primeros que llegaron.
//
// 80 SALE DE MEDIRLO, y la estimación previa daba menos de la mitad. La cuenta
// era: de 233 enriquecidos sobreviven 164 al filtro de plataformas (70%) y 143
// al sacar lo que ya está en el Home, así que para 20 finales alcanzaría con
// ~33. Medido de verdad:
//
//   ventana        n,d,m            solo Netflix
//      40      16 (6p/10s)          12 (6p/6s)
//      80      20 (10p/10s)         20 (8p/12s)
//     120      20 (10p/10s)         20 (10p/10s)
//
// La estimación fallaba porque promediaba dos poblaciones muy distintas: los
// candidatos del CRUCE vienen de `discover` CON `with_watch_providers`, así que
// ya están en plataforma y sobreviven casi todos; los del MISMO TIPO vienen de
// `/recommendations`, que no filtra nada, y ahí se cae la mayoría. Como el
// intercalado pone muchos del segundo grupo adelante, la ventana rinde bastante
// menos que el promedio.
//
// 120 no agrega títulos, solo mejora el balance en el caso de una sola
// plataforma (8p/12s → 10p/10s). No pareció valer 40 enriquecidos más.
//
// Se puede pisar por entorno SOLO para medir. Ojo: es un `const` de módulo, así
// que la variable tiene que estar puesta ANTES de arrancar el proceso — setearla
// después del import no hace nada y da tres mediciones idénticas (ya pasó).
export const VENTANA = Number(process.env.RECO_VENTANA) || 80;

export const OBJETIVO = 20;
export const OBJETIVO_POR_TIPO = 10;
// Debajo de esto el riel NO se muestra. No se rellena con popularidad genérica
// para llegar al número: un riel corto es honesto, uno rellenado es mentira.
export const PISO = 10;

// `Senal` y `PesoSenal` se re-exportan de ./reco-mezcla, que es donde viven las
// funciones puras del riel (y donde están sus tests). `Malaso` NO es fuente: un
// título que no te gustó no origina recomendaciones. Y como TODO lo que el
// usuario calificó entra en las exclusiones, tampoco puede reaparecer
// recomendado desde otro origen.

export interface Recomendacion extends UITitle {
  // De qué título salió. Viaja hasta la tarjeta ("Porque te gustó X") y es lo
  // que hace auditable el riel: sin esto, una recomendación mala y una buena se
  // ven igual.
  porque: { id: number; tipo: MediaType; titulo: string };
  camino: "mismo" | "cruce";
  // Cuántas señales distintas respaldan este candidato. Es el desempate.
  apoyos: number;
}

// Por qué el riel no se muestra. Los cuatro casos se ven idénticos desde afuera
// —el riel no está— y son cosas muy distintas.
export type MotivoSinRiel =
  | "sin-sesion"         // el riel es solo para usuarios con sesión
  | "sin-senales"        // el usuario todavía no calificó ni listó nada
  | "sin-plataformas"
  | "sin-candidatos"     // TMDB no devolvió nada para ningún origen
  | "filtrado"           // había candidatos y los filtros los dejaron bajo el piso
  ;

import { clave } from "./reco-mezcla";
const otro = (t: MediaType): MediaType => (t === "movie" ? "tv" : "movie");

// --- Fuentes por título, cacheadas ------------------------------------------
// La clave es POR TÍTULO y no por usuario: dos personas a las que les gustó lo
// mismo pagan una sola vez, y el enriquecido lo comparte hasta quien nunca abrió
// el riel (`pv:` es la misma clave que usa todo el resto de la app).

// --- Un solo `titleDetails` por origen --------------------------------------
// Cada origen dispara TRES caminos en paralelo (`recomendadosDe`, `cruzadosDe`
// que llama a `perfilDe`, y `perfilDe` otra vez), y los tres piden el MISMO
// detalle. `cached()` no hace single-flight: en un MISS concurrente los tres
// salen a TMDB.
//
// Esto comparte la PROMESA por `tipo:id`, y la borra al resolverse. No es un
// cache: no guarda nada entre requests, solo evita que dos llamadas que están
// en vuelo al mismo tiempo se dupliquen. Por eso no puede servir datos viejos.
// El mecanismo vive en `lib/single-flight.ts` (módulo puro, con tests).
//
// La clave es `idioma:tipo:id`. El tipo, porque TMDB reutiliza los números entre
// películas y series. El IDIOMA, porque la llamada base y la de respaldo son
// dos pedidos distintos al mismo título: sin él, el respaldo en es-ES recibiría
// la promesa del pedido en es-MX.
//
// Base Y respaldo pasan los dos por acá: es lo que garantiza el peor caso de
// "1 base + como máximo 1 respaldo por origen", aunque los tres caminos del
// recomendador pidan la reparación al mismo tiempo.
const compartirDetalle = crearSingleFlight<RawDetail>({
  // Las métricas se anotan donde de VERDAD se sale a la red.
  alPedir: () => anotarLlamadaIdioma(),
});
const detalleDe = (tipo: MediaType, id: number, idioma = IDIOMA_BASE) =>
  compartirDetalle(`${idioma}:${tipo}:${id}`, () => titleDetails(tipo, id,
    idioma === IDIOMA_BASE ? undefined : idioma));

async function recomendadosDe(tipo: MediaType, id: number): Promise<RawTitle[]> {
  let fallo = false;
  return cachedLocIf(claveRecoMismo(tipo, id, HUELLA_EN_CLAVES), TTL.catalog, async () => {
    // `/recommendations` viene dentro de titleDetails vía append_to_response, así
    // que esto no cuesta una llamada extra sobre la ficha.
    const d = await detalleDe(tipo, id);
    const base = (d.recommendations?.results ?? []).map((x) => ({ ...x }));
    // Lote MIXTO: los recomendados de una película pueden ser series y TMDB
    // reutiliza los ids entre tipos.
    const rep = await repararLote(
      base,
      async () => (await detalleDe(tipo, id, IDIOMA_FALLBACK)).recommendations?.results ?? [],
      `reco:mismo ${tipo}:${id}`,
      { clave: claveMixta, claveRespaldo: claveMixta },
    );
    fallo = rep.fallo;
    return rep.items;
  }, () => !fallo);
}

interface PerfilTematico {
  titulo: string;
  keywords: number[];
  generosOpuesto: number[];
  // Los géneros del origen EN SU PROPIO TIPO. Son con los que se compara un
  // candidato del camino "mismo", que llega en el mismo espacio de géneros.
  generosPropios: number[];
  // Idioma original, para el guard de anime. Sale del mismo `titleDetails` que
  // ya se pedía: no cuesta una llamada más.
  idioma: string;
}

async function perfilDe(tipo: MediaType, id: number): Promise<PerfilTematico> {
  // v2: el perfil sumó `generosPropios` e `idioma`. La clave TIENE que subir de
  // versión: en producción hay entradas guardadas con la forma vieja, y al
  // recuperarlas esos dos campos vienen `undefined`. Sin esto, el primer armado
  // después del deploy le pasa `undefined` a `coincidencia()` y a `esAnime()`
  // por cada título ya cacheado — y encima solo hasta que expire el TTL, así que
  // sería un bug que se cura solo y no se puede reproducir después.
  let falloPerfil = false;
  return cachedLocIf(claveRecoPerfil(tipo, id, HUELLA_EN_CLAVES), TTL.catalog, async () => {
    // `titulo` se guarda en el cache y es localizado. Hoy solo se usa para
    // puntuar y para los logs, pero una clave localizada que no se repara es
    // una clave que va a mostrar el idioma viejo el día que alguien la muestre.
    const rep = await repararUno(
      await detalleDe(tipo, id),
      () => detalleDe(tipo, id, IDIOMA_FALLBACK),
      `reco:perfil ${tipo}:${id}`,
    );
    falloPerfil = rep.fallo;
    const d = rep.item;
    const propias = (await tmdbKeywords(tipo, id)).map((k) => k.id);
    const slugs = genreIdsToSlugs((d.genres ?? []).map((g) => g.id));
    // Dos fuentes de keywords: las del título y las que aporta el mapeo de
    // categorías. La segunda importa más de lo que parece — para varios géneros
    // el cruce de tipo se hace con keyword y no con género (Terror en TV es la
    // keyword 315058, no un género). Contando las dos, solo 2 de cada 40 títulos
    // del catálogo AR se quedan sin nada para cruzar.
    const delMapeo = [...new Set(slugs.flatMap((s) => resolveCategory(s, otro(tipo)).keywords ?? []))];
    const generosOpuesto = [...new Set(slugs.flatMap((s) => resolveCategory(s, otro(tipo)).genres ?? []))];
    return {
      titulo: d.title || d.name || "",
      keywords: [...new Set([...propias, ...delMapeo])].slice(0, 4),
      generosOpuesto,
      generosPropios: (d.genres ?? []).map((g) => g.id),
      idioma: d.original_language ?? "",
    };
  }, () => !falloPerfil);
}

async function cruzadosDe(
  tipo: MediaType, id: number, providers: PlatformCode[],
): Promise<{ items: RawTitle[]; hubo: boolean }> {
  const perfil = await perfilDe(tipo, id);
  if (!perfil.keywords.length) return { items: [], hubo: false };
  const ids = codesToTmdbIds(providers);
  if (!ids.length) return { items: [], hubo: false };
  let falloCruce = false;
  const items = await cachedLocIf(
    claveRecoCruce(tipo, id, [...providers].sort().join(","), HUELLA_EN_CLAVES),
    TTL.catalog,
    async () => {
      const params = {
        keywords: perfil.keywords,
        genres: perfil.generosOpuesto.length ? perfil.generosOpuesto : undefined,
        providers: ids,
        // Sin piso de votos, explícito: el default de `discover` es 60 y dejaría
        // fuera el cine regional, que es justo lo que esta app quiere mostrar
        // (issue #12).
        minVotes: 0,
      };
      const d = await discover(otro(tipo), params);
      const rep = await repararLote(
        d.results,
        async () => (await discover(otro(tipo), {
          ...params, extra: { language: IDIOMA_FALLBACK },
        })).results,
        `reco:cruce ${tipo}:${id}`,
        { clave: clavePorId },
      );
      falloCruce = rep.fallo;
      return rep.items;
    },
    () => !falloCruce,
  );
  return { items, hubo: true };
}

// Hash estable de lo que define un riel. Sirve para dos cosas a la vez: es la
// clave del cache Y su invalidación. Al votar o tocar Mi lista cambian las
// señales, cambia el hash y el riel se rearma solo — nadie tiene que acordarse
// de borrar nada. Es el mismo truco que el hash de receta en lib/pools.ts.
//
// El id del usuario NO entra: no hace falta. Dos personas con exactamente las
// mismas señales, exclusiones y plataformas merecen el mismo riel, y compartir
// esa entrada es correcto además de barato. Y de paso, en el cache no queda
// ningún identificador de persona.
function huella(...partes: string[]): string {
  const s = partes.join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export async function recomendaciones(opts: {
  senales: Senal[];
  // Todo lo que NO puede aparecer: lo que el usuario calificó (incluido Malaso),
  // lo que tiene en Mi lista, lo que marcó como visto, y lo que ya se está
  // mostrando en el Home. Viene junto y del cliente, que es el único que conoce
  // las dos cosas.
  excluir: string[];
  providers: PlatformCode[];
}): Promise<{ items: Recomendacion[]; motivo?: MotivoSinRiel }> {
  if (!opts.providers.length) return { items: [], motivo: "sin-plataformas" };
  if (!opts.senales.length) return { items: [], motivo: "sin-senales" };

  // El riel entero, cacheado. Sin esto cada carga del Home de un usuario con
  // sesión pagaba hasta 80 `providersOf`, y volver atrás desde una ficha los
  // pagaba otra vez.
  // v2: el orden dejó de ser "intercalado por origen + posición de TMDB" y pasó
  // a ser un puntaje de afinidad, y se agregó el guard de anime. Cambia el
  // CONTENIDO del riel, así que sin subir la versión lo ya cacheado se sigue
  // sirviendo hasta que expire el TTL y el cambio "no se ve" después de deployar.
  const clv = claveReco(huella(
    [...opts.senales].map((s) => `${s.tipo}:${s.id}:${s.peso}`).sort().join(","),
    [...opts.excluir].sort().join(","),
    [...opts.providers].sort().join(","),
  ), HUELLA_EN_CLAVES);
  // El riel entero: si alguna reparación de adentro falló, se sirve igual pero
  // NO se guarda. Con TTL.reco de 6 h, un riel sin reparar quedaría congelado
  // aunque cada `card:` de adentro sí se haya protegido por separado.
  const senal = { fallo: false };
  return cachedLocIf(clv, TTL.reco, () => armar({ ...opts, senal }), () => !senal.fallo);
}

async function armar(opts: {
  /** Señal de salida: la reparación de idioma falló en alguna capa de adentro. */
  senal?: { fallo: boolean };
  senales: Senal[];
  excluir: string[];
  providers: PlatformCode[];
}): Promise<{ items: Recomendacion[]; motivo?: MotivoSinRiel }> {
  // Delta de fallos DURANTE el armado. Las capas de adentro (`card:`,
  // `reco:mismo`, `reco:cruce`) ya se protegen cada una, pero el riel COMPUESTO
  // se guarda aparte y podría cachear items sin reparar.
  //
  // Es deliberadamente conservador: si otra rama del mismo request falla al
  // mismo tiempo, este riel tampoco se guarda. Errar hacia "no cachear" cuesta
  // un rearmado; errar al revés congela contenido roto 6 h.
  const fallosAntes = metricasIdiomaActuales()?.fallos ?? 0;
  const marcarSiFallo = () => {
    if (opts.senal && (metricasIdiomaActuales()?.fallos ?? 0) > fallosAntes) {
      opts.senal.fallo = true;
    }
  };

  // Jerarquía Petacular > Ta buena > Mi lista, y dentro de cada nivel el orden
  // en que vino (el cliente los manda por fecha descendente). No hay cupo por
  // nivel: si alguien solo tiene Mi lista, esos ocupan los 6 lugares.
  // Elegir orígenes: deduplica por `tipo:id` conservando la señal más fuerte y
  // corta a MAX_ORIGENES. La lógica vive en ./reco-mezcla porque es pura y tiene
  // tests; acá solo se usa.
  const origenes = elegirOrigenes(opts.senales, MAX_ORIGENES);

  const porOrigen = await Promise.all(origenes.map(async (o) => {
    const [mismos, cruce, perfil] = await Promise.all([
      recomendadosDe(o.tipo, o.id),
      cruzadosDe(o.tipo, o.id, opts.providers),
      perfilDe(o.tipo, o.id),
    ]);
    return { origen: o, perfil, mismos, cruzados: cruce.items };
  }));

  // El candidato guarda su MEJOR respaldo, no el primero que llegó, y la
  // posición que traía dentro de la respuesta de TMDB — que hasta ahora se
  // tiraba y es justamente el dato que decidía el orden sin que nadie lo mirara.
  interface Cand {
    tipo: MediaType; raw: RawTitle; apoyos: number; respaldo: Respaldo;
  }
  const porClave = new Map<string, Cand>();
  const sumar = (
    tipo: MediaType, raw: RawTitle, camino: "mismo" | "cruce",
    o: (typeof porOrigen)[number], pos: number,
  ) => {
    const k = clave(tipo, raw.id);
    // Con qué se compara el candidato depende del camino: uno del MISMO tipo
    // llega en el mismo espacio de géneros que el origen, y uno de CRUCE ya
    // viene mapeado al tipo opuesto.
    const esperados = camino === "mismo" ? o.perfil.generosPropios : o.perfil.generosOpuesto;
    const respaldo: Respaldo = {
      origenId: o.origen.id, origenTipo: o.origen.tipo, origenTitulo: o.perfil.titulo,
      fuerza: o.origen.peso, camino, pos,
      tema: coincidencia(raw.genre_ids ?? [], esperados),
    };
    const ya = porClave.get(k);
    if (ya) { ya.apoyos++; ya.respaldo = mejorRespaldo(ya.respaldo, respaldo); return; }
    porClave.set(k, { tipo, raw, apoyos: 1, respaldo });
  };
  for (const o of porOrigen) {
    o.mismos.forEach((r, i) => sumar(o.origen.tipo, r, "mismo", o, i + 1));
    o.cruzados.forEach((r, i) => sumar(otro(o.origen.tipo), r, "cruce", o, i + 1));
  }
  if (!porClave.size) return { items: [], motivo: "sin-candidatos" };

  // Las señales SIEMPRE se excluyen acá, además de venir en `excluir`. No es
  // redundante: el cliente manda las exclusiones y podría no incluirlas, y
  // entonces el riel recomendaría un título que el usuario ya calificó, con un
  // "porque te gustó" que apunta a otro. Pasó en la primera prueba del endpoint
  // (Joker recomendado a partir de Parásitos, siendo Joker una de las señales).
  // Un invariante del riel no puede depender de que el cliente se acuerde.
  const excluidos = new Set([...opts.excluir, ...opts.senales.map((s) => clave(s.tipo, s.id))]);
  let vivos = [...porClave.values()].filter((c) => !excluidos.has(clave(c.tipo, c.raw.id)));

  // GUARD DE ANIME. Va acá, antes de la ventana, así que no cuesta nada y no le
  // quita lugar a nadie en el enriquecido. Ver `permiteAnime`: se habilita solo
  // si alguno de los seis orígenes positivos es anime.
  const conAnime = permiteAnime(porOrigen.map((o) => ({
    generos: o.perfil.generosPropios, idioma: o.perfil.idioma,
  })));
  if (!conAnime) {
    vivos = vivos.filter((c) => !esAnime({
      generos: c.raw.genre_ids ?? [], idioma: c.raw.original_language ?? "",
    }));
  }

  const comoCandidato = (c: Cand): Candidato => ({
    tipo: c.tipo, id: c.raw.id, apoyos: c.apoyos, respaldo: c.respaldo,
    generos: c.raw.genre_ids ?? [], idioma: c.raw.original_language ?? "",
  });

  // Auditoría. Son títulos del catálogo, no datos de la persona: no hay nada
  // que identifique a nadie.
  //
  // DOS ETIQUETAS, y la distinción importa. `pre-enriquecido` son los que
  // entran a la ventana; `final` son los que quedaron en las tarjetas. En el
  // medio está `enrichRaw`, que filtra por plataformas y se lleva puestos
  // muchos —los del camino "mismo" vienen de `/recommendations`, que no filtra
  // nada—. Leer solo el primero y creer que eso es lo que se mostró es el error
  // fácil, y era el que habilitaba el log anterior.
  const auditar = (etiqueta: string, xs: { tipo: MediaType; raw: RawTitle; apoyos: number; respaldo: Respaldo }[]) => {
    if (process.env.RECO_LOG !== "1") return;
    for (const c of xs) {
      const k = componentes(comoCandidato(c));
      console.log(
        `[reco:${etiqueta}] ${clave(c.tipo, c.raw.id).padEnd(12)} ` +
        `${(c.raw.title || c.raw.name || "").slice(0, 26).padEnd(26)} ` +
        `origen=${c.respaldo.origenTitulo.slice(0, 16).padEnd(16)} camino=${c.respaldo.camino.padEnd(6)} ` +
        `fuerza=${c.respaldo.fuerza} apoyos=${c.apoyos} tema=${k.tema.toFixed(2)} ` +
        `posTMDB=${String(c.respaldo.pos).padStart(2)} total=${k.total.toFixed(3)}`,
      );
    }
  };

  const ordenados = ordenarTurnosPonderados(vivos, comoCandidato).slice(0, VENTANA);
  auditar("pre-enriquecido", ordenados);

  // `_cand` viaja solo hasta el reordenado y se saca antes de devolver.
  const enriquecidos: (Recomendacion & { _cand: Cand })[] = [];
  await Promise.all((["movie", "tv"] as MediaType[]).map(async (tipo) => {
    const delTipo = ordenados.filter((c) => c.tipo === tipo);
    if (!delTipo.length) return;
    const ok = await enrichRaw(delTipo.map((c) => c.raw), tipo, opts.providers);
    const meta = new Map(delTipo.map((c) => [clave(c.tipo, c.raw.id), c]));
    for (const t of ok) {
      const m = meta.get(clave(t.type, t.id));
      if (m) {
        enriquecidos.push({
          ...t,
          // `porque` sale del MEJOR respaldo, no del primero que llegó.
          porque: { id: m.respaldo.origenId, tipo: m.respaldo.origenTipo, titulo: m.respaldo.origenTitulo },
          camino: m.respaldo.camino,
          apoyos: m.apoyos,
          _cand: m,
        });
      }
    }
  }));

  // El enriquecido por tipo rompe el orden, así que se rehace sobre lo que
  // sobrevivió y recién ahí se mezclan los dos tipos.
  const reordenados = ordenarTurnosPonderados(enriquecidos, (t) => comoCandidato(t._cand))
    .map(({ _cand, ...t }) => t as Recomendacion);
  const items = mezclarTipos(reordenados, OBJETIVO, OBJETIVO_POR_TIPO);
  // `final` = lo que se muestra. Se re-busca el candidato de cada uno porque
  // `_cand` ya se sacó del objeto que se devuelve.
  const porId = new Map(enriquecidos.map((e) => [clave(e.type, e.id), e._cand]));
  auditar("final", items.map((t) => porId.get(clave(t.type, t.id))!).filter(Boolean));
  if (items.length < PISO) return { items: [], motivo: "filtrado" };
  marcarSiFallo();
  return { items };
}
