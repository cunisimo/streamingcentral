import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import CrearSala from "@/components/sala/CrearSala";

export default function NuevaSalaPage() {
  return (
    <>
      <TopBar />
      <main><div className="wrap sala-wrap"><CrearSala /></div></main>
      <BottomNav />
    </>
  );
}
