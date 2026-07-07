import { NextRequest, NextResponse } from "next/server";
import { listByCategory } from "@/lib/enrich";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

// Certificación: TMDB solo filtra por certificación en películas, y la base
// argentina está incompleta; usamos la de EE.UU. mapeada como aproximación.
const AGE_CERT: Record<string, string> = { atp: "PG", "13": "PG-13", "16": "R", "18": "NC-17" };

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tipo = (sp.get("tipo") || "movie") as MediaType;
  const genre = sp.get("genre") || undefined;
  const country = sp.get("country") || undefined;
  const age = sp.get("age") || undefined;
  const page = Number(sp.get("page") || "1");
  const providers = (sp.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  const extra = tipo === "movie" && age && AGE_CERT[age]
    ? { certification_country: "US", "certification.lte": AGE_CERT[age] }
    : undefined;
  try {
    const items = await listByCategory({ tipo, genre, country, providers, page, extra });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
