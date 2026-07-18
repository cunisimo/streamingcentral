import { NextRequest, NextResponse } from "next/server";
import { cardsByIds } from "@/lib/enrich";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("items") || "";
  const pairs = raw.split(",").map((s) => s.trim()).filter(Boolean)
    .map((s) => {
      const [tipo, id] = s.split(":");
      return { tipo: tipo as MediaType, id: Number(id) };
    })
    .filter((p) => (p.tipo === "movie" || p.tipo === "tv") && Number.isFinite(p.id));
  try {
    return NextResponse.json({ items: await cardsByIds(pairs) });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
