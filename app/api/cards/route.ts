import { NextRequest, NextResponse } from "next/server";
import { cardsByIds } from "@/lib/enrich";
import type { MediaType } from "@/lib/types";
import { conCors, opcionesCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

async function manejar(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("items") || "";
  const pairs = raw.split(",").map((s) => s.trim()).filter(Boolean)
    .map((s) => {
      const [tipo, id] = s.split(":");
      return { tipo: tipo as MediaType, id: Number(id) };
    })
    .filter((p) => (p.tipo === "movie" || p.tipo === "tv") && Number.isFinite(p.id));
  try {
    return NextResponse.json({ items: await cardsByIds(pairs) });
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
