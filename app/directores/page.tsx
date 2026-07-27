import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import DirectoresView from "@/components/DirectoresView";

export default function DirectoresPage() {
  return (
    <>
      <TopBar />
      <main><DirectoresView /></main>
      <BottomNav />
    </>
  );
}
