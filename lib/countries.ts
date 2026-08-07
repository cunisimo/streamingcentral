// País "de origen" de un título. Vive acá porque TMDB no da una respuesta
// directa y hay que elegir entre dos campos que se contradicen.

// Idioma principal de cada país. Se usa para dos cosas: filtrar por país en
// discover (with_original_language) y elegir el país representativo de una
// coproducción. Limitación conocida: en países multi-idioma (India) deja afuera
// cine local en otras lenguas.
export const COUNTRY_LANG: Record<string, string> = {
  US: "en", KR: "ko", GB: "en", IT: "it", JP: "ja", FR: "fr", ES: "es",
  MX: "es", DE: "de", AR: "es", BR: "pt", AU: "en", SE: "sv", IN: "hi",
  IS: "is", CA: "en", IE: "en", DK: "da", NO: "no", FI: "fi", NL: "nl",
  BE: "nl", PL: "pl", TR: "tr", CN: "zh", HK: "zh", TW: "zh", TH: "th",
  CL: "es", CO: "es", RU: "ru", IL: "he", ZA: "en", PT: "pt",
};

// Elige UN país para mostrar en la ficha de una coproducción.
//
// TMDB trae dos listas y NO coinciden en el orden. Carancho (argentina, de
// Trapero) devuelve:
//   origin_country      ["KR","CL","FR","ES","AR"]   ← Corea del Sur primero
//   production_countries ["AR","CL","FR","KR","ES"]  ← Argentina primero
// Tomar `origin_country[0]`, como se hacía antes, la mostraba como coreana.
// Ninguna de las dos listas viene ordenada por "país principal", así que el
// desempate lo da el idioma original: entre los coproductores, gana el primero
// cuyo idioma coincida con `original_language`. Para Carancho (es) → AR.
//
// Verificado además contra El secreto de sus ojos y La historia oficial (ambas
// daban ES y ahora dan AR), y sin regresiones en Parásitos, Ciudad de Dios,
// Your Name, Cinema Paradiso, Intocable y El laberinto del fauno.
export function primaryCountry(d: {
  production_countries?: { iso_3166_1: string }[];
  origin_country?: string[];
  original_language?: string;
}): string | null {
  const produccion = (d.production_countries ?? []).map((c) => c.iso_3166_1);
  const lista = produccion.length ? produccion : (d.origin_country ?? []);
  if (!lista.length) return null;
  const porIdioma = lista.find((c) => COUNTRY_LANG[c] === d.original_language);
  return porIdioma ?? lista[0];
}
