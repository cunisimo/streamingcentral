import { NextResponse } from "next/server";
import { genreCovers } from "@/lib/enrich";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ covers: await genreCovers() });
  } catch (e) {
    return NextResponse.json({ error: String(e), covers: {} }, { status: 500 });
  }
}
