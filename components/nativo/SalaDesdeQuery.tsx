"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import SalaView from "@/components/sala/SalaView";
import ParametrosInvalidos from "@/components/ParametrosInvalidos";
import { parseParamsSala } from "@/lib/rutas";

// Una sala, por QUERY en vez de por segmento dinámico. Mismo patrón que
// `TituloDesdeQuery` y `PersonaDesdeQuery`, y por el mismo motivo: el id es un
// uuid que nace en la base, así que `/sala/[id]` no se puede enumerar y
// `output: "export"` la rechaza. Verificado: antes de esto el build nativo moría
// con `Page "/sala/[id]" is missing "generateStaticParams()"`.
//
// En la WEB no se usa: `hrefSala` sigue devolviendo `/sala/<uuid>`, que es la
// URL pública y la que se reparte por WhatsApp. En el contenedor, `hrefSala`
// devuelve `/s/?id=<uuid>` y entra por acá; un App Link a `app.yump.ar/sala/…`
// lo traduce `components/nativo/EnlacesDeSala.tsx`.

function SDetalle() {
  const params = parseParamsSala(useSearchParams());
  if (!params) return <ParametrosInvalidos />;
  return <SalaView roomId={params.id} />;
}

export default function SalaDesdeQuery() {
  // ⚠️ El <Suspense> NO es decorativo: `useSearchParams` lo EXIGE cuando la
  // página se prerenderiza, y bajo `output: "export"` todas lo son.
  return (
    <>
      <TopBar />
      <main>
        <Suspense fallback={<div className="wrap"><p className="loading">Cargando…</p></div>}>
          <SDetalle />
        </Suspense>
      </main>
      <BottomNav />
    </>
  );
}
