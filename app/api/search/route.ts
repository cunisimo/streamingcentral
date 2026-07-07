import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/enrich";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q.trim()) return NextResponse.json({ titles: [], people: [] });
  try {
    const res = await search(q);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: String(e), titles: [], people: [] }, { status: 500 });
  }
}
