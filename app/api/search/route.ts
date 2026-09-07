import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/enrich";
import type { PlatformCode } from "@/lib/types";
import { conCors, opcionesCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

async function manejar(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q.trim()) return NextResponse.json({ titles: [], people: [] });
  // `providers` NO filtra acá (buscás por nombre, querés verlo aunque no lo
  // tengas): solo ordena, poniendo primero lo que sí está en tus plataformas.
  const providers = (req.nextUrl.searchParams.get("providers")?.split(",").filter(Boolean)
    || []) as PlatformCode[];
  try {
    const res = await search(q, providers);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: String(e), titles: [], people: [] }, { status: 500 });
  }
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
