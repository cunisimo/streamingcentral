import type { Metadata } from "next";
import BottomNav from "@/components/BottomNav";
import DetailView from "@/components/DetailView";
import { cardsByIds } from "@/lib/enrich";
import { SITIO_PUBLICO, urlDeTitulo } from "@/lib/compartir";
import { platformByCode } from "@/lib/providers-ar";
import type { MediaType } from "@/lib/types";

// La vista previa del enlace cuando alguien comparte una ficha —o un match de
// Yumpeá, que comparte la misma url— (Etapa 5, Tarea 5.2).
//
// 6 h de revalidación: la misma escala que `TTL.home`. El póster y las
// plataformas de un título no cambian más rápido que eso, y la metadata la pide
// un bot (WhatsApp, Telegram) una vez por enlace, no el usuario en cada visita.
//
// 🔴 `og:image` tiene que ser ABSOLUTA y accesible sin sesión: `card.poster` ya
// viene como url completa de `image.tmdb.org` (`TMDB_IMG`), así que no se arma
// nada acá. La url canónica sale de `lib/compartir.ts`, su única fuente: nunca
// del origen del navegador (ver el historial en ese archivo).
//
// Un id que no es número, o un título que TMDB no devuelve, caen en la metadata
// base: canónica y nada más. Un fallo de TMDB NO rompe la página — el `catch`
// devuelve la base y la ficha se sigue renderizando.
export const revalidate = 21600;

export async function generateMetadata({ params }: { params: { tipo: string; id: string } }): Promise<Metadata> {
  const tipo: MediaType = params.tipo === "tv" ? "tv" : "movie";
  const id = Number(params.id);
  const base: Metadata = {
    metadataBase: new URL(SITIO_PUBLICO),
    alternates: { canonical: urlDeTitulo(tipo, params.id) },
  };
  if (!Number.isInteger(id) || id <= 0) return base;

  const [card] = await cardsByIds([{ tipo, id }]).catch(() => []);
  if (!card) return base;

  const plataformas = card.platforms.map((c) => platformByCode(c)?.name).filter(Boolean).join(", ");
  const titulo = `${card.title}${card.year ? ` (${card.year})` : ""} · Yump`;
  const description = plataformas ? `Disponible en ${plataformas}. Ver en Yump.` : "Ver en Yump.";
  const url = urlDeTitulo(tipo, params.id);

  return {
    ...base,
    title: titulo,
    description,
    openGraph: {
      title: titulo,
      description,
      url,
      // El tipo de Open Graph sigue al tipo del título: una serie NO es
      // `video.movie`. Los valores son los del vocabulario de OG
      // (video.movie / video.tv_show); un test los fija para los dos casos.
      type: tipo === "tv" ? "video.tv_show" : "video.movie",
      images: card.poster ? [{ url: card.poster, width: 500, height: 750 }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description,
      images: card.poster ? [card.poster] : [],
    },
  };
}

export default function Titulo({ params }: { params: { tipo: string; id: string } }) {
  // La ficha era la unica de las 14 rutas sin barra inferior: no estaba oculta,
  // no estaba puesta. El hueco ya existia igual, porque `.dpad` reserva
  // `--nav-total` abajo (92px medidos), asi que ponerla no mueve nada de lo que
  // ya esta en pantalla; ocupa una banda que hasta ahora quedaba vacia.
  //
  // No va dentro de un <main> como en las otras paginas: `main` tambien reserva
  // `--nav-total`, y sumado al de `.dpad` dejaria el doble de aire abajo.
  return (
    <>
      <DetailView tipo={params.tipo as MediaType} id={params.id} />
      <BottomNav sobreFicha />
    </>
  );
}
