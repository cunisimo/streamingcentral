import { NextResponse } from "next/server";
import { genreCovers } from "@/lib/enrich";
import { conCors, opcionesCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

async function manejar() {
  try {
    return NextResponse.json({ covers: await genreCovers() });
  } catch (e) {
    return NextResponse.json({ error: String(e), covers: {} }, { status: 500 });
  }
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
