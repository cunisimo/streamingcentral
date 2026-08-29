"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CategoryView from "./CategoryView";
import CategoriaSkeleton from "./CategoriaSkeleton";
import type { MediaType } from "@/lib/types";

// Lee el `?tipo=` de la URL EN EL CLIENTE y se lo pasa a `CategoryView`.
//
// Antes lo leía el Server Component de `/categoria/[slug]` con `searchParams`.
// Eso es incompatible con `output: "export"`: la doc lista `searchParams` entre
// las funciones dinámicas de servidor que el export no soporta, porque no se
// pueden computar en build.
//
// Lo que NO cambia al mover la lectura:
//
// - **El tipo inicial**: sigue saliendo del mismo `?tipo=`, con el mismo default
//   (`movie` para cualquier valor que no sea `tv`).
// - **La URL compartible**: `/categoria/terror?tipo=tv` sigue abriendo en Series.
// - **La restauración**: `CategoryView` ya restauraba el tipo del snapshot y no
//   de la URL (ver la nota de navegación en CLAUDE.md), así que ese camino no se
//   toca. `initialTipo` sigue siendo sólo el valor de arranque.
// - **La navegación web normal**: la página sigue existiendo en `/categoria/…`
//   y el `replaceState` que mantiene la URL al cambiar de toggle sigue igual.
function Entrada({ slug, label }: { slug: string; label: string }) {
  const tipo: MediaType = useSearchParams().get("tipo") === "tv" ? "tv" : "movie";
  return <CategoryView slug={slug} label={label} initialTipo={tipo} />;
}

export default function CategoriaEntrada({ slug, label }: { slug: string; label: string }) {
  // `useSearchParams` exige Suspense al prerenderizar, y con `output: "export"`
  // todas las páginas lo son. Sin el boundary, el build falla.
  //
  // ⚠️ El fallback NO puede ser `null`. Next marca este subárbol como
  // "renderizado en cliente", así que el HTML estático lleva el fallback: con
  // `null` la página salía literalmente en blanco hasta hidratar (medido: un
  // `<main>` de 84 bytes). `CategoriaSkeleton` reproduce el encabezado y el
  // toggle con el mismo marcado, así que no hay vacío ni salto.
  return (
    <Suspense fallback={<CategoriaSkeleton label={label} />}>
      <Entrada slug={slug} label={label} />
    </Suspense>
  );
}
