import type { Metadata } from "next";
import TituloDesdeQuery from "@/components/nativo/TituloDesdeQuery";

// 🔴 `noindex`, y NO canonical. Decisión del dueño, 5/09/2026.
//
// Esta ruta existe sólo para el contenedor: el export estático no puede enumerar
// `/titulo/[tipo]/[id]`, que cubre todo TMDB. En la web nadie la enlaza
// —`hrefTitulo` sigue devolviendo `/titulo/movie/278`— pero se despliega igual,
// porque el build es uno solo.
//
// Un `canonical` le pediría a Google que consolide señales hacia `/titulo/...`,
// y eso supone que ésta es una alternativa legítima que se quiere servir. No lo
// es. `noindex` dice lo que realmente pasa: esta URL no es para la web.
//
// ⚠️ La metadata va acá y la lectura de la query en un hijo de cliente. Un
// componente marcado `"use client"` NO puede exportar `metadata`: si esta página
// volviera a serlo, el `<meta>` desaparecería del HTML sin que nada falle en
// tiempo de compilación. Hay un test que lee el HTML generado, no el código.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function TPage() {
  return <TituloDesdeQuery />;
}
