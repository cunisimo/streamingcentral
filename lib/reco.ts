// "Te va a gustar" — el único riel personalizado del Home.
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
import { cached, TTL } from "./cache";
import { discover, titleDetails, tmdbKeywords } from "./tmdb";
import { enrichRaw } from "./enrich";
import { genreIdsToSlugs, resolveCategory } from "./categories";
import { codesToTmdbIds } from "./providers-ar";
import type { MediaType, PlatformCode, UITitle } from "./types";
import type { RawTitle } from "./tmdb";

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

// Peso de cada señal. `Malaso` NO es fuente: un título que no te gustó no
// origina recomendaciones. Y como TODO lo que el usuario calificó entra en las
// exclusiones, tampoco puede reaparecer recomendado desde otro origen.
export type PesoSenal = 3 | 2 | 1;   // 3 Petacular · 2 Ta buena · 1 Mi lista

export interface Senal {
  tipo: MediaType;
  id: number;
  peso: PesoSenal;
}

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
  | "sin-senales"        // el usuario todavía no calificó ni listó nada
  | "sin-plataformas"
  | "sin-candidatos"     // TMDB no devolvió nada para ningún origen
  | "filtrado"           // había candidatos y los filtros los dejaron bajo el piso
  ;

const clave = (t: MediaType, id: number) => `${t}:${id}`;
const otro = (t: MediaType): MediaType => (t === "movie" ? "tv" : "movie");

// --- Fuentes por título, cacheadas ------------------------------------------
// La clave es POR TÍTULO y no por usuario: dos personas a las que les gustó lo
// mismo pagan una sola vez, y el enriquecido lo comparte hasta quien nunca abrió
// el riel (`pv:` es la misma clave que usa todo el resto de la app).

async function recomendadosDe(tipo: MediaType, id: number): Promise<RawTitle[]> {
  return cached(`reco:mismo:${tipo}:${id}`, TTL.catalog, async () => {
    // `/recommendations` viene dentro de titleDetails vía append_to_response, así
    // que esto no cuesta una llamada extra sobre la ficha.
    const d = await titleDetails(tipo, id);
    return (d.recommendations?.results ?? []).map((x) => ({ ...x }));
  });
}

interface PerfilTematico {
  titulo: string;
  keywords: number[];
  generosOpuesto: number[];
}

async function perfilDe(tipo: MediaType, id: number): Promise<PerfilTematico> {
  return cached(`reco:perfil:${tipo}:${id}`, TTL.catalog, async () => {
    const d = await titleDetails(tipo, id);
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
    };
  });
}

async function cruzadosDe(
  tipo: MediaType, id: number, providers: PlatformCode[],
): Promise<{ items: RawTitle[]; hubo: boolean }> {
  const perfil = await perfilDe(tipo, id);
  if (!perfil.keywords.length) return { items: [], hubo: false };
  const ids = codesToTmdbIds(providers);
  if (!ids.length) return { items: [], hubo: false };
  const items = await cached(
    `reco:cruce:${tipo}:${id}:${[...providers].sort().join(",")}`,
    TTL.catalog,
    async () => {
      const d = await discover(otro(tipo), {
        keywords: perfil.keywords,
        genres: perfil.generosOpuesto.length ? perfil.generosOpuesto : undefined,
        providers: ids,
        // Sin piso de votos, explícito: el default de `discover` es 60 y dejaría
        // fuera el cine regional, que es justo lo que esta app quiere mostrar
        // (issue #12).
        minVotes: 0,
      });
      return d.results;
    },
  );
  return { items, hubo: true };
}

// --- Orden -------------------------------------------------------------------
// Intercala por origen: uno de cada uno por vuelta. Sin esto el riel se lo lleva
// el primer origen — medido, 8 de los 12 primeros salían del mismo título,
// porque casi ningún candidato tiene 2+ apoyos y entonces el desempate no
// desempata y manda el orden de llegada.
function intercalarPorOrigen<T extends { porque: { id: number }; apoyos: number }>(cands: T[]): T[] {
  const grupos = new Map<number, T[]>();
  for (const c of cands) {
    const g = grupos.get(c.porque.id) ?? [];
    g.push(c);
    grupos.set(c.porque.id, g);
  }
  // Dentro de cada origen, primero los que tienen más apoyos.
  for (const g of grupos.values()) g.sort((a, b) => b.apoyos - a.apoyos);
  const listas = [...grupos.values()];
  const out: T[] = [];
  for (let i = 0; out.length < cands.length; i++) {
    let hubo = false;
    for (const l of listas) {
      if (i < l.length) { out.push(l[i]); hubo = true; }
    }
    if (!hubo) break;
  }
  return out;
}

