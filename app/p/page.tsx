"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import PersonView from "@/components/PersonView";
import ParametrosInvalidos from "@/components/ParametrosInvalidos";
import { parseParamsPersona } from "@/lib/rutas";

// La filmografía de una persona, por QUERY. Mismo motivo que `/t`: el universo
// de `/persona/[id]` es todo TMDB y no se puede enumerar para el export.
// Ver el comentario largo en `app/t/page.tsx`.

function PDetalle() {
  const params = parseParamsPersona(useSearchParams());
  if (!params) return <ParametrosInvalidos />;
  return <PersonView id={params.id} />;
}

export default function PPage() {
  // `useSearchParams` exige Suspense al prerenderizar. Ver `app/t/page.tsx`.
  return (
    <>
      <TopBar />
      <main>
        <Suspense fallback={null}>
          <PDetalle />
        </Suspense>
      </main>
      <BottomNav />
    </>
  );
}
