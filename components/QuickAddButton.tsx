"use client";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import { useMyList } from "./MyListContext";
import type { MediaType } from "@/lib/types";

// Botón de "agregar a Mi lista" rápido, sobre la card, sin entrar a la ficha.
// Vive fuera del <Link> de la card (como hermano), así el click no navega y no
// se anida un <button> dentro de un <a>.
export default function QuickAddButton({ id, tipo }: { id: number; tipo: MediaType }) {
  const { user } = useAuth();
  const router = useRouter();
  const list = useMyList();
  const inList = list?.has(id, tipo) ?? false;

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) { router.push("/cuenta"); return; }
    void list?.toggle(id, tipo);
  }

  return (
    <button
      type="button"
      className={`quick-add ${inList ? "on" : ""}`}
      onClick={onClick}
      aria-label={inList ? "Quitar de Mi lista" : "Agregar a Mi lista"}
      aria-pressed={inList}
    >
      {inList
        ? <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        : <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>}
    </button>
  );
}
