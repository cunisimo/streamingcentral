import { NextRequest, NextResponse } from "next/server";
import { adminDeToken, tokenDeHeader } from "@/lib/admin-auth";
import { cardsByIds } from "@/lib/enrich";
import { searchDeTipo } from "@/lib/tmdb";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

// Búsqueda de TMDB para el dashboard.
//
// ⚠️ ANTES ESTA RUTA NO VALIDABA NADA. Cualquiera podía consumirla y gastar
// nuestra cuota de TMDB desde afuera. Ahora exige admin CON segundo factor, el
// mismo criterio que el resto del dashboard.
//
// No filtra por plataforma: el dueño busca un título por nombre y necesita
// encontrarlo aunque TMDB todavía no lo ubique en Argentina — que es
// exactamente el caso que el Top manual existe para cubrir. Lo que sí hace es
// DECIR si TMDB lo confirma en la plataforma elegida, para que la advertencia
// aparezca antes de confirmar la posición y no después.
export async function GET(req: NextRequest) {
  const auth = await adminDeToken(tokenDeHeader(req.headers.get("authorization")));
  if (!auth.ok) return NextResponse.json({ error: auth.error, items: [] }, { status: auth.status });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const tipoRaw = sp.get("tipo");
  const tipo: MediaType = tipoRaw === "movie" || tipoRaw === "tv" ? tipoRaw : "movie";
  const plataforma = (sp.get("plataforma") || "") as PlatformCode | "";
  if (!q) return NextResponse.json({ items: [] });

  try {
    const res = await searchDeTipo(tipo, q);
    const crudos = (res.results ?? []).slice(0, 8);
    if (!crudos.length) return NextResponse.json({ items: [] });

    // `cardsByIds` reusa los MISMOS caches que la app pública (`card:`, `pv3:`,
    // `disp:`), así que buscar desde el dashboard no paga proveedores aparte de
    // los que ya se hubieran pedido.
    const cards = await cardsByIds(crudos.map((r) => ({ tipo, id: r.id })));
    const porId = new Map(cards.map((c) => [c.id, c]));

    const items = crudos.map((r) => {
      const c = porId.get(r.id);
      const enPlataforma = !!plataforma && !!c?.platforms?.includes(plataforma as PlatformCode);
      return {
        id: r.id,
        tipo,
        titulo: c?.title || r.title || r.name || "",
        year: c?.year ?? (Number((r.release_date || r.first_air_date || "").slice(0, 4)) || null),
        poster: c?.poster ?? null,
        plataformas: c?.platforms ?? [],
        // `false` NO significa "no está": significa que TMDB todavía no lo
        // confirma para Argentina. El dashboard lo muestra como advertencia y
        // deja confirmar igual, y esa confirmación pasa a ser evidencia manual.
        confirmadoEnPlataforma: enPlataforma,
      };
    });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: String(e), items: [] }, { status: 500 });
  }
}
