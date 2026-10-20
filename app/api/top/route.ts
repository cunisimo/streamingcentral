import { NextRequest, NextResponse } from "next/server";
import { buildTop } from "@/lib/top";
import type { MediaType, PlatformCode } from "@/lib/types";
import { conCors, opcionesCors } from "@/lib/cors";
import { conDescartesRegistrados } from "@/lib/fallos-tmdb";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function manejar(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const tipo: MediaType = q.get("tipo") === "tv" ? "tv" : "movie";
  const providers = (q.get("providers") || "")
    .split(",").map((s) => s.trim()).filter(Boolean) as PlatformCode[];
  try {
    const r = await conDescartesRegistrados("api/top", () => buildTop(tipo, providers));
    // No se pudieron leer las publicaciones: es un ERROR (503, la vista
    // ofrece reintentar), nunca un Top vacío ni otro ranking. Lo que el dueño
    // no publicó llega como bloque `sin-publicar` dentro de un 200.
    if (!r.ok) {
      return NextResponse.json(
        { error: r.error, mine: [], others: [], fallos: 1, degradado: true },
        { status: 503 },
      );
    }
    return NextResponse.json(r.payload);
  } catch (e) {
    // Lo que `componerTop` no cubre: un fallo del propio handler.
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
