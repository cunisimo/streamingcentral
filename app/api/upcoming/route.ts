import { NextRequest, NextResponse } from "next/server";
import { upcomingList, upcomingForRefs, upcomingThisMonth, upcomingMix } from "@/lib/upcoming";
import type { MediaType, PlatformCode } from "@/lib/types";
import { conCors, opcionesCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

// GET /api/upcoming
//   ?mediaType=movie|tv
//   ?platform=n|d|m|...        (código interno de plataforma)
//   ?month=YYYY-MM             (estrenos de ese mes)
//   ?items=movie:123,tv:456    (cruce con la Watchlist del usuario)
// `items` tiene prioridad (el browser resuelve sus refs por RLS y los manda acá).
async function manejar(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mediaType = (sp.get("mediaType") as MediaType) || undefined;
  const platform = (sp.get("platform") as PlatformCode) || undefined;
  const month = sp.get("month") || undefined;
  const itemsRaw = sp.get("items") || "";
  const limitRaw = Number(sp.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : undefined;

  try {
    if (itemsRaw) {
      const refs = itemsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        .map((s) => {
          const [tipo, id] = s.split(":");
          return { tipo: tipo as MediaType, tmdb_id: Number(id) };
        })
        .filter((r) => (r.tipo === "movie" || r.tipo === "tv") && Number.isFinite(r.tmdb_id));
      return NextResponse.json({ items: await upcomingForRefs(refs) });
    }
    if (month) {
      return NextResponse.json({ items: await upcomingThisMonth(month, mediaType) });
    }
    if (sp.get("mix") === "1") {
      return NextResponse.json({ items: await upcomingMix(limit ?? 15) });
    }
    return NextResponse.json({ items: await upcomingList({ mediaType, platform, limit }) });
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
