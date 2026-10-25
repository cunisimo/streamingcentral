import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import ResenasComunidad from "@/components/comunidad/ResenasComunidad";
import { revisionLocalHabilitada } from "@/lib/comunidad/revision-local";

// 🔴 PÁGINA DE REVISIÓN LOCAL (E3a), no es producto. Monta el MISMO
// componente que la ficha (`ResenasComunidad`) para un título fijo, porque la
// ficha real necesita TMDB y el entorno local de reseñas no tiene ese token
// (no se usa `.env.local`). Responde 404 salvo que se cumplan LAS DOS cosas:
// no es un build de producción y `COMUNIDAD_REVISION_LOCAL=1`, que sólo está
// en `.env.comunidad-local` (ignorado por Git). Un test fija esta guarda.
// Sale del código antes del AAB, o queda inerte por la guarda.
export const dynamic = "force-dynamic";

export default function RevisionLocalComunidad({ searchParams }: { searchParams: { tipo?: string; id?: string; titulo?: string } }) {
  if (!revisionLocalHabilitada()) notFound();
  const tipo = searchParams.tipo === "tv" ? "tv" : "movie";
  const id = Number(searchParams.id ?? "603");
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return (
    <>
      <TopBar />
      <main className="page" style={{ maxWidth: 760, margin: "0 auto", padding: "16px" }}>
        <p className="cm-msg info">Revisión local de reseñas de la comunidad (E3a). No es una pantalla de producto.</p>
        <h1 style={{ fontFamily: "var(--display)", fontSize: 24, margin: "16px 0" }}>{searchParams.titulo ?? `Título ${tipo} ${id}`}</h1>
        <ResenasComunidad key={`cm:${tipo}:${id}`} titulo={{ tipo, tmdbId: id }} />
      </main>
      <BottomNav />
    </>
  );
}
