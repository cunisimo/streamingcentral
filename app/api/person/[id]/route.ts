import { NextRequest, NextResponse } from "next/server";
import { disponibilidadFilmografia, personFilmography, personFilmographyLegado } from "@/lib/enrich";
import { responderFilmografia } from "@/lib/filmografia-ruta";
import { conCors, opcionesCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

// Contrato VERSIONADO (issue #25), decidido en lib/filmografia-ruta.ts:
//
//   sin `filmografia`         → v1 `{ person, titles, hidden }` (bundles Android
//                                anteriores): hasta 40 obras evaluadas, como antes.
//   ?filmografia=v2           → filmografía completa como datos básicos + la
//                                disponibilidad del bloque inicial visible (≤ 12).
//   ?filmografia=v2&items=…   → "Ver más": SÓLO la disponibilidad de esas obras
//                                (máx. 24). No vuelve a pedir la persona ni sus
//                                créditos: el cliente ya los tiene.
//
// Una petición ejecuta una sola versión. Sin `maxDuration` propio a propósito:
// el trabajo está acotado por bloque, y un techo alto no es el mecanismo para
// permitir trabajo de más.
async function manejar(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await responderFilmografia(params.id, req.nextUrl.searchParams, {
    v1: personFilmographyLegado, v2: personFilmography, items: disponibilidadFilmografia,
  });
  return NextResponse.json(r.body, { status: r.status });
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
