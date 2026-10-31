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
  HUELLA_IDIOMA, IDIOMA_BASE, IDIOMA_FALLBACK, claveMixta, clavePorId,
  pedirRespaldoIdioma, repararLote, repararUno,
  withMetricasIdioma,
} from "./idioma";
import { adaptadorRiel } from "./idioma-adaptadores";
import { discover, titleDetails, tmdbKeywords, type RawDetail } from "./tmdb";
import { crearSingleFlight } from "./single-flight";
import { enrichRaw } from "./enrich";
import { withFallosDeFuentes } from "./fallos-tmdb";
import { genreIdsToSlugs, resolveCategory } from "./categories";
import { codesToTmdbIds } from "./providers-ar";
import type { MediaType, PlatformCode, UITitle } from "./types";
import type { RawTitle } from "./tmdb";
import { clave, elegirOrigenes, type Senal } from "./reco-mezcla";
import {
  OPCIONES_ANTERIORES, OPCIONES_NUEVAS, juntarCandidatos, lineaAuditoria, seleccionFinal,
  ventanaDeEnriquecido, PISO, type Enriquecido, type MotivoSinRiel, type OpcionesArmado,
  type OrigenArmado, type Recomendacion,
} from "./reco-armado";
import {
  candidatasOrigen, elegirOrigenesMMR, exclusionesCruce, type SenalConRango,
} from "./reco-seleccion";
export type { Senal, PesoSenal } from "./reco-mezcla";
export { VENTANA, OBJETIVO, OBJETIVO_POR_TIPO, PISO } from "./reco-armado";
export type { Recomendacion, MotivoSinRiel } from "./reco-armado";

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
// VENTANA, OBJETIVO, PISO, `Recomendacion` y `MotivoSinRiel` viven ahora en
// ./reco-armado, junto con el armado puro que comparten la ruta y el harness.
//
// `Malaso` NO es fuente: un título que no te gustó no origina recomendaciones.
// Y como TODO lo que el usuario calificó entra en las exclusiones, tampoco
// puede reaparecer recomendado desde otro origen.

const otro = (t: MediaType): MediaType => (t === "movie" ? "tv" : "movie");

// --- Interruptores (sin tocar código; en Vercel rigen desde el deploy siguiente) ---
// RECO_DIVERSIDAD=0  vuelve al algoritmo anterior entero (orígenes por peso,
//                    sin guard infantil, turnos ponderados + mezcla 10/10).
// RECO_CRUCE_SIN_FAMILIA=0  apaga la variante D2(a) del cruce (§4.2 del plan):
//                    el cruce hacia películas de un origen animado vuelve a
//                    pedir sin excluir Family. El guard infantil sigue.
const diversidadActiva = () => process.env.RECO_DIVERSIDAD !== "0";
const cruceSinFamilia = () => process.env.RECO_CRUCE_SIN_FAMILIA !== "0";

// --- Fuentes por título, cacheadas ------------------------------------------
// La clave es POR TÍTULO y no por usuario: dos personas a las que les gustó lo
// mismo pagan una sola vez, y el enriquecido lo comparte hasta quien nunca abrió
// el riel (`pv3:` es la misma clave que usa todo el resto de la app).

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
// El single-flight de la BASE no cuenta nada: la métrica `llamadas` mide
// respaldos, y contarlo acá anotaba cada pedido base como si lo fuera.
const compartirDetalle = crearSingleFlight<RawDetail>();
const detalleBase = (tipo: MediaType, id: number) =>
  compartirDetalle(`${IDIOMA_BASE}:${tipo}:${id}`, () => titleDetails(tipo, id));

// El respaldo va por el punto único, que es quien cuenta y quien une lo que ya
// esté en vuelo.
const detalleRespaldo = (tipo: MediaType, id: number) =>
  pedirRespaldoIdioma(`detalle:${tipo}:${id}`, () => titleDetails(tipo, id, IDIOMA_FALLBACK));

