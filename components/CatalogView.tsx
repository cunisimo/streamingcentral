"use client";
import Shelf from "./Shelf";
import IndecisoHero from "./IndecisoHero";
import DesempateBanner from "./desempate/DesempateBanner";
import UpcomingSection from "./upcoming/UpcomingSection";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import { useHomeTypes } from "@/hooks/useHomeTypes";
import type { HomePayload } from "@/lib/home";

// El Home se arma entero en el server (lib/home.ts): un solo fetch a /api/home
// devuelve el hero y todos los rieles ya deduplicados y en orden. Los rieles son
// presentacionales (Shelf en modo controlado). "Próximamente" y "Desempatá"
// quedan fuera del composer a propósito: no reservan ni se filtran.
export default function CatalogView() {
  const online = useOnline();
  const { platforms } = usePlatforms();
  const { setType, param, ready } = useHomeTypes();

  const { data, loading, offline } = useApi<HomePayload>(
    () => (ready ? `/api/home?providers=${platforms.join(",")}&t=${param}` : ""),
    [param, ready],
  );

  if (!online || offline) {
    return <div className="wrap"><OfflineState onRetry={() => location.reload()} /></div>;
  }

  const rails = data?.rails ?? [];

  return (
    <>
      <IndecisoHero initialItems={data?.hero} />
      <div className="wrap">
        <DesempateBanner />
        <UpcomingSection />
        {loading && !rails.length
          ? <div className="shelf"><span className="loading">Cargando…</span></div>
          : rails.map((r) => (
              <Shelf
                key={r.key}
                items={r.items}
                title={r.title}
                genre={r.genre}
                seeAllHref={r.seeAllHref}
                typeToggle={r.typeToggle}
                shelfKey={r.shelfKey}
                initialType={r.activeType}
                onTypeChange={(t) => setType(r.shelfKey ?? r.key, t)}
              />
            ))}
      </div>
    </>
  );
}
