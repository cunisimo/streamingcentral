"use client";
import { platformByCode } from "@/lib/providers-ar";
import { enlaceWhatsapp, mensajeCompartir } from "@/lib/compartir";
import type { CardSala } from "@/lib/sala/tipos";
import type { PlatformCode } from "@/lib/types";

// Compartir la película del match. Reusa el mensaje de ficha de
// lib/compartir.ts (url canónica, plataforma adentro del texto) con el mismo
// esquema que DetailView: `navigator.share` si existe, WhatsApp si no. El
// mensaje propio del match ("nuestro match", la sala) es la Etapa 5; acá no se
// inventa texto nuevo.
export default function CompartirMatch({ card, union }: { card: CardSala; union: PlatformCode[] }) {
  const compartir = () => {
    const donde = card.platforms.find((p) => union.includes(p)) ?? card.platforms[0];
    const nombre = (donde ? platformByCode(donde)?.name : null) ?? null;
    const m = mensajeCompartir({ title: card.titulo, year: card.anio, type: "movie", id: card.tmdb_id }, nombre);
    const whatsapp = () => window.open(enlaceWhatsapp(m), "_blank", "noopener");
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      navigator.share({ title: m.titulo, text: m.texto, url: m.url }).catch(() => { /* canceló */ });
    } else {
      whatsapp();
    }
  };
  return (
    <button type="button" className="rlt-btn" onClick={compartir}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
      </svg>
      Compartir
    </button>
  );
}
