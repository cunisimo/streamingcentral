import { NextRequest, NextResponse } from "next/server";
import { latestReleases } from "@/lib/enrich";
import type { PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const providers = (req.nextUrl.searchParams.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  try {
    return NextResponse.json({ items: await latestReleases(providers) });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
