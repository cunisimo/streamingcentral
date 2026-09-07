import ShelfSkeleton from "./ShelfSkeleton";

// El esqueleto de `/categoria/[slug]` mientras se resuelve el `?tipo=`.
//
// ⚠️ NO es decorativo: es el `fallback` del <Suspense> de `CategoriaEntrada`, y
// sin él la página sale VACÍA del export.
//
// Por qué. `useSearchParams` obliga a Next a marcar ese subárbol como
// "renderizado en cliente" (`BAILOUT_TO_CLIENT_SIDE_RENDERING`), así que el HTML
// estático lleva el fallback y no el contenido. Con `fallback={null}` medimos un
// `<main>` de 84 bytes: literalmente en blanco hasta que hidrata.
//
// Reproduce el encabezado y el toggle con el mismo marcado y las mismas clases
// que `CategoryView`, así que la transición al contenido real no mueve nada.
// El toggle va deshabilitado porque todavía no se sabe qué tipo está activo:
// pintarlo en "Películas" sería mentir en el 50% de los casos y provocaría un
// parpadeo visible al llegar `?tipo=tv`.
//
// Los dos `ShelfSkeleton` son los mismos que la vista muestra mientras cargan
// los rieles: mantienen el alto del documento, que es lo que hace que la
// restauración de scroll no se recorte (ver el comentario de ShelfSkeleton).
export default function CategoriaSkeleton({ label }: { label: string }) {
  return (
    <div className="wrap">
      <div className="compact-head">
        <h1>{label}</h1>
        <p className="sub">Explorá {label.toLowerCase()} en tus plataformas</p>
      </div>
      <div className="tipo-toggle" role="tablist" aria-busy="true">
        <button role="tab" aria-selected={false} className="tt" disabled>Películas</button>
        <button role="tab" aria-selected={false} className="tt" disabled>Series</button>
      </div>
      <ShelfSkeleton />
      <ShelfSkeleton />
    </div>
  );
}
