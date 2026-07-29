import { NextRequest, NextResponse } from "next/server";
import { latestReleases } from "@/lib/enrich";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const providers = (sp.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  const tipo: MediaType = sp.get("tipo") === "tv" ? "tv" : "movie";
  const page = Number(sp.get("page") || "1");
  try {
    return NextResponse.json({ items: await latestReleases(providers, tipo, page) });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
