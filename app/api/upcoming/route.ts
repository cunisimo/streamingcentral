import { NextRequest, NextResponse } from "next/server";
import {
  upcomingForRefs, upcomingHome, upcomingList, upcomingPagina, upcomingThisMonth,
} from "@/lib/upcoming";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Elementos por tanda de `/proximamente`. La primera carga y el "Cargar más". */
const POR_PAGINA = 20;

// GET /api/upcoming
//   ?mediaType=movie|tv
//   ?page=1                    (paginado de la agenda seleccionada)
//   ?mix=1&limit=15            (el riel del Home)
//   ?platform=n|d|m|...        (código interno de plataforma)
//   ?month=YYYY-MM             (estrenos de ese mes)
//   ?items=movie:123,tv:456    (cruce con la Watchlist del usuario)
//
// `items` tiene prioridad (el browser resuelve sus refs por RLS y los manda acá).
//
// 🔴 LA PAGINACIÓN ES DEL SERVIDOR Y VA SOBRE LA SELECCIÓN, no sobre la agenda
// cruda. Cortar 100 filas ordenadas por fecha en el navegador era el problema, no
// la solución: los primeros cinco días se comían el cupo entero y no había tanda
// que arreglara eso. Acá se lee la agenda completa (una consulta, y traerla
// entera cuesta lo mismo que traer 100), se aplica el criterio editorial y se
// devuelve el tramo pedido. Ver `lib/proximamente.ts`.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mediaType = (sp.get("mediaType") as MediaType) || undefined;
  const platform = (sp.get("platform") as PlatformCode) || undefined;
  const month = sp.get("month") || undefined;
  const itemsRaw = sp.get("items") || "";
  const limitRaw = Number(sp.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : undefined;
  // Se normaliza como en `/api/latest`: entero >= 1, o 1. Un `?page=abc` no es un
  // error del usuario que valga un 400, es una página 1.
  const pageRaw = Number(sp.get("page"));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

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
      return NextResponse.json({ items: await upcomingHome(limit ?? 15) });
    }
    // `platform` no pasa por la selección: es el filtro por plataforma suelta,
    // que hoy no tiene vista propia y conserva su semántica de siempre.
    if (platform) {
      return NextResponse.json({ items: await upcomingList({ mediaType, platform, limit }) });
    }
    const { items, hayMas, total } = await upcomingPagina({
      mediaType, pagina: page, porPagina: POR_PAGINA,
    });
    return NextResponse.json({ items, hayMas, total, page });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
