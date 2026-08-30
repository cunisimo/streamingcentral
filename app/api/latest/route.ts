import { NextRequest, NextResponse } from "next/server";
import { latestReleases } from "@/lib/enrich";
import type { MediaType, PlatformCode } from "@/lib/types";
import { conCors, opcionesCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

async function manejar(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const providers = (sp.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  const tipo: MediaType = sp.get("tipo") === "tv" ? "tv" : "movie";
  const page = Number(sp.get("page") || "1");
  try {
    return NextResponse.json({ items: await latestReleases(providers, tipo, page) });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
