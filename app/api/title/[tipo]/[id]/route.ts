import { NextRequest, NextResponse } from "next/server";
import { detail } from "@/lib/enrich";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { tipo: string; id: string } }) {
  try {
    const d = await detail(params.tipo as MediaType, Number(params.id));
    return NextResponse.json(d);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
