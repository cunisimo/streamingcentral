import { NextRequest, NextResponse } from "next/server";
import { recommendations } from "@/lib/enrich";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const genre = sp.get("genre") || undefined;
  const tipo = (sp.get("tipo") || "all") as MediaType | "all";
  const offset = Number(sp.get("offset") || "0");
  const providers = (sp.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  try {
    const items = await recommendations({ genre, tipo, providers, n: 6, offset });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
