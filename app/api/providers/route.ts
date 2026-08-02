import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { TMDB_IMG } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

// Plataformas para el onboarding, desde la tabla `providers`. Filtra los canales
// revendedores (nombres con "Channel"). Ordenado por display_priority.
// (Multi-región: la tabla es AR por ahora; se agregará ?region= en fase 2.)
export async function GET() {
  const sb = supabaseServer();
  if (!sb) return NextResponse.json({ providers: [] });
  try {
    const { data, error } = await sb
      .from("providers")
      .select("id, name, logo_path, display_priority")
      .order("display_priority", { ascending: true });
    if (error) throw new Error(error.message);
    const providers = (data ?? [])
      .filter((p: { name: string }) => !/channel/i.test(p.name))
      .map((p: { id: number; name: string; logo_path: string | null }) => ({
        id: p.id,
        name: p.name.trim(),
        logo: p.logo_path ? `${TMDB_IMG}/w92${p.logo_path}` : null,
      }));
    return NextResponse.json({ providers });
  } catch (e) {
    return NextResponse.json({ error: String(e), providers: [] }, { status: 500 });
  }
}
