import { NextRequest, NextResponse } from "next/server";
import { searchMulti } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q.trim()) return NextResponse.json({ items: [] });
  try {
    const res = await searchMulti(q);
    const items = res.results
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .slice(0, 8)
      .map((r) => {
        const t = r as { id: number; media_type: "movie" | "tv"; title?: string; name?: string; release_date?: string; first_air_date?: string };
        return { id: t.id, tipo: t.media_type, titulo: t.title || t.name || "", year: (t.release_date || t.first_air_date || "").slice(0, 4) };
      });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
