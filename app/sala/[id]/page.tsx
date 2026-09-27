import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import SalaView from "@/components/sala/SalaView";
import ParametrosInvalidos from "@/components/ParametrosInvalidos";

// Ruta DINÁMICA: el id es un uuid que nace en la base, así que no se puede
// enumerar para el export estático. Queda fuera del build nativo (Tarea 6.1);
// el MVP de salas es web/PWA.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SalaPage({ params }: { params: { id: string } }) {
  return (
    <>
      <TopBar />
      <main>
        {UUID.test(params.id) ? <SalaView roomId={params.id.toLowerCase()} /> : <ParametrosInvalidos />}
      </main>
      <BottomNav />
    </>
  );
}
