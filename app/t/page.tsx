"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import DetailView from "@/components/DetailView";
import DetailSkeleton from "@/components/DetailSkeleton";
import ParametrosInvalidos from "@/components/ParametrosInvalidos";
import { parseParamsTitulo } from "@/lib/rutas";

// La ficha de un título, por QUERY en vez de por segmento dinámico.
//
// Existe por el export estático: `/titulo/[tipo]/[id]` cubre todo el catálogo de
// TMDB, así que no hay `generateStaticParams` que la pueda enumerar y
// `output: "export"` la rechaza. Esta ruta es estática —un solo archivo— y los
// parámetros viajan en la query, que se lee en el cliente.
//
// En la WEB no se usa: `hrefTitulo` sigue devolviendo `/titulo/movie/278`, las
// URLs públicas no cambian y los links que ya circulan siguen funcionando. En el
// contenedor, `hrefTitulo` devuelve `/t?tipo=movie&id=278` y entra por acá.

function TDetalle() {
  const params = parseParamsTitulo(useSearchParams());
  if (!params) return <ParametrosInvalidos />;
  return <DetailView tipo={params.tipo} id={params.id} />;
}

export default function TPage() {
  // ⚠️ El <Suspense> NO es decorativo: `useSearchParams` lo EXIGE cuando la
  // página se prerenderiza, y bajo `output: "export"` todas lo son. Sin él, el
  // build falla. Es el primer Suspense del proyecto.
  //
  // El fallback es el mismo esqueleto que usa la ficha normal mientras carga,
  // así que la transición se ve igual que en la web.
  return (
    <>
      <Suspense fallback={<DetailSkeleton />}>
        <TDetalle />
      </Suspense>
      <BottomNav sobreFicha />
    </>
  );
}
