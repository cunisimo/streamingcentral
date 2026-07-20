import { NextRequest, NextResponse } from "next/server";
import { listByCategory } from "@/lib/enrich";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

// Certificación: TMDB solo filtra por certificación en películas, y la base
// argentina está incompleta; usamos la de EE.UU. mapeada como aproximación.
const AGE_CERT: Record<string, string> = { atp: "PG", "13": "PG-13", "16": "R", "18": "NC-17" };

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
  const country = sp.get("country") || undefined;
  const age = sp.get("age") || undefined;
  const year = sp.get("year") || undefined;
  const runtime = sp.get("runtime") || undefined;
  const page = Number(sp.get("page") || "1");
  const providers = (sp.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  const extra: Record<string, string> = {};
  if (tipo === "movie" && age && AGE_CERT[age]) {
    extra.certification_country = "US";
    extra["certification.lte"] = AGE_CERT[age];
  }
  if (year) extra[tipo === "movie" ? "primary_release_year" : "first_air_date_year"] = year;
  if (runtime && RUNTIME[runtime]) Object.assign(extra, RUNTIME[runtime]);
  try {
    const items = await listByCategory({
      tipo, genre, country, providers, page,
      extra: Object.keys(extra).length ? extra : undefined,
    });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
