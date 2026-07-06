import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import CatalogView from "@/components/CatalogView";
export default function Peliculas() {
  return (<><TopBar /><main><CatalogView mode="peliculas" /></main><BottomNav /></>);
}
