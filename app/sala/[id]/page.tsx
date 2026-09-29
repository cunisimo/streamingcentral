import type { Metadata } from "next";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import SalaView from "@/components/sala/SalaView";
import ParametrosInvalidos from "@/components/ParametrosInvalidos";
import { metadataInvitacion, PARAM_ORGANIZADOR } from "@/lib/sala/invitacion";

// Ruta DINÁMICA: el id es un uuid que nace en la base, así que no se puede
// enumerar para el export estático. Queda fuera del build nativo (Tarea 6.1);
// el MVP de salas es web/PWA.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// La vista previa del enlace de invitación (WhatsApp, Open Graph): "Yump" y
// "<organizador> te invitó a yumpear.". El nombre sale SÓLO del parámetro de
// presentación `?organizador=` que trae el enlace copiado en el lobby, validado
// al leerlo; sin él, "Te invitaron a yumpear.". Nada de esto consulta la base.
// Ver lib/sala/invitacion.ts.
export function generateMetadata({ params, searchParams }: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}): Metadata {
  const id = UUID.test(params.id) ? params.id.toLowerCase() : null;
  return metadataInvitacion(id, searchParams?.[PARAM_ORGANIZADOR]);
}

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
