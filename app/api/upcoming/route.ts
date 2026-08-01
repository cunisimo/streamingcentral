import { NextRequest, NextResponse } from "next/server";
import { upcomingList, upcomingForRefs, upcomingThisMonth } from "@/lib/upcoming";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/upcoming
//   ?mediaType=movie|tv
//   ?platform=n|d|m|...        (código interno de plataforma)
//   ?month=YYYY-MM             (estrenos de ese mes)
//   ?items=movie:123,tv:456    (cruce con la Watchlist del usuario)
// `items` tiene prioridad (el browser resuelve sus refs por RLS y los manda acá).
export async function GET(req: NextRequest) {
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
    return NextResponse.json({ items: await upcomingList({ mediaType, platform, limit }) });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
