import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import ListaView from "@/components/ListaView";
import UltimosView from "@/components/UltimosView";
import MiniseriesView from "@/components/MiniseriesView";
import { MINISERIES_LISTA_KEY } from "@/lib/miniseries";
import { ES_NATIVO } from "@/lib/plataforma";

const LISTAS: Record<string, { endpoint: string; title: string }> = {
  "mas-votados": { endpoint: "/api/mas-votados", title: "Lo más votados" },
  "hacete-cargo": { endpoint: "/api/hacete-cargo", title: "No gustaron" },
  "familia": { endpoint: "/api/audience?a=family", title: "🍿 Para toda la familia" },
  "anime-adulto": { endpoint: "/api/audience?a=adult-anime", title: "🎬 Animación para adultos" },
};

// Las dos de abajo tienen vista propia y no entran en LISTAS: `ListaView` trae
// todo de una sola vez y estas dos paginan. El título de miniseries no se
// escribe acá a propósito — sale de lib/miniseries.ts, que es de donde lo saca
// también el riel, para que no puedan quedar distintos.
// Las SEIS keys son finitas y conocidas, asi que esta ruta dinamica se puede
// enumerar para el export estatico: las cuatro de LISTAS, "ultimos" y
// miniseries. Es la diferencia con /titulo y /persona, que cubren todo TMDB.
export function generateStaticParams() {
  return [
    ...Object.keys(LISTAS).map((key) => ({ key })),
    { key: "ultimos" },
    { key: MINISERIES_LISTA_KEY },
  ];
}

export default function ListaPage(
  { params, searchParams }: {
    params: { key: string };
    searchParams?: { tipo?: string };
  },
) {
  if (params.key === "ultimos") {
    // El `?tipo=` lo pone el "Ver todas" del riel del Home, para abrir la lista
    // en el mismo tipo que se estaba mirando. Se valida acá: cualquier otra
    // cosa cae en "movie", que es el default del riel.
    //
    // 🔴 EN NATIVO NO SE LEE, Y NO ES UN DESCUIDO. Con `output: export` esta
    // ruta se prerenderiza una sola vez, y tocar `searchParams` durante el
    // prerender aborta el export entero:
    //
    //     Route /lista/ultimos/ with `dynamic = "error"` couldn't be rendered
    //     statically because it used `searchParams.tipo`
    //
    // `ES_NATIVO` es constante de build (ver lib/plataforma.ts), así que en el
    // artefacto nativo la rama que lo lee no se ejecuta y el export completo de
    // CP2 se conserva. En la web no cambia NADA: se sigue leyendo en el
    // servidor, sin `useSearchParams` ni el <Suspense> que eso obligaría.
    //
    // El costo, declarado: dentro del contenedor un enlace con `?tipo=tv` abre
    // en Películas. Hoy no hay navegación nativa —eso es CP7—, así que no se
    // resuelve acá; queda anotado en el plan como pendiente de esa etapa.
    const tipoInicial = ES_NATIVO ? "movie" : (searchParams?.tipo === "tv" ? "tv" : "movie");
    return (<><TopBar /><main><UltimosView tipoInicial={tipoInicial} /></main><BottomNav /></>);
  }
  if (params.key === MINISERIES_LISTA_KEY) {
    return (<><TopBar /><main><MiniseriesView /></main><BottomNav /></>);
  }
  const l = LISTAS[params.key];
  if (!l) notFound();
  return (
    <>
      <TopBar />
      <main><ListaView endpoint={l.endpoint} title={l.title} /></main>
      <BottomNav />
    </>
  );
}
