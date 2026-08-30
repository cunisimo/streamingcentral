import { NextRequest, NextResponse } from "next/server";
import { latestReleases } from "@/lib/enrich";
import { normalizarPagina } from "@/lib/ultimos";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const providers = (sp.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  const tipo: MediaType = sp.get("tipo") === "tv" ? "tv" : "movie";
  // 🔴 `Number(...)` a secas dejaba entrar `NaN`: con `?page=x` la condición de
  // cobertura de la orquestación no se cumplía nunca y se recorría `total_pages`
  // completo, o sea todo el catálogo de TMDB para devolver nada. El contrato es
  // uno solo y vive en `lib/ultimos.ts`: entero finito >= 1, o la página 1.
  const page = normalizarPagina(sp.get("page"));
  try {
    return NextResponse.json({ items: await latestReleases(providers, tipo, page) });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
