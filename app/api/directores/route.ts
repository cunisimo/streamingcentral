import { NextResponse } from "next/server";
import { directorCards } from "@/lib/enrich";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ people: await directorCards() });
  } catch (e) {
    return NextResponse.json({ error: String(e), people: [] }, { status: 500 });
  }
}
