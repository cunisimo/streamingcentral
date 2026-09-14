import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/enrich";
import { acotarQ } from "@/lib/limites-entrada";
import type { PlatformCode } from "@/lib/types";
import { conCors, opcionesCors } from "@/lib/cors";
import { respuestaDeErrorTmdb } from "@/lib/tmdb-http";

export const dynamic = "force-dynamic";

async function manejar(req: NextRequest) {
  // Con tope (Etapa 1, #18): sin él, cada cadena distinta de cualquier largo
  // era una entrada de caché y hasta 7 llamadas a TMDB. Se trunca, no se
  // rechaza; el número y los títulos que tienen que pasar están en el test.
  const q = acotarQ(req.nextUrl.searchParams.get("q") || "");
  if (!q) return NextResponse.json({ titles: [], people: [] });
  // `providers` NO filtra acá (buscás por nombre, querés verlo aunque no lo
  // tengas): solo ordena, poniendo primero lo que sí está en tus plataformas.
  const providers = (req.nextUrl.searchParams.get("providers")?.split(",").filter(Boolean)
    || []) as PlatformCode[];
  try {
    const res = await search(q, providers);
    return NextResponse.json(res);
  } catch (e) {
    // Etapa 3.a (#19, H8): las páginas de búsqueda son el dato principal; si
    // fallaron por TMDB, 503 con Retry-After y motivo. Un error propio, 500.
    const r = respuestaDeErrorTmdb(e);
    if (r) return NextResponse.json({ ...r.body, titles: [], people: [] }, { status: r.status, headers: r.headers });
    return NextResponse.json({ error: String(e), titles: [], people: [] }, { status: 500 });
  }
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
