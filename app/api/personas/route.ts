import { NextRequest, NextResponse } from "next/server";
import { popularPeople } from "@/lib/enrich";
import { conCors, opcionesCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

async function manejar(req: NextRequest) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || "1"));
  try {
    const res = await popularPeople(page);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: String(e), people: [], hasMore: false }, { status: 500 });
  }
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
