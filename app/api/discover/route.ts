import { NextRequest, NextResponse } from "next/server";
import { listByCategory } from "@/lib/enrich";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tipo = (sp.get("tipo") || "movie") as MediaType;
  const genre = sp.get("genre") || undefined;
  const country = sp.get("country") || undefined;
  const page = Number(sp.get("page") || "1");
  const providers = (sp.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  try {
    const items = await listByCategory({ tipo, genre, country, providers, page });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
