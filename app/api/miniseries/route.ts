import { NextRequest, NextResponse } from "next/server";
import { miniseriesLista } from "@/lib/enrich";
import type { PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

// Una página de /lista/miniseries. Misma forma que /api/latest (`providers` +
// `page`), que es el otro endpoint paginado de la app.
//
// `hayMas` viaja en la respuesta y no se deduce de `items.length`: el filtro
// estricto de plataformas puede achicar una página, y si el cliente cortara por
// "vinieron menos de 20" dejaría el resto del catálogo sin mostrar.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const providers = (sp.get("providers")?.split(",").filter(Boolean) || []) as PlatformCode[];
  const page = Number(sp.get("page") || "1");
  try {
    return NextResponse.json(await miniseriesLista(providers, page));
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [], hayMas: false }, { status: 500 });
  }
}
