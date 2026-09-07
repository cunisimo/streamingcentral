import { NextRequest, NextResponse } from "next/server";
import { buildTop } from "@/lib/top";
import type { MediaType, PlatformCode } from "@/lib/types";
import { conCors, opcionesCors } from "@/lib/cors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function manejar(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const tipo: MediaType = q.get("tipo") === "tv" ? "tv" : "movie";
  const providers = (q.get("providers") || "")
    .split(",").map((s) => s.trim()).filter(Boolean) as PlatformCode[];
  try {
    return NextResponse.json(await buildTop(tipo, providers));
  } catch (e) {
    // buildTop envuelve cada bloque en `safe`, así que en producción no
    // rechaza: la degradación viaja en el payload (`degradado`/`fallos`) con
    // 200. Este catch queda para lo que `safe` NO cubre — fuera de producción
    // `safe` re-lanza a propósito, y para cualquier fallo del propio handler.
    console.error("[api/top] buildTop rechazó —", e);
    return NextResponse.json(
      { error: String(e), mine: [], others: [], fallos: 1, degradado: true },
      { status: 500 },
    );
  }
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
