import { NextRequest, NextResponse } from "next/server";
import { getRoulettePicks, esEscenario } from "@/lib/roulette";
import type { PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const escenarioRaw = q.get("escenario") ?? "solo";
  const escenario = esEscenario(escenarioRaw) ? escenarioRaw : "solo";
  const providers = (q.get("providers") || "")
    .split(",").map((s) => s.trim()).filter(Boolean) as PlatformCode[];
  const excluir = (q.get("excluir") || "")
    .split(",").map((s) => Number(s.trim())).filter(Number.isFinite);

  try {
    return NextResponse.json({ picks: await getRoulettePicks({ escenario, providers, excluir }) });
  } catch (e) {
    return NextResponse.json({ error: String(e), picks: [] }, { status: 500 });
  }
}
