import { NextRequest, NextResponse } from "next/server";
import { buildIcs } from "@/lib/ics";
import { supabaseServer } from "@/lib/supabase";
import { titleDetails } from "@/lib/tmdb";
import { platformByCode } from "@/lib/providers-ar";
import type { MediaType, PlatformCode } from "@/lib/types";

export const dynamic = "force-dynamic";

// Sirve el .ics del botón "Recordarme". Es una RUTA y no un Blob armado en el
// cliente a propósito: en iOS, un blob: con contenido de calendario abre de
// forma inconsistente, mientras que una respuesta con Content-Type text/calendar
// la manda derecho a la app Calendario. Como iOS es plataforma objetivo, el
// costo de la ruta se paga solo.

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://streamingcentral.vercel.app";

interface Datos {
  titulo: string;
  fecha: string;
  season: number | null;
  episode: number | null;
  premiere: boolean;
}

// El dato bueno está en `upcoming_content`: trae temporada, episodio y si es
// estreno de temporada, que es lo que hace legible el evento. Un título que no
// esté ahí (una ficha futura que el sync todavía no levantó) cae a TMDB, que
// alcanza para el título y la fecha.
// En PELÍCULAS el .ics se agenda con la fecha DIGITAL argentina, no con
// `release_date`: esa es la más temprana del mundo y casi siempre la de cine
// (The Fantastic 4: cine 2025-07-23, digital AR 2025-11-05). Sin ella no se
// arma ningún evento — el botón ya no se ofrece en ese caso, así que llegar acá
// sin el dato significa que algo lo saltó y es mejor un 404 que una fecha mala.
//
// Vale también para lo que viene de `upcoming_content`: esa tabla guarda la
// fecha que trajo el sync, que es la de cine. El sync no se toca (issue #5),
// pero lo que se agenda sí se corrige acá.
async function digitalAR(id: number): Promise<string | null> {
  try {
    const d = await titleDetails("movie", id);
    const ar = d.release_dates?.results.find((r) => r.iso_3166_1 === "AR");
    return ar?.release_dates?.find((x) => x.type === 4)?.release_date?.slice(0, 10) || null;
  } catch {
    return null;
  }
}

async function datosDe(tipo: MediaType, id: number): Promise<Datos | null> {
  const db = supabaseServer();
  if (db) {
    const { data } = await db
      .from("upcoming_content")
      .select("title, release_date, season_number, episode_number, is_season_premiere")
      .eq("tmdb_id", id)
      .eq("media_type", tipo)
      .maybeSingle();
    if (data?.release_date) {
      const fecha = tipo === "movie" ? await digitalAR(id) : (data.release_date as string);
      if (!fecha) return null;
      return {
        titulo: data.title as string,
        fecha,
        season: (data.season_number as number | null) ?? null,
        episode: (data.episode_number as number | null) ?? null,
        premiere: Boolean(data.is_season_premiere),
      };
    }
  }
  try {
    const d = await titleDetails(tipo, id);
    const fecha = tipo === "movie" ? await digitalAR(id) : d.first_air_date;
    if (!fecha) return null;
    return { titulo: d.title || d.name || "", fecha, season: null, episode: null, premiere: false };
  } catch {
    return null;
  }
}

// Qué dice el evento. Para series el dueño pidió NO agendar recurrencias: cada
// toque agenda un solo evento, sea el estreno de temporada o el episodio suelto.
function resumen(d: Datos, tipo: MediaType, plataforma: string | null): string {
  const donde = plataforma ? ` en ${plataforma}` : "";
  if (tipo === "movie") return `${d.titulo} — estreno${donde}`;
  if (d.premiere && d.season) return `${d.titulo} — estrena la temporada ${d.season}${donde}`;
  if (d.season && d.episode) return `${d.titulo} — T${d.season} E${d.episode}${donde}`;
  return `${d.titulo} — nuevo episodio${donde}`;
}

// Nombre de archivo sin acentos ni símbolos: algunos clientes de correo y el
// Safari viejo se comen los nombres con caracteres no ASCII.
function nombreArchivo(titulo: string): string {
  const base = titulo.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).toLowerCase();
  return `${base || "recordatorio"}.ics`;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const tipo: MediaType = q.get("tipo") === "tv" ? "tv" : "movie";
  const id = Number(q.get("id"));
  const code = (q.get("plataforma") || "") as PlatformCode;
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const d = await datosDe(tipo, id);
  if (!d) return NextResponse.json({ error: "sin fecha de estreno" }, { status: 404 });

  const plataforma = platformByCode(code)?.name ?? null;
  const url = `${SITE}/titulo/${tipo}/${id}`;
  const ics = buildIcs({
    // Estable por título: volver a tocar el botón actualiza el evento que ya
    // está en el calendario en vez de duplicarlo.
    uid: `yump-${tipo}-${id}@yump.app`,
    fecha: d.fecha,
    titulo: resumen(d, tipo, plataforma),
    descripcion: `Te lo recordás desde Yump.\n${url}`,
    url,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombreArchivo(d.titulo)}"`,
      "Cache-Control": "no-store",
    },
  });
}
