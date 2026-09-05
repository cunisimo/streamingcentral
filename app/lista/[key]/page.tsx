import { Suspense } from "react";
import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import ListaView from "@/components/ListaView";
import UltimosDesdeQuery from "@/components/UltimosDesdeQuery";
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

export default function ListaPage({ params }: { params: { key: string } }) {
  if (params.key === "ultimos") {
    // El `?tipo=` lo lee el CLIENTE, no el servidor: ver el comentario de
    // components/UltimosDesdeQuery.tsx. Leerlo acá aborta el export nativo
    // entero, y esconderlo detrás de una bandera de plataforma dejaba el
    // parámetro sin efecto dentro del APK.
    //
    // 🔴 EL FALLBACK NO PUEDE SER `null`. Con `output: export` esta rama se
    // prerenderiza CON el fallback puesto —es lo que viaja en el HTML del
    // artefacto—, así que un `null` deja la pantalla en blanco hasta hidratar.
    return (
      <>
        <TopBar />
        <main>
          <Suspense fallback={<div className="loading">Cargando…</div>}>
            <UltimosDesdeQuery />
          </Suspense>
        </main>
        <BottomNav />
      </>
    );
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
