import { NextRequest, NextResponse } from "next/server";
import { buildIcs } from "@/lib/ics";
import { supabaseServer } from "@/lib/supabase";
// El detalle pasa por el resolver REPARADO, no por `titleDetails` crudo: el
// nombre que termina en el .ics es el mismo que el usuario vio en la ficha.
// (El camino que lee `upcoming_content` NO se repara acá — ver abajo.)
import { detalleReparado } from "@/lib/enrich";
// El texto vive en un módulo puro para poder probarlo: es lo que fija qué
// nombre termina en el archivo que el usuario agenda.
import { resumen, type DatosRecordatorio as Datos } from "@/lib/recordatorio-texto";
import { hoyAR } from "@/lib/fecha";
import { platformByCode } from "@/lib/providers-ar";
import { SITIO_PUBLICO } from "@/lib/compartir";
import type { MediaType, PlatformCode } from "@/lib/types";
import { conCors, opcionesCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

// Sirve el .ics del botón "Recordarme". Es una RUTA y no un Blob armado en el
// cliente a propósito: en iOS, un blob: con contenido de calendario abre de
// forma inconsistente, mientras que una respuesta con Content-Type text/calendar
// la manda derecho a la app Calendario. Como iOS es plataforma objetivo, el
// costo de la ruta se paga solo.

// El respaldo es el dominio CANÓNICO, no el viejo de Vercel que estaba escrito
// acá: este enlace termina dentro de un evento de calendario ajeno y no hay
// forma de corregirlo después. `NEXT_PUBLIC_SITE_URL` sigue teniendo
// precedencia —no se toca su papel en la recuperación de contraseña—, así que
// esto sólo cambia lo que pasa cuando la variable no está cargada.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || SITIO_PUBLICO;


// OJO CON EL IDIOMA: esta rama lee `upcoming_content.title`, que hoy está
// persistido en es-ES y NO se repara acá. Queda a cargo de la TANDA 3, donde la
// Edge Function pasa a es-MX y se hace el backfill. Hasta entonces, un
// recordatorio de Próximamente puede traer el título español aunque la ficha ya
// muestre otro — es una inconsistencia CONOCIDA y acotada a esa tabla.
//
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
    const { detalle: d } = await detalleReparado("movie", id);
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
    const { detalle: d } = await detalleReparado(tipo, id);
    // En series, `next_episode_to_air` y NO `first_air_date`. `first_air_date`
    // es el estreno ORIGINAL de la serie: en una en emisión es una fecha del
    // pasado, así que el .ics guardaba en el calendario del usuario un evento ya
    // vencido — y encima el botón se mostraba por `nextAirDate`, o sea que la
    // fecha que decidía mostrarlo no era la que se agendaba. Sin próximo
    // episodio no hay nada que recordar: null y 404.
    const fecha = tipo === "movie"
      ? await digitalAR(id)
      : (d.next_episode_to_air?.air_date ?? null);
    if (!fecha) return null;
    return {
      titulo: d.title || d.name || "",
      fecha,
      // Del mismo episodio que fija la fecha, para que el resumen diga "T4 E4" y
      // no un genérico "nuevo episodio".
      season: tipo === "tv" ? (d.next_episode_to_air?.season_number ?? null) : null,
      episode: tipo === "tv" ? (d.next_episode_to_air?.episode_number ?? null) : null,
      premiere: false,
    };
  } catch {
    return null;
  }
}


// Nombre de archivo sin acentos ni símbolos: algunos clientes de correo y el
// Safari viejo se comen los nombres con caracteres no ASCII.
function nombreArchivo(titulo: string): string {
  const base = titulo.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).toLowerCase();
  return `${base || "recordatorio"}.ics`;
}

async function manejar(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const tipo: MediaType = q.get("tipo") === "tv" ? "tv" : "movie";
  const id = Number(q.get("id"));
  const code = (q.get("plataforma") || "") as PlatformCode;
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  const d = await datosDe(tipo, id);
  if (!d) return NextResponse.json({ error: "sin fecha de estreno" }, { status: 404 });
  // Red de seguridad para cualquier fecha vencida que se cuele por otro lado:
  // `upcoming_content` puede quedar desactualizada entre corridas del sync y
  // devolver un episodio que ya salió. Agendar el pasado no le sirve a nadie y
  // ensucia un calendario que no es nuestro, así que mejor no generar nada.
  if (d.fecha < hoyAR()) {
    return NextResponse.json({ error: "el estreno ya pasó" }, { status: 404 });
  }

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
      // El botón pide la URL dos veces: una para chequear que haya evento y otra
      // para bajarlo. Con `no-store` eso eran dos resoluciones de fecha contra
      // TMDB por cada clic. Con cache privado de 5 minutos, la segunda sale del
      // cache del navegador y no toca el server.
      //
      // HEAD no servía para esto: Next deriva el HEAD del propio GET, así que el
      // handler corre igual y la llamada a TMDB se paga lo mismo. Lo que ahorra
      // es cachear, no cambiar el verbo.
      //
      // `private` porque el .ics lleva la plataforma del usuario en el resumen;
      // 5 minutos es corto contra un TTL de estreno, así que no hay riesgo real
      // de servir una fecha vieja.
      "Cache-Control": "private, max-age=300",
    },
  });
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios: las
// cabeceras del .ics —Content-Type text/calendar, Content-Disposition y el
// Cache-Control private— salen intactas, porque `conCors` copia las de la ruta y
// sólo AGREGA las suyas.
//
// Esta ruta hace DOS cosas y por eso está acá: `RecordarButton` primero le hace
// un `fetch` de validación —para poder avisar "todavía no hay fecha confirmada"
// en vez de bajar un archivo roto— y recién después navega para descargar. La
// navegación no necesita CORS; **el fetch sí**, y dentro del contenedor es
// cross-origin. Sin esto el botón "Recordarme" falla antes de descargar nada.
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
