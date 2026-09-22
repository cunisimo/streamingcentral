"use client";
import { platformByCode } from "@/lib/providers-ar";
import { mensajeMatch } from "@/lib/compartir";
import { compartir } from "@/lib/compartir-accion";
import type { CardSala } from "@/lib/sala/tipos";
import type { PlatformCode } from "@/lib/types";

// Compartir la película del match (Etapa 5, Tarea 5.1).
//
// El MENSAJE es el propio de Pelimatch (`mensajeMatch`): "¡Nuestro match!", las
// plataformas donde está y el enlace canónico a la ficha. No es el de la ficha
// —ahí se recomienda un título; acá se cuenta que el grupo coincidió—.
//
// La ACCIÓN es la misma de toda la app (`lib/compartir-accion.ts`): contenedor →
// plugin de Capacitor, web → `navigator.share`, resto → WhatsApp, y cerrar la
// hoja no abre nada.
//
// Las plataformas se ordenan poniendo primero las de la sala: si la película
// está en cuatro y la sala tiene una, esa es la que le importa a quien lee el
// mensaje. Se nombran con `providers-ar.ts`, no con el código interno.
export default function CompartirMatch({ card, union }: { card: CardSala; union: PlatformCode[] }) {
  const nombres = [...card.platforms]
    .sort((a, b) => Number(union.includes(b)) - Number(union.includes(a)))
    .map((c) => platformByCode(c)?.name)
    .filter((n): n is string => !!n);

  return (
    <button type="button" className="rlt-btn" onClick={() => void compartir(mensajeMatch({ title: card.titulo, type: "movie", id: card.tmdb_id }, nombres))}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
      </svg>
      Compartir
    </button>
  );
}
