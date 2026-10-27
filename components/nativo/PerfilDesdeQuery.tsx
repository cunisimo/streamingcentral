"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import ParametrosInvalidos from "@/components/ParametrosInvalidos";
import PerfilComunitario from "@/components/comunidad/PerfilComunitario";
import { parseParamsPerfil } from "@/lib/rutas";

// El perfil comunitario por QUERY (E6). Mismo patrón que `SalaDesdeQuery`: el
// id es un uuid de la base y `output: "export"` no puede enumerarlo. A
// diferencia de la sala, se usa igual en la web (`hrefPerfil`).

function UDetalle() {
  const params = parseParamsPerfil(useSearchParams());
  if (!params) return <ParametrosInvalidos />;
  return <PerfilComunitario id={params.id} />;
}

export default function PerfilDesdeQuery() {
  // ⚠️ El <Suspense> NO es decorativo: `useSearchParams` lo EXIGE cuando la
  // página se prerenderiza, y bajo `output: "export"` todas lo son.
  return (
    <>
      <TopBar />
      <main>
        <Suspense fallback={<div className="wrap"><p className="loading">Cargando…</p></div>}>
          <UDetalle />
        </Suspense>
      </main>
      <BottomNav />
    </>
  );
}