export async function recomendadosDe(tipo: MediaType, id: number): Promise<RawTitle[]> {
  let fallo = false;
  return cachedLocIf(claveRecoMismo(tipo, id, HUELLA_IDIOMA), TTL.catalog, async () => {
    // `/recommendations` viene dentro de titleDetails vía append_to_response, así
    // que esto no cuesta una llamada extra sobre la ficha.
    const d = await detalleBase(tipo, id);
    const base = (d.recommendations?.results ?? []).map((x) => ({ ...x }));
    // Lote MIXTO: los recomendados de una película pueden ser series y TMDB
    // reutiliza los ids entre tipos.
    const rep = await repararLote(
      base,
      async () => (await detalleRespaldo(tipo, id)).recommendations?.results ?? [],
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

export async function perfilDe(tipo: MediaType, id: number): Promise<PerfilTematico> {
  // v2: el perfil sumó `generosPropios` e `idioma`. La clave TIENE que subir de
  // versión: en producción hay entradas guardadas con la forma vieja, y al
  // recuperarlas esos dos campos vienen `undefined`. Sin esto, el primer armado
  // después del deploy le pasa `undefined` a `coincidencia()` y a `esAnime()`
  // por cada título ya cacheado — y encima solo hasta que expire el TTL, así que
  // sería un bug que se cura solo y no se puede reproducir después.
  let falloPerfil = false;
  return cachedLocIf(claveRecoPerfil(tipo, id, HUELLA_IDIOMA), TTL.catalog, async () => {
    // `titulo` se guarda en el cache y es localizado. Hoy solo se usa para
    // puntuar y para los logs, pero una clave localizada que no se repara es
    // una clave que va a mostrar el idioma viejo el día que alguien la muestre.
    const rep = await repararUno(
      await detalleBase(tipo, id),
      () => detalleRespaldo(tipo, id),
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

// `sin` = géneros que el pedido excluye (ver `exclusionesCruce` en
// ./reco-seleccion). Se exporta, como `perfilDe` y `recomendadosDe`, sólo para
// que el harness capture las MISMAS respuestas que usa la ruta.
export async function cruzadosDe(
  tipo: MediaType, id: number, providers: PlatformCode[], sin: number[] = [],
): Promise<{ items: RawTitle[]; hubo: boolean }> {
  const perfil = await perfilDe(tipo, id);
  if (!perfil.keywords.length) return { items: [], hubo: false };
  const ids = codesToTmdbIds(providers);
  if (!ids.length) return { items: [], hubo: false };
  let falloCruce = false;
  const items = await cachedLocIf(
    claveRecoCruce(tipo, id, [...providers].sort().join(","), sin, HUELLA_IDIOMA),
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
        withoutGenres: sin.length ? sin : undefined,
      };
      const d = await discover(otro(tipo), params);
      const rep = await repararLote(
        d.results,
        () => pedirRespaldoIdioma(
          `cruce:${tipo}:${id}`,
          async () => (await discover(otro(tipo), {
            ...params, extra: { language: IDIOMA_FALLBACK },
          })).results,
        ),
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

// Una señal puede traer `rango` (posición por recencia entre todas las
// positivas). Lo trae cuando las señales las leyó el SERVIDOR con el token del
// usuario (lib/reco-senales-servidor.ts); las que manda el cliente —también las
// de Android 1.2.0 y del AAB 5— no lo traen, y entonces se eligen los orígenes
// como antes, por peso.
export type SenalEntrada = Senal & { rango?: number };

export async function recomendaciones(opts: {
  senales: SenalEntrada[];
  // Todo lo que NO puede aparecer: lo que el usuario calificó (incluido Malaso),
  // lo que tiene en Mi lista, lo que marcó como visto, sus descartes y lo que ya
  // se está mostrando en el Home.
  excluir: string[];
  providers: PlatformCode[];
}): Promise<{ items: Recomendacion[]; motivo?: MotivoSinRiel }> {
  if (!opts.providers.length) return { items: [], motivo: "sin-plataformas" };
  if (!opts.senales.length) return { items: [], motivo: "sin-senales" };

  const nuevo = diversidadActiva();
  const op = nuevo ? OPCIONES_NUEVAS : OPCIONES_ANTERIORES;
  const conRango = nuevo && opts.senales.every((s) => typeof s.rango === "number");
  const sinFamilia = nuevo && cruceSinFamilia();

  // LA CLAVE SE ARMA SIN LEER NINGÚN PERFIL. Con rango, los orígenes se eligen
  // por MMR y eso necesita los géneros de cada candidata; pero las 12
  // candidatas y su orden salen sólo de peso y rango (`candidatasOrigen`), y MMR
  // es determinístico sobre ellas. Entonces la huella usa esas 12 en orden: un
  // HIT del riel no paga ni una lectura de perfil ni el MMR.
  //
  // Sin rango se usa la huella de siempre (todas las señales, ordenadas).
  const senalesClave = conRango
    ? candidatasOrigen(opts.senales as SenalConRango[]).map((s) => `${s.tipo}:${s.id}:${s.peso}`).join(",")
    : [...opts.senales].map((s) => `${s.tipo}:${s.id}:${s.peso}`).sort().join(",");
  const variante = !nuevo ? "ant" : `n${conRango ? "r" : ""}${sinFamilia ? "f" : ""}`;
  const clv = claveReco(huella(
    senalesClave,
    [...opts.excluir].sort().join(","),
    [...opts.providers].sort().join(","),
    variante,
  ), HUELLA_IDIOMA);
  // El riel entero: si alguna reparación de adentro falló, se sirve igual pero
  // NO se guarda. Con TTL.reco de 6 h, un riel sin reparar quedaría congelado
  // aunque cada `card:` de adentro sí se haya protegido por separado.
  //
  // EL CONTEXTO LO ABRE ESTA FUNCIÓN, no la route: `/api/te-va-a-gustar` no lo
  // abría y el riel se guardaba 6 h con los fallos adentro. La decisión se toma
  // DESPUÉS de que `armar()` terminó, así que los retornos tempranos quedan
  // cubiertos. Lo mismo con la disponibilidad: `armar()` llama a `enrichRaw`.
  let fallo = false;
  return cachedLocIf(clv, TTL.reco, async () => {
    const { res, fallos } = await withFallosDeFuentes(async () => {
      const rep = await adaptadorRiel({
        armar: () => armar({ ...opts, op, conRango, sinFamilia }),
        conMetricas: withMetricasIdioma,
      });
      fallo = rep.fallo;
      return rep.valor;
    });
    if (fallos) fallo = true;
    return res;
  }, () => !fallo);
}

async function elegirOrigenesDe(senales: SenalEntrada[], conRango: boolean): Promise<Senal[]> {
  if (!conRango) {
    // Jerarquía Petacular > Ta buena > Mi lista; dentro de cada nivel, el orden
    // en que vino. Ver `elegirOrigenes` en ./reco-mezcla.
    return elegirOrigenes(senales, MAX_ORIGENES);
  }
  // Con rango: hasta 12 candidatas por peso y recencia, y MMR para que seis
  // gustos parecidos no ocupen los seis lugares (§2 del plan). Pide el perfil de
  // cada candidata: hasta 12 lecturas de `reco:perfil` (compartido entre
  // usuarios, 24 h) en vez de 6. Sólo corre en un MISS del riel.
  const candidatas = candidatasOrigen(senales as SenalConRango[]);
  const perfiles = await Promise.all(candidatas.map((s) => perfilDe(s.tipo, s.id)));
  const generos = new Map(candidatas.map((s, i) => [clave(s.tipo, s.id), perfiles[i].generosPropios]));
  return elegirOrigenesMMR(candidatas, (s) => ({ tipo: s.tipo, generos: generos.get(clave(s.tipo, s.id)) ?? [] }), MAX_ORIGENES)
    .map((s) => ({ tipo: s.tipo, id: s.id, peso: s.peso }));
}

async function armar(opts: {
  senales: SenalEntrada[];
  excluir: string[];
  providers: PlatformCode[];
  op: OpcionesArmado;
  conRango: boolean;
  sinFamilia: boolean;
}): Promise<{ items: Recomendacion[]; motivo?: MotivoSinRiel }> {
  const origenes = await elegirOrigenesDe(opts.senales, opts.conRango);

  const porOrigen: OrigenArmado[] = await Promise.all(origenes.map(async (o) => {
    const perfil = await perfilDe(o.tipo, o.id);
    // Con el algoritmo anterior el cruce se pide como siempre (sin exclusiones).
    const sin = opts.op.guardInfantil
      ? exclusionesCruce({ tipo: o.tipo, generos: perfil.generosPropios }, opts.sinFamilia)
      : [];
    const [mismos, cruce] = await Promise.all([
      recomendadosDe(o.tipo, o.id),
      cruzadosDe(o.tipo, o.id, opts.providers, sin),
    ]);
    return { origen: o, perfil, mismos, cruzados: cruce.items };
  }));

  const { vivos } = juntarCandidatos(porOrigen, opts.excluir, opts.senales, opts.op);
  if (!vivos.length) return { items: [], motivo: "sin-candidatos" };

  const auditar = process.env.RECO_LOG === "1";
  const ventana = ventanaDeEnriquecido(vivos);
  if (auditar) ventana.forEach((c) => console.log(lineaAuditoria("pre-enriquecido", c)));

  // `_cand` viaja sólo hasta la selección y se saca antes de devolver.
  const enriquecidos: Enriquecido[] = [];
  await Promise.all((["movie", "tv"] as MediaType[]).map(async (tipo) => {
    const delTipo = ventana.filter((c) => c.tipo === tipo);
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
  // El orden de llegada de los dos tipos no es estable: se fija antes de elegir.
  enriquecidos.sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.id - b.id));

  const r = seleccionFinal(enriquecidos, porOrigen, opts.op);
  if (auditar) {
    console.log(`[reco:seleccion] elegibles=${r.info.elegibles} conCupos=${r.info.conCupos} ` +
      `completados=${r.info.completados} cupos=${JSON.stringify(r.info.cupos)} final=${r.items.length}`);
  }
  if (r.items.length < PISO) return { items: [], motivo: "filtrado" };
  return r.motivo ? { items: r.items, motivo: r.motivo } : { items: r.items };
}
