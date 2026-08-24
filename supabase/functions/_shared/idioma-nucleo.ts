// Núcleo de la reparación de idioma. UNA sola implementación, compartida entre
// los dos runtimes.
//
// POR QUÉ VIVE ACÁ Y NO EN `lib/`. La Edge Function corre en Deno y no puede
// importar `lib/idioma.ts`: ese módulo usa `node:async_hooks` para las métricas
// por request y arrastra el single-flight. Lo que sí es portable es el núcleo:
// el predicado y la fusión, que son funciones puras sin una sola dependencia.
//
// La alternativa era copiar el predicado en la Edge Function, y es exactamente
// lo que el proyecto viene evitando: "Ninguna superficie implementa su propia
// variante — esa era la forma segura de que divergieran". Un título roto que la
// app repara y el sync no, o al revés, es un bug que nadie encuentra mirando un
// solo lado.
//
// REGLAS DE ESTE ARCHIVO, para que siga sirviendo a los dos:
//   - CERO imports. Ni de Node, ni de Deno, ni relativos.
//   - Nada de `process`, `Deno`, `Buffer` ni APIs de plataforma.
//   - Los imports que lo apunten llevan extensión `.ts` explícita, que es lo que
//     Deno exige y lo que este repo ya usa (`allowImportingTsExtensions`).
//
// `lib/idioma.ts` re-exporta todo esto, así que el resto de la app no cambia:
// sigue importando de donde importaba.

// Alfabeto latino extendido + puntuación + monedas. Lo que caiga afuera es un
// título que TMDB no tradujo (`런닝맨`, `破产姐妹`).
export const NO_LATINO = /[^\u0000-\u024F\u2000-\u206F\u20A0-\u20BF\s]/;

export interface Localizable {
  title?: string;
  name?: string;
  overview?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
}

export interface Reparacion {
  titulo: boolean;
  sinopsis: boolean;
}

/**
 * Las TRES señales, evaluadas sobre el objeto que TMDB ya devolvió. Ninguna
 * cuesta una llamada extra.
 */
export function queReparar(t: Localizable): Reparacion {
  const titulo = t.title ?? t.name ?? "";
  const original = t.original_title ?? t.original_name ?? "";
  const idioma = t.original_language ?? "";

  const noLatino = NO_LATINO.test(titulo);

  // El título ES el original y el idioma original no es español ni inglés.
  //
  // `en` está excluido A PROPÓSITO y VERIFICADO con 12 casos: los 38 títulos
  // (3,7%) donde es-MX devuelve el original inglés son "Monsters, Inc.",
  // "Moana 2", "WandaVision", "Black Widow", "Game of Thrones", y en Argentina
  // esos SON los nombres publicados. Medido en Disney+: "Zootopia 2" aparece,
  // "Zootrópolis 2" no.
  const cayoAlOriginal = !!original && titulo === original
    && idioma !== "es" && idioma !== "en";

  return { titulo: noLatino || cayoAlOriginal, sinopsis: !(t.overview ?? "").trim() };
}

export function necesitaReparacion(t: Localizable): boolean {
  const r = queReparar(t);
  return r.titulo || r.sinopsis;
}

/**
 * Fusión POR CAMPO, con el MISMO predicado. Un título al que solo le falta la
 * sinopsis conserva su título es-MX.
 *
 * DEVUELVE LA MISMA REFERENCIA si nada mejoró. Es lo que permite contar como
 * "reparado" solo lo que de verdad cambió.
 */
export function fusionarPorCampo<T extends Localizable>(
  base: T, respaldo: Localizable | undefined | null,
): T {
  if (!respaldo) return base;
  const r = queReparar(base);
  if (!r.titulo && !r.sinopsis) return base;

  let cambio = false;
  const out: T = { ...base };

  if (r.titulo) {
    const t = respaldo.title ?? respaldo.name ?? "";
    // El respaldo también puede venir roto (una coreana sin traducción ni al
    // es-ES). Si no mejora, no se toca: mejor el original que un vacío.
    const mismo = t === (base.title ?? base.name ?? "");
    if (t && !NO_LATINO.test(t) && !mismo) {
      if (respaldo.title !== undefined) out.title = respaldo.title;
      if (respaldo.name !== undefined) out.name = respaldo.name;
      cambio = true;
    }
  }
  if (r.sinopsis && (respaldo.overview ?? "").trim()) {
    out.overview = respaldo.overview;
    cambio = true;
  }
  return cambio ? out : base;
}
