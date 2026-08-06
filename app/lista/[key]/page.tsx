import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import ListaView from "@/components/ListaView";
import UltimosView from "@/components/UltimosView";

const LISTAS: Record<string, { endpoint: string; title: string }> = {
  "mas-votados": { endpoint: "/api/mas-votados", title: "Lo más votados" },
  "hacete-cargo": { endpoint: "/api/hacete-cargo", title: "Hacete cargo" },
  "familia": { endpoint: "/api/audience?a=family", title: "🍿 Para toda la familia" },
  "anime-adulto": { endpoint: "/api/audience?a=adult-anime", title: "🎬 Animación para adultos" },
};

export default function ListaPage({ params }: { params: { key: string } }) {
  if (params.key === "ultimos") {
    return (<><TopBar /><main><UltimosView /></main><BottomNav /></>);
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
