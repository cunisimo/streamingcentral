import { NextRequest, NextResponse } from "next/server";
import { buildTop } from "@/lib/top";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const tipo: MediaType = q.get("tipo") === "tv" ? "tv" : "movie";
  const providers = (q.get("providers") || "")
    .split(",").map((s) => s.trim()).filter(Boolean) as PlatformCode[];
  try {
    return NextResponse.json(await buildTop(tipo, providers));
  } catch (e) {
    return NextResponse.json({ error: String(e), mine: [], others: [] }, { status: 500 });
  }
}
