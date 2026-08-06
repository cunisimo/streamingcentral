import { NextRequest, NextResponse } from "next/server";
import { composeHome } from "@/lib/home";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

// El Home entero se arma en este único request: ~11 fuentes y del orden de 300
// llamadas a TMDB (1 providersOf por título), más un round-trip a Upstash por
// cada `cached()`. Con cache fría eso se midió en ~10 s, justo en el default de
// Vercel (10 s): pasarse significa 504 y el Home entero muerto, no un riel
// degradado. El margen no es una excusa para ser lento — composeHome ya pide
// todas las fuentes en paralelo (lib/home.ts) — es el colchón para el peor caso.
export const maxDuration = 60;

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
    // composeHome envuelve cada fuente en `safe`, así que en producción no
    // rechaza: la degradación viaja en el payload (`degradado`/`fallos`) con 200.
    // Este catch queda para lo que `safe` NO cubre — fuera de producción `safe`
    // re-lanza a propósito (un bug propio tiene que verse), y para cualquier
    // fallo del propio handler.
    console.error("[api/home] composeHome rechazó —", e);
    return NextResponse.json(
      { error: String(e), hero: [], rails: [], fallos: 1, degradado: true },
      { status: 500 },
    );
  }
}
