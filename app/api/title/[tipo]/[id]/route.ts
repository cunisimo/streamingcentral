import { NextRequest, NextResponse } from "next/server";
import { detail } from "@/lib/enrich";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { tipo: string; id: string } }) {
  // `providers` acota los relacionados ("También te puede interesar") a las
  // plataformas del usuario. La ficha en sí NO se filtra: se muestra completa
  // aunque el título no esté en ninguna (se llega por búsqueda, por Mi lista o
  // por un link directo).
  const providers = (req.nextUrl.searchParams.get("providers")?.split(",").filter(Boolean) ?? []) as PlatformCode[];
  try {
    const d = await detail(params.tipo as MediaType, Number(params.id), providers);
    return NextResponse.json(d);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
