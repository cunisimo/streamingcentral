import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import CatalogView from "@/components/CatalogView";

export default function Home() {
  return (<><TopBar /><main><CatalogView mode="inicio" /></main><BottomNav /></>);
}
