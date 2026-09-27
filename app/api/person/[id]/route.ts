import { NextRequest, NextResponse } from "next/server";
import { personFilmography } from "@/lib/enrich";
import type { PlatformCode } from "@/lib/types";
import { conCors, opcionesCors } from "@/lib/cors";

export const dynamic = "force-dynamic";
// La filmografía se enriquece COMPLETA (sin el viejo recorte a 40): en frío,
// una carrera de ~230 obras midió ~350 llamadas a TMDB y 13,5 s en local.
// Mismo techo que las otras rutas que enriquecen cientos de títulos.
export const maxDuration = 60;

async function manejar(req: NextRequest, { params }: { params: { id: string } }) {
  const providers = (req.nextUrl.searchParams.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  try {
    const res = await personFilmography(Number(params.id), providers);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
