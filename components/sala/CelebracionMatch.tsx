"use client";
import { useEffect } from "react";
import Confetti from "../desempate/Confetti";
import type { CardSala } from "@/lib/sala/tipos";

// La celebración del match A PANTALLA COMPLETA (plan de salas, Tarea 4.1;
// corrección del dueño: el resultado adentro del contenedor de 640 px con un
// corazón de 96 px no se sentía a pantalla completa en el teléfono).
//
// Es un overlay `position: fixed; inset: 0` por encima de la barra inferior:
// el corazón grande (dos mitades que se juntan, ~45 % del ancho de la
// pantalla), "¡Hay match!", el póster que aparece y el confeti. Dura ~3 s y se
// va solo (fundido), o antes con "Seguir" / Escape / un toque; debajo ya está
// la pantalla de resultado completa (póster, plataformas, Compartir, Ver la
// ficha, Otra tanda), así que al terminar no falta nada.
//
// Con `prefers-reduced-motion: reduce` NO se monta (lo decide quien lo usa con
// `permiteCelebracion()`): se va directo al estado final, sin transición.
export const DURACION_CELEBRACION_MS = 3300;

export function permiteCelebracion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function CelebracionMatch({ card, onFin }: { card: CardSala; onFin: () => void }) {
  useEffect(() => {
    const t = setTimeout(onFin, DURACION_CELEBRACION_MS);
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") onFin(); };
    window.addEventListener("keydown", tecla);
    // Mientras dura, la página de atrás no scrollea.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { clearTimeout(t); window.removeEventListener("keydown", tecla); document.body.style.overflow = prev; };
  }, [onFin]);

  return (
    <div className="sala-celebracion" role="dialog" aria-modal="true" aria-label="¡Hay match!" onClick={onFin}>
      <Confetti count={90} />
      <div className="sala-celebracion-cuerpo">
        <div className="sala-corazon sala-corazon-grande" aria-hidden>
          <span className="sala-mitad sala-mitad-izq" />
          <span className="sala-mitad sala-mitad-der" />
        </div>
        <h1 className="sala-celebracion-titulo">¡Hay match!</h1>
        {card.poster && <img className="sala-celebracion-poster" src={card.poster} alt="" />}
        <p className="sala-celebracion-nombre">{card.titulo}</p>
      </div>
      <button type="button" className="rlt-btn sala-celebracion-seguir" onClick={(e) => { e.stopPropagation(); onFin(); }}>Seguir</button>
    </div>
  );
}
