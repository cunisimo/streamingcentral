import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import UpcomingAllView from "@/components/upcoming/UpcomingAllView";

export default function ProximamentePage() {
  return (
    <>
      <TopBar />
      <main><UpcomingAllView /></main>
      <BottomNav />
    </>
  );
}
