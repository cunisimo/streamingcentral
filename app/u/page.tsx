import type { Metadata } from "next";
import PerfilDesdeQuery from "@/components/nativo/PerfilDesdeQuery";

// El perfil comunitario de un autor (E6): `/u/?id=<participante>`.
//
// 🔴 `noindex`, y NO canonical, como `/t`, `/p` y `/s`. A diferencia de esas,
// esta ruta es la MISMA en la web y en el contenedor (`hrefPerfil`): el id es
// un uuid de la base, así que un segmento dinámico no se podría exportar, y
// el perfil exige sesión, así que no hay URL pública que indexar. El HTML no
// lleva nada comunitario: todo se pide desde el cliente con Bearer.
//
// ⚠️ La metadata va acá y la lectura de la query en un hijo de cliente. Un
// componente marcado `"use client"` NO puede exportar `metadata`.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function UPage() {
  return <PerfilDesdeQuery />;
}
