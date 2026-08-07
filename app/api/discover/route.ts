import { NextRequest, NextResponse } from "next/server";
import { listByCategory } from "@/lib/enrich";
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
const COUNTRY_LANG: Record<string, string> = {
  US: "en", KR: "ko", GB: "en", IT: "it", JP: "ja", FR: "fr", ES: "es",
  MX: "es", DE: "de", AR: "es", BR: "pt", AU: "en", SE: "sv", IN: "hi",
  IS: "is", CA: "en", IE: "en", DK: "da", NO: "no", FI: "fi", NL: "nl",
  BE: "nl", PL: "pl", TR: "tr", CN: "zh", HK: "zh", TW: "zh", TH: "th",
  CL: "es", CO: "es", RU: "ru", IL: "he", ZA: "en", PT: "pt",
};

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
