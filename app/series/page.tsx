import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import CatalogView from "@/components/CatalogView";
export default function Series() {
  return (<><TopBar /><main><CatalogView mode="series" /></main><BottomNav /></>);
}
