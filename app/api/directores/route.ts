import { NextResponse } from "next/server";
import { directorCards } from "@/lib/enrich";
import { conCors, opcionesCors } from "@/lib/cors";
import { conDescartesRegistrados } from "@/lib/fallos-tmdb";

export const dynamic = "force-dynamic";

async function manejar() {
  try {
    // Etapa 3.a: ruta independiente; los descartes de TMDB (si los hubo)
    // quedan resumidos en UNA línea, sin cambiar la respuesta.
    return NextResponse.json({ people: await conDescartesRegistrados("api/directores", () => directorCards()) });
  } catch (e) {
    return NextResponse.json({ error: String(e), people: [] }, { status: 500 });
  }
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
