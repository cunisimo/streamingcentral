import type { Metadata } from "next";
import SalaDesdeQuery from "@/components/nativo/SalaDesdeQuery";

// 🔴 `noindex`, y NO canonical. Mismo criterio que `/t` y `/p`.
//
// Esta ruta existe sólo para el contenedor: el export estático no puede enumerar
// `/sala/[id]`, cuyo id es un uuid de la base. En la web nadie la enlaza
// —`hrefSala` sigue devolviendo `/sala/<uuid>`— pero se despliega igual, porque
// el build es uno solo.
//
// ⚠️ La metadata va acá y la lectura de la query en un hijo de cliente. Un
// componente marcado `"use client"` NO puede exportar `metadata`.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SPage() {
  return <SalaDesdeQuery />;
}
