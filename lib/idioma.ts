// Idioma de los títulos, y la reparación de lo que TMDB no traduce.
//
// Contexto medido en docs/medidas/2026-08-23-idioma-informe.md, sobre 29 casos
// verificados en el buscador real de cada plataforma argentina:
//
//   es-ES (hoy)         encuentra 18/29
//   es-MX               encuentra 28/29
//   es-MX ∪ original    encuentra 29/29
//
// Los 11 fallos de es-ES son TODOS de Netflix, Disney+ y Max. En Disney+ falla
// 8 de 9. En Prime Video no falla nunca, porque su buscador indexa títulos
// alternativos y el de las tres grandes no.
//
// LO QUE ESTE MÓDULO NO HACE: cambiar el idioma. `IDIOMA_BASE` sale de
// `IDIOMA_TITULOS` y su default sigue siendo es-ES. El cambio se hace con la
// variable de entorno, en la tanda 2 del plan.
//
// NO IMPORTA NADA DE `./tmdb`, ni siquiera un tipo: `tmdb.ts` importa de acá
// para el idioma base, y devolver el favor cerraba un ciclo tmdb → idioma →
// tmdb. Un `import type` se borra al compilar y no debería molestar, pero un
// ciclo entre el cliente de TMDB y su configuración no aporta nada y es la
// clase de cosa que después aparece como un módulo `undefined` a mitad de una
// carga. La forma estructural de abajo alcanza y no acopla nada.

// --- Configuración -----------------------------------------------------------
export const IDIOMA_BASE = process.env.IDIOMA_TITULOS || "es-ES";

// A dónde se cae cuando TMDB no tiene la traducción. Es una constante y no una
// variable: es-ES es el único idioma con cobertura completa medida (es-AR dio 0%
// en la muestra de 60 y /translations solo devuelve ES y MX).
export const IDIOMA_FALLBACK = "es-ES";

// Kill switch. Ver el runbook: cambiar la variable NO afecta a los deployments
// existentes — hace falta un deployment nuevo o un Redeploy.
const FALLBACK_PEDIDO = process.env.FALLBACK_IDIOMA !== "0";

// El fallback SOLO puede cambiar la salida si el idioma base es otro. Con
// es-ES es inerte, y por eso no entra en la huella: si entrara, apagarlo
// abriría un espacio de claves nuevo idéntico al anterior y provocaría un
// arranque frío sin ningún motivo.
export const FALLBACK_ACTIVO = FALLBACK_PEDIDO && IDIOMA_BASE !== IDIOMA_FALLBACK;

// --- Huella de configuración -------------------------------------------------
// Toda clave de cache que guarde `title`, `name` u `overview` la lleva. Sin
// esto, un rollback a es-ES seguiría leyendo títulos mexicanos de las mismas
// claves hasta que expire el TTL, y el rollback no revertiría nada.
//
// Sube al cambiar las señales de `necesitaReparacion` o `fusionarPorCampo`: dos
// resolvers distintos producen contenido distinto bajo la misma configuración.
const RESOLVER_VERSION = "r1";

export const HUELLA_IDIOMA =
  `${IDIOMA_BASE}${FALLBACK_ACTIVO ? "+f" : ""}.${RESOLVER_VERSION}`;

// TANDA 1: los constructores de clave se cablean en MODO COMPATIBLE, o sea con
// huella vacía, para producir exactamente los mismos bytes que antes y no
// provocar ningún arranque frío. En la tanda 2 esto pasa a `HUELLA_IDIOMA` y
// ahí ocurre la única invalidación del plan.
export const HUELLA_EN_CLAVES = "";

// --- Detección: ¿este título vino roto? --------------------------------------
// Las tres señales se evalúan sobre el objeto que `discover` YA devolvió:
// ninguna cuesta una llamada. Medidas sobre 1021 títulos de un Home frío de
// n,d,m: 57 rotos (5,6%), repartidos en 32 de 107 páginas.
//
// La causa de fondo: cuando TMDB no tiene traducción al es-MX NO cae a es-ES,
// cae al título ORIGINAL. Verificado en tv:33238, donde /translations muestra
// la entrada MX vacía y la ES con 258 caracteres de sinopsis.

// Latín básico + suplemento + extendido A/B, puntuación general y símbolos de
// moneda. Todo lo de afuera (hangul, kana, han, cirílico, árabe) es un título
// que no se puede mostrar en una app en español.
const NO_LATINO = /[^\u0000-\u024F\u2000-\u206F\u20A0-\u20BF\s]/;

interface Localizable {
  title?: string;
  name?: string;
  overview?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
}

export function necesitaReparacion(t: Localizable): boolean {
  const titulo = t.title ?? t.name ?? "";
  const original = t.original_title ?? t.original_name ?? "";
  const idioma = t.original_language ?? "";

  // 1. El título quedó en un alfabeto que no se puede mostrar (`런닝맨`).
  if (NO_LATINO.test(titulo)) return true;
  // 2. Sin sinopsis: la ficha queda vacía. Es el más frecuente (54 de 57).
  if (!(t.overview ?? "").trim()) return true;
  // 3. El título ES el original y el idioma original no es español ni inglés:
  //    señal de que no hay traducción.
  //
  //    `en` está excluido A PROPÓSITO y está VERIFICADO con 12 casos. Los 38
  //    títulos (3,7%) donde es-MX devuelve el original inglés son "Monsters,
  //    Inc.", "Moana 2", "WandaVision", "Black Widow", "Game of Thrones": en
  //    Argentina esos SON los nombres publicados. Medido en Disney+: con
  //    "Zootopia 2" la película aparece y con "Zootrópolis 2" no. Repararlos
  //    rompería lo único que funciona.
  if (titulo === original && idioma !== "es" && idioma !== "en" && !!original) return true;

  return false;
}

// --- Reparación: por CAMPO, nunca por objeto ---------------------------------
// Un título al que solo le falta la sinopsis conserva su título es-MX. Si se
// reemplazara el objeto entero se perdería el nombre latinoamericano, que es
// justamente lo que se fue a buscar.
export function fusionarPorCampo<T extends Localizable>(base: T, respaldo: T | undefined): T {
  if (!respaldo) return base;
  const titulo = base.title ?? base.name ?? "";
  const out: T = { ...base };

  if (NO_LATINO.test(titulo)) {
    if (respaldo.title !== undefined) out.title = respaldo.title;
    if (respaldo.name !== undefined) out.name = respaldo.name;
  }
  if (!(base.overview ?? "").trim() && (respaldo.overview ?? "").trim()) {
    out.overview = respaldo.overview;
  }
  return out;
}

// --- La guarda de inercia ----------------------------------------------------
// Se pregunta por la CONFIGURACIÓN, no por si hay títulos rotos. Que con es-ES
// no haya rotos es una propiedad de los datos, no del código, y podría dejar de
// cumplirse; esto no.
export function fallbackInerte(): boolean {
  return !FALLBACK_ACTIVO;
}
