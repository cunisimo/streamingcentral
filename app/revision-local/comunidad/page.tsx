import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import ResenasAcordeon from "@/components/ResenasAcordeon";
import type { ResenaFicha } from "@/lib/resenas";
import { revisionLocalHabilitada } from "@/lib/comunidad/revision-local";

// 🔴 PÁGINA DE REVISIÓN LOCAL (E3a), no es producto. Monta el MISMO
// componente que la ficha (`ResenasAcordeon`, E5a) para un título fijo, porque la
// ficha real necesita TMDB y el entorno local de reseñas no tiene ese token
// (no se usa `.env.local`). Responde 404 salvo que se cumplan LAS DOS cosas:
// no es un build de producción y `COMUNIDAD_REVISION_LOCAL=1`, que sólo está
// en `.env.comunidad-local` (ignorado por Git). Un test fija esta guarda.
// Sale del código antes del AAB, o queda inerte por la guarda.
export const dynamic = "force-dynamic";

// `?yump=1` agrega una reseña de Yump FICTICIA (sólo esta página) para ver que
// va primera; no lee ni toca `editorial_reviews`.
const YUMP_FICTICIA: ResenaFicha[] = [{
  id: "yump", origen: "yump", autor: "Reseña Yump", rating: null, fecha: "26/10/2026",
  texto: "Reseña de Yump FICTICIA de la página de revisión local: sólo comprueba que va primera.",
}];

export default function RevisionLocalComunidad({ searchParams }: { searchParams: { tipo?: string; id?: string; titulo?: string; yump?: string } }) {
  if (!revisionLocalHabilitada()) notFound();
  const tipo = searchParams.tipo === "tv" ? "tv" : "movie";
  const id = Number(searchParams.id ?? "603");
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return (
    <>
      <TopBar />
      <main className="page" style={{ maxWidth: 760, margin: "0 auto", padding: "16px 16px calc(var(--nav-total) + 20px)" }}>
        <p className="cm-msg info">Revisión local de reseñas de la comunidad (E3a–E5a). No es una pantalla de producto.</p>
        <h1 style={{ fontFamily: "var(--display)", fontSize: 24, margin: "16px 0" }}>{searchParams.titulo ?? `Título ${tipo} ${id}`}</h1>
        <ResenasAcordeon key={`${tipo}:${id}`} resenas={searchParams.yump === "1" ? YUMP_FICTICIA : []} titulo={{ tipo, tmdbId: id }} />
      </main>
      <BottomNav />
    </>
  );
}
