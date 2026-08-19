import BottomNav from "@/components/BottomNav";
import DetailView from "@/components/DetailView";
import type { MediaType } from "@/lib/types";
export default function Titulo({ params }: { params: { tipo: string; id: string } }) {
  // La ficha era la unica de las 14 rutas sin barra inferior: no estaba oculta,
  // no estaba puesta. El hueco ya existia igual, porque `.dpad` reserva
  // `--nav-total` abajo (92px medidos), asi que ponerla no mueve nada de lo que
  // ya esta en pantalla; ocupa una banda que hasta ahora quedaba vacia.
  //
  // No va dentro de un <main> como en las otras paginas: `main` tambien reserva
  // `--nav-total`, y sumado al de `.dpad` dejaria el doble de aire abajo.
  return (
    <>
      <DetailView tipo={params.tipo as MediaType} id={params.id} />
      <BottomNav sobreFicha />
    </>
  );
}
