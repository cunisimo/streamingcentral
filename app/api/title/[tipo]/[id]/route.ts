import { NextRequest, NextResponse } from "next/server";
import { detail } from "@/lib/enrich";
import type { MediaType, PlatformCode } from "@/lib/types";
import { conCors, opcionesCors } from "@/lib/cors";
import { respuestaDeErrorTmdb } from "@/lib/tmdb-http";

export const dynamic = "force-dynamic";

async function manejar(req: NextRequest, { params }: { params: { tipo: string; id: string } }) {
  // `providers` acota los relacionados ("También te puede interesar") a las
  // plataformas del usuario. La ficha en sí NO se filtra: se muestra completa
  // aunque el título no esté en ninguna (se llega por búsqueda, por Mi lista o
  // por un link directo).
  const providers = (req.nextUrl.searchParams.get("providers")?.split(",").filter(Boolean) ?? []) as PlatformCode[];
  try {
    const d = await detail(params.tipo as MediaType, Number(params.id), providers);
    return NextResponse.json(d);
  } catch (e) {
    // Etapa 3.a (#19, H8): si el DATO PRINCIPAL falló por TMDB, la respuesta
    // lo dice —503 con Retry-After, o 404— y el cliente distingue "TMDB no
    // responde" de "sin conexión". Un error propio sigue siendo 500.
    const r = respuestaDeErrorTmdb(e);
    if (r) return NextResponse.json(r.body, { status: r.status, headers: r.headers });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