// Mezcla los dos tipos apuntando a mitad y mitad. Si un lado no llega, el otro
// completa: el riel es uno solo y mixto, así que "10 y 10" es un objetivo, no
// una cuota.
function mezclarTipos(items: Recomendacion[], objetivo: number, porTipo: number): Recomendacion[] {
  const pel = items.filter((i) => i.type === "movie");
  const ser = items.filter((i) => i.type === "tv");
  const out: Recomendacion[] = [];
  let p = 0, s = 0;
  while (out.length < objetivo && (p < pel.length || s < ser.length)) {
    if (p < pel.length && (out.filter((i) => i.type === "movie").length < porTipo || s >= ser.length)) out.push(pel[p++]);
    else if (s < ser.length) out.push(ser[s++]);
    else if (p < pel.length) out.push(pel[p++]);
    else break;
  }
  return out;
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

  // Jerarquía Petacular > Ta buena > Mi lista, y dentro de cada nivel el orden
  // en que vino (el cliente los manda por fecha descendente). No hay cupo por
  // nivel: si alguien solo tiene Mi lista, esos ocupan los 6 lugares.
  const origenes = [...opts.senales].sort((a, b) => b.peso - a.peso).slice(0, MAX_ORIGENES);

  const porOrigen = await Promise.all(origenes.map(async (o) => {
    const [mismos, cruce, perfil] = await Promise.all([
      recomendadosDe(o.tipo, o.id),
      cruzadosDe(o.tipo, o.id, opts.providers),
      perfilDe(o.tipo, o.id),
    ]);
    return { origen: o, titulo: perfil.titulo, mismos, cruzados: cruce.items };
  }));

  interface Cand { tipo: MediaType; raw: RawTitle; camino: "mismo" | "cruce"; porque: { id: number; tipo: MediaType; titulo: string }; apoyos: number }
  const porClave = new Map<string, Cand>();
  const sumar = (tipo: MediaType, raw: RawTitle, camino: "mismo" | "cruce", o: (typeof porOrigen)[number]) => {
    const k = clave(tipo, raw.id);
    const ya = porClave.get(k);
    if (ya) { ya.apoyos++; return; }
    porClave.set(k, {
      tipo, raw, camino, apoyos: 1,
      porque: { id: o.origen.id, tipo: o.origen.tipo, titulo: o.titulo },
    });
  };
  for (const o of porOrigen) {
    for (const r of o.mismos) sumar(o.origen.tipo, r, "mismo", o);
    for (const r of o.cruzados) sumar(otro(o.origen.tipo), r, "cruce", o);
  }
  if (!porClave.size) return { items: [], motivo: "sin-candidatos" };

  // Las señales SIEMPRE se excluyen acá, además de venir en `excluir`. No es
  // redundante: el cliente manda las exclusiones y podría no incluirlas, y
  // entonces el riel recomendaría un título que el usuario ya calificó, con un
  // "porque te gustó" que apunta a otro. Pasó en la primera prueba del endpoint
  // (Joker recomendado a partir de Parásitos, siendo Joker una de las señales).
  // Un invariante del riel no puede depender de que el cliente se acuerde.
  const excluidos = new Set([...opts.excluir, ...opts.senales.map((s) => clave(s.tipo, s.id))]);
  const vivos = [...porClave.values()].filter((c) => !excluidos.has(clave(c.tipo, c.raw.id)));

  // Ordenar ANTES de enriquecer: `providersOf` cuesta 1 request por título, así
  // que se paga solo por los que tienen chance de entrar.
  const ordenados = intercalarPorOrigen(vivos).slice(0, VENTANA);

  const enriquecidos: Recomendacion[] = [];
  await Promise.all((["movie", "tv"] as MediaType[]).map(async (tipo) => {
    const delTipo = ordenados.filter((c) => c.tipo === tipo);
    if (!delTipo.length) return;
    const ok = await enrichRaw(delTipo.map((c) => c.raw), tipo, opts.providers);
    const meta = new Map(delTipo.map((c) => [clave(c.tipo, c.raw.id), c]));
    for (const t of ok) {
      const m = meta.get(clave(t.type, t.id));
      if (m) enriquecidos.push({ ...t, porque: m.porque, camino: m.camino, apoyos: m.apoyos });
    }
  }));

  // El enriquecido por tipo rompe el intercalado, así que se rehace sobre lo que
  // sobrevivió y recién ahí se mezclan los dos tipos.
  const items = mezclarTipos(intercalarPorOrigen(enriquecidos), OBJETIVO, OBJETIVO_POR_TIPO);
  if (items.length < PISO) return { items: [], motivo: "filtrado" };
  return { items };
}
