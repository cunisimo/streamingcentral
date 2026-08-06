import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { TMDB_IMG } from "@/lib/tmdb";
import { codeForTmdbId } from "@/lib/providers-ar";

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  name: string;
  logo_path: string | null;
  sort_order?: number | null;
  display_priority?: number | null;
}

// Fuente ÚNICA de plataformas (la usan el header y el onboarding): la tabla
// `providers`. Etapa 1 → solo las habilitadas (`enabled`) y ordenadas por
// `sort_order`. Fallback (si esas columnas todavía no están aplicadas en la DB):
// mostrar solo las soportadas por la app (las que tienen código interno),
// ordenadas por display_priority. Devuelve `code` para que el header pueda
// togglear "mis plataformas".
export async function GET() {
  const sb = supabaseServer();
  if (!sb) return NextResponse.json({ providers: [] });
  try {
    let rows: Row[];
    const primary = await sb
      .from("providers")
      .select("id, name, logo_path, sort_order")
      .eq("enabled", true)
      .order("sort_order", { ascending: true });
    if (primary.error) {
      // Columnas enabled/sort_order aún no aplicadas: fallback por código.
      const fb = await sb
        .from("providers")
        .select("id, name, logo_path, display_priority")
        .order("display_priority", { ascending: true });
      if (fb.error) throw new Error(fb.error.message);
      rows = (fb.data ?? []).filter((p: Row) => codeForTmdbId(p.id));
    } else {
      rows = primary.data ?? [];
    }
    // Varios provider_id de TMDB mapean al mismo code interno (ej. Apple TV 350
    // + Apple TV Store 2 → "at"). Deduplicamos por code para no repetirlo.
    const seen = new Set<string>();
    const providers = rows
      .map((p) => ({
        id: p.id,
        code: codeForTmdbId(p.id),
        name: p.name.trim(),
        logo: p.logo_path ? `${TMDB_IMG}/w92${p.logo_path}` : null,
      }))
      .filter((p) => {
        if (!p.code || seen.has(p.code)) return false;
        seen.add(p.code);
        return true;
      });
    return NextResponse.json({ providers });
  } catch (e) {
    return NextResponse.json({ error: String(e), providers: [] }, { status: 500 });
  }
}
