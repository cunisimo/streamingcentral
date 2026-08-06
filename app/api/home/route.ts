import { NextRequest, NextResponse } from "next/server";
import { composeHome } from "@/lib/home";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

// `t` serializa el toggle Películas/Series de cada riel: "accion:movie,scifi:tv".
// Cambiar cualquiera reconstruye el Home entero (misma URL, otro valor de `t`).
function parseTypes(raw: string | null): Record<string, MediaType> {
  const out: Record<string, MediaType> = {};
  for (const par of raw?.split(",").filter(Boolean) ?? []) {
    const [k, v] = par.split(":");
    if (k && (v === "movie" || v === "tv")) out[k] = v;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const providers = (sp.get("providers")?.split(",").filter(Boolean) ?? []) as PlatformCode[];
  try {
    return NextResponse.json(await composeHome({ providers, types: parseTypes(sp.get("t")) }));
  } catch (e) {
    return NextResponse.json({ error: String(e), hero: [], rails: [] }, { status: 500 });
  }
}
