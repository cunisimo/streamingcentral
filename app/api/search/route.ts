import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/enrich";
import type { PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") || "";
  const providers = (sp.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  if (!q.trim()) return NextResponse.json({ titles: [], people: [] });
  try {
    const res = await search(q, providers);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: String(e), titles: [], people: [] }, { status: 500 });
  }
}
