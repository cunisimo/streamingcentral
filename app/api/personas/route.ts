import { NextRequest, NextResponse } from "next/server";
import { popularPeople } from "@/lib/enrich";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") || "1"));
  try {
    const res = await popularPeople(page);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: String(e), people: [], hasMore: false }, { status: 500 });
  }
}
