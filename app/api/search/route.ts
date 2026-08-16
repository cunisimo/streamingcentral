import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/enrich";
import type { PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q.trim()) return NextResponse.json({ titles: [], people: [] });
  // `providers` NO filtra acá (buscás por nombre, querés verlo aunque no lo
  // tengas): solo ordena, poniendo primero lo que sí está en tus plataformas.
  const providers = (req.nextUrl.searchParams.get("providers")?.split(",").filter(Boolean)
    || []) as PlatformCode[];
  try {
    const res = await search(q, providers);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: String(e), titles: [], people: [] }, { status: 500 });
  }
}
