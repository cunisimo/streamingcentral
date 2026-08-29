import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import CategoriaEntrada from "@/components/CategoriaEntrada";
import { CATEGORIES } from "@/lib/categories";

// El universo de slugs es FINITO —los de `CATEGORIES`— así que esta ruta
// dinámica sí se puede enumerar para el export estático. Es la diferencia con
// `/titulo/[tipo]/[id]` y `/persona/[id]`, que cubren todo TMDB y por eso se
// reemplazan por `/t` y `/p`.
export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

// `searchParams` NO se lee acá: es una función dinámica de servidor y el export
// estático no la soporta. La lectura del `?tipo=` se mudó al cliente, a
// `CategoriaEntrada`, sin cambiar el comportamiento. Ver el comentario de ese
// archivo.
export default function CategoriaPage({ params }: { params: { slug: string } }) {
  const cat = CATEGORIES.find((c) => c.slug === params.slug);
  if (!cat) notFound();
  return (
    <>
      <TopBar />
      <main><CategoriaEntrada slug={cat.slug} label={cat.label} /></main>
      <BottomNav />
    </>
  );
}
