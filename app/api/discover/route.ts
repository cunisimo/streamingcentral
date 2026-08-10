import { NextRequest, NextResponse } from "next/server";
import { listByCategory } from "@/lib/enrich";
import { COUNTRY_LANG } from "@/lib/countries";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

// Certificación: TMDB solo filtra por certificación en películas, y la base
// argentina está incompleta; usamos la de EE.UU. mapeada como aproximación.
// Buckets EXCLUYENTES (no acumulativos): ATP = G|PG (lte=PG), +13 = PG-13 exacto,
// +16 = R exacto. No hay +18: NC-17 casi no existe en el catálogo de streaming.
const AGE_CERT: Record<string, { param: string; value: string }> = {
  atp: { param: "certification.lte", value: "PG" },
  "13": { param: "certification", value: "PG-13" },
  "16": { param: "certification", value: "R" },
};

// País de origen: with_origin_country incluye co-producciones (ej. Angels &
// Demons figura como IT+US). Para traer solo producciones ORIGINARIAS del país
// combinamos origen + idioma original del país, así se excluyen films
// extranjeros rodados/co-producidos ahí (idioma distinto). Nota: en países
// multi-idioma (India) puede dejar afuera cine local en otras lenguas.
// El mapa vive en lib/countries.ts: lo comparte `primaryCountry`, que resuelve
// el país a mostrar en la ficha de una coproducción.

// Década: TMDB no tiene un parámetro de década, pero discover sí acepta rangos
// de fecha, así que se traducen acá — mismo lugar y misma forma que `runtime`.
// El campo cambia según el tipo: las series no tienen primary_release_date.
//
// "pre1970" agrupa todo lo anterior en un solo bucket. Medido el 2026-08-09
// sobre AR + flatrate + las 14 plataformas: de 1930 a 1969 hay 260 películas,
// contra 3133 solo en los 2020. Como décadas sueltas, los 30 y los 40 daban
// 28 y 38 — una grilla casi vacía en cuanto el usuario suma cualquier otro
// filtro. En series directamente no existe nada antes de 1950 (0 y 0), por eso
// el selector no ofrece esas dos décadas cuando el tipo es tv.
function decadeRange(tipo: MediaType, d: string): Record<string, string> | null {
  const campo = tipo === "movie" ? "primary_release_date" : "first_air_date";
  if (d === "pre1970") return { [`${campo}.lte`]: "1969-12-31" };
  const desde = Number(d);
  if (!Number.isInteger(desde) || desde % 10 !== 0 || desde < 1900 || desde > 2100) return null;
  return { [`${campo}.gte`]: `${desde}-01-01`, [`${campo}.lte`]: `${desde + 9}-12-31` };
}

// Duración: buckets simples → rango de minutos de TMDB. En TV, with_runtime
// aplica al minutaje POR EPISODIO, no al total (limitación de TMDB).
const RUNTIME: Record<string, Record<string, string>> = {
  short: { "with_runtime.lte": "90" },
  mid: { "with_runtime.gte": "90", "with_runtime.lte": "150" },
  long: { "with_runtime.gte": "150" },
};

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tipo = (sp.get("tipo") || "movie") as MediaType;
  const genre = sp.get("genre") || undefined;
  const genre2 = sp.get("genre2") || undefined;
  const country = sp.get("country") || undefined;
  const age = sp.get("age") || undefined;
  const year = sp.get("year") || undefined;
  const runtime = sp.get("runtime") || undefined;
  const decade = sp.get("decade") || undefined;
  const page = Number(sp.get("page") || "1");
  const providers = (sp.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  const extra: Record<string, string> = {};
  if (tipo === "movie" && age && AGE_CERT[age]) {
    extra.certification_country = "US";
    extra[AGE_CERT[age].param] = AGE_CERT[age].value;
  }
  if (country && COUNTRY_LANG[country]) extra.with_original_language = COUNTRY_LANG[country];
  if (year) extra[tipo === "movie" ? "primary_release_year" : "first_air_date_year"] = year;
  if (runtime && RUNTIME[runtime]) Object.assign(extra, RUNTIME[runtime]);
  // Un valor inválido se ignora (decadeRange devuelve null): la ruta es pública
  // y preferimos listar sin filtrar antes que devolver un error.
  if (decade) Object.assign(extra, decadeRange(tipo, decade) ?? {});
  try {
    const items = await listByCategory({
      tipo, genre, genre2, country, providers, page,
      // Páginas de categoría: la animación se sirve en su propio riel de cruce
      // ("Terror en dibujos"), no mezclada en el listado principal. Lo familiar
      // sí se muestra: acá el usuario ya eligió un género a propósito.
      scope: "browse",
      extra: Object.keys(extra).length ? extra : undefined,
    });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
