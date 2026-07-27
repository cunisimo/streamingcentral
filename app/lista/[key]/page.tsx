import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import ListaView from "@/components/ListaView";

const LISTAS: Record<string, { endpoint: string; title: string }> = {
  "ultimos": { endpoint: "/api/latest", title: "Últimos lanzamientos" },
  "mas-votados": { endpoint: "/api/mas-votados", title: "Lo más votados" },
  "hacete-cargo": { endpoint: "/api/hacete-cargo", title: "Hacete cargo" },
};

export default function ListaPage({ params }: { params: { key: string } }) {
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
