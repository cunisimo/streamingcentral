import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import CategoryView from "@/components/CategoryView";
import { CATEGORIES } from "@/lib/categories";
import type { MediaType } from "@/lib/types";

export default function CategoriaPage({
  params, searchParams,
}: {
  params: { slug: string };
  searchParams: { tipo?: string };
}) {
  const cat = CATEGORIES.find((c) => c.slug === params.slug);
  if (!cat) notFound();
  const tipo: MediaType = searchParams.tipo === "tv" ? "tv" : "movie";
  return (
    <>
      <TopBar />
      <main><CategoryView slug={cat.slug} label={cat.label} initialTipo={tipo} /></main>
      <BottomNav />
    </>
  );
}
