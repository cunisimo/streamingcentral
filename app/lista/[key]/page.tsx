import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import ListaView from "@/components/ListaView";
import UltimosView from "@/components/UltimosView";
import MiniseriesView from "@/components/MiniseriesView";
import { MINISERIES_LISTA_KEY } from "@/lib/miniseries";

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
    const tipoInicial = searchParams?.tipo === "tv" ? "tv" : "movie";
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
