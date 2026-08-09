import { NextRequest, NextResponse } from "next/server";
import { ingestLatestWeek } from "@/lib/netflix-top10";

export const dynamic = "force-dynamic";
// Resolver títulos nuevos son 1-2 requests a TMDB cada uno; con 20 títulos
// nuevos (la primera corrida) puede pasarse de los 10s del default.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel Cron manda `Authorization: Bearer $CRON_SECRET`. Sin el secreto
  // configurado, la ruta queda cerrada: mejor no ingestar que dejarla abierta.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await ingestLatestWeek()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
