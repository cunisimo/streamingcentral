import { NextRequest, NextResponse } from "next/server";
import { adminDeToken, tokenDeHeader } from "@/lib/admin-auth";
import { cardsByIds } from "@/lib/enrich";
import { searchDeTipo, searchMulti } from "@/lib/tmdb";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

// Búsqueda de TMDB para el dashboard.
//
// ⚠️ ANTES ESTA RUTA NO VALIDABA NADA. Cualquiera podía consumirla y gastar
// nuestra cuota de TMDB desde afuera. Ahora exige admin CON segundo factor, el
// mismo criterio que el resto del dashboard.
//
// ============================================================================
// EL `tipo` ES OPCIONAL, Y ESO NO ES UN DETALLE
// ============================================================================
// La usan DOS pantallas y no buscan lo mismo:
//
//  - El **editor de reseñas** busca sin tipo: quiere encontrar el título y le
//    da igual si es película o serie. Necesita la búsqueda COMBINADA.
//  - El **dashboard del Top** busca dentro de un bloque, que ya es de un tipo.
//
// ⚠️ Al proteger esta ruta se rompió el primer caso DOS veces: quedó exigiendo
// un `tipo` —así que a quien buscaba una serie le devolvía películas, en
// silencio— y encima el editor llamaba sin `Authorization` y recibía 401.
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
  // `null` = sin tipo = búsqueda combinada. NO se cae a "movie".
  const tipo: MediaType | null = tipoRaw === "movie" || tipoRaw === "tv" ? tipoRaw : null;
  const plataforma = (sp.get("plataforma") || "") as PlatformCode | "";
  if (!q) return NextResponse.json({ items: [] });

  try {
    type Crudo = { id: number; tipo: MediaType; titulo: string; year: number | null };
    const anio = (r: { release_date?: string; first_air_date?: string }) =>
      Number((r.release_date || r.first_air_date || "").slice(0, 4)) || null;

    let crudos: Crudo[];
    if (tipo) {
      const res = await searchDeTipo(tipo, q);
      crudos = (res.results ?? []).slice(0, 8).map((r) => ({
        id: r.id, tipo, titulo: r.title || r.name || "", year: anio(r),
      }));
    } else {
      const res = await searchMulti(q);
      crudos = (res.results ?? [])
        .filter((r) => r.media_type === "movie" || r.media_type === "tv")
        .slice(0, 8)
        .map((r) => {
          // `RawMulti` incluye personas, que no tienen `title` ni fechas. El
          // filtro de arriba ya las sacó; el cast lo hace explícito.
          const t = r as { id: number; media_type: MediaType; title?: string;
            name?: string; release_date?: string; first_air_date?: string };
          return {
            id: t.id, tipo: t.media_type,
            titulo: t.title || t.name || "", year: anio(t),
          };
        });
    }
    if (!crudos.length) return NextResponse.json({ items: [] });

    // `cardsByIds` reusa los MISMOS caches que la app pública (`card:`, `pv3:`,
    // `disp:`), así que buscar desde el dashboard no paga proveedores aparte de
    // los que ya se hubieran pedido.
    const cards = await cardsByIds(crudos.map((c) => ({ tipo: c.tipo, id: c.id })));
    // La clave es `tipo:id` y no el id solo: en la búsqueda combinada pueden
    // volver la película 700 y la serie 700 en la misma tanda.
    const porClave = new Map(cards.map((c) => [`${c.type}:${c.id}`, c]));

    const items = crudos.map((r) => {
      const c = porClave.get(`${r.tipo}:${r.id}`);
      const enPlataforma = !!plataforma && !!c?.platforms?.includes(plataforma as PlatformCode);
      return {
        id: r.id,
        // Se devuelve SIEMPRE, también en la combinada: el editor de reseñas lo
        // necesita para guardar la fila.
        tipo: r.tipo,
        titulo: c?.title || r.titulo,
        year: c?.year ?? r.year,
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
