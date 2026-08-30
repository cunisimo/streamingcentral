import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { codeForTmdbId, platformByCode, platformOrder } from "@/lib/providers-ar";
import { conCors, opcionesCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  name: string;
  // NO se pide el logo de TMDB: ver components/onboarding/ProviderCard.tsx.
  sort_order?: number | null;
  display_priority?: number | null;
}

// Fuente ÚNICA de plataformas (la usan el header y el onboarding): la tabla
// `providers`. Etapa 1 → solo las habilitadas (`enabled`) y ordenadas por
// `sort_order`. Fallback (si esas columnas todavía no están aplicadas en la DB):
// mostrar solo las soportadas por la app (las que tienen código interno),
// ordenadas por display_priority. Devuelve `code` para que el header pueda
// togglear "mis plataformas".
async function manejar() {
  const sb = supabaseServer();
  if (!sb) return NextResponse.json({ providers: [] });
  try {
    let rows: Row[];
    const primary = await sb
      .from("providers")
      .select("id, name, sort_order")
      .eq("enabled", true)
      .order("sort_order", { ascending: true });
    if (primary.error) {
      // Columnas enabled/sort_order aún no aplicadas: fallback por código.
      const fb = await sb
        .from("providers")
        .select("id, name, display_priority")
        .order("display_priority", { ascending: true });
      if (fb.error) throw new Error(fb.error.message);
      rows = (fb.data ?? []).filter((p: Row) => codeForTmdbId(p.id));
    } else {
      rows = primary.data ?? [];
    }
    // Varios provider_id de TMDB pueden mapear al mismo code interno (ver
    // lib/providers-ar.ts: el id 2 "Apple TV" es la tienda de alquiler/compra y
    // a propósito NO mapea a nada, así que hoy no hay caso real, pero si mañana
    // se suma un revendedor esto sigue haciendo falta). Deduplicamos por code
    // para no repetirlo.
    const seen = new Set<string>();
    const providers = rows
      .map((p) => {
        const code = codeForTmdbId(p.id);
        // El nombre lo manda PLATFORMS, no la tabla: TMDB los publica con el
        // nombre del revendedor ("Universal+ Amazon Channel", "HBO Max") y en el
        // selector queremos la marca a secas.
        const def = code ? platformByCode(code) : null;
        return {
          id: p.id,
          code,
          name: def?.name ?? p.name.trim(),
        };
      })
      .filter((p) => {
        if (!p.code || seen.has(p.code)) return false;
        seen.add(p.code);
        return true;
      })
      // El orden lo manda PLATFORMS, no el display_priority de TMDB: el dueño
      // definió cuáles van primero en el selector.
      .sort((a, b) => platformOrder(a.code!) - platformOrder(b.code!));
    return NextResponse.json({ providers });
  } catch (e) {
    return NextResponse.json({ error: String(e), providers: [] }, { status: 500 });
  }
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
