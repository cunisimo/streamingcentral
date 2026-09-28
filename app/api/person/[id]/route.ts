import { NextRequest, NextResponse } from "next/server";
import { disponibilidadFilmografia, personFilmography } from "@/lib/enrich";
import { MAX_POR_PEDIDO, parsearClave } from "@/lib/filmografia";
import type { PlatformCode } from "@/lib/types";
import { conCors, opcionesCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

// Dos usos de la MISMA ruta (issue #25, carga progresiva):
//
//   ?providers=n,d,m        → la filmografía completa como datos básicos + la
//                              disponibilidad del bloque inicial visible (≤ 12).
//   ?items=movie:1,tv:2     → "Ver más": SÓLO la disponibilidad de esas obras
//                              (máx. 24). No vuelve a pedir la persona ni sus
//                              créditos: el cliente ya los tiene.
//
// Sin `maxDuration` propio a propósito: el trabajo está acotado por bloque, y
// un techo alto no es el mecanismo para permitir trabajo de más.
async function manejar(req: NextRequest, { params }: { params: { id: string } }) {
  const items = req.nextUrl.searchParams.get("items");
  if (items !== null) {
    const claves = [...new Set(items.split(",").map((s) => s.trim()).filter(Boolean))];
    if (!claves.length || claves.length > MAX_POR_PEDIDO || claves.some((k) => !parsearClave(k))) {
      return NextResponse.json({ error: `items: entre 1 y ${MAX_POR_PEDIDO} claves tipo:id` }, { status: 400 });
    }
    try {
      return NextResponse.json(await disponibilidadFilmografia(claves));
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }
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
