"use client";
import type React from "react";
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
// Auto-cierre. Es un TECHO, no la duración: el overlay se descarta con un toque
// en cualquier parte, Escape, Enter o "Seguir" (decisión del dueño, 23/09: el
// que ya lo vio muchas veces sigue de largo). La coreografía del corazón dura
// 870 ms y todo lo demás entra antes de 1,7 s, así que el resto es confeti.
// 🔴 El mismo número está en `sala-cel-fin` de globals.css (CSS no lee
// constantes de TS): si cambia acá y no allá, el overlay se apaga y vuelve.
// Hay un test que ata los dos.
export const DURACION_CELEBRACION_MS = 2400;

const CHISPAS = [0, 45, 90, 135, 180, 225, 270, 315];

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
      {/* 60, no 90: es lo más caro de la pantalla (una pieza = un elemento
          animando su transform) y es donde está el riesgo de fps en un
          teléfono de gama media. Se baja ACÁ y no el default del componente,
          que lo comparte la ruleta "Desempatá" y no se toca. */}
      <Confetti count={60} />
      <div className="sala-celebracion-cuerpo">
        <div className="sala-corazon sala-corazon-grande" aria-hidden>
          <span className="sala-mitad sala-mitad-izq" />
          <span className="sala-mitad sala-mitad-der" />
          {/* Las chispas del impacto: 8 puntos que salen del centro. SÓLO acá
              —en el corazón chico de la pantalla de resultado no valen el DOM—.
              El ángulo va por variable CSS y la animación es transform + opacity. */}
          <span className="sala-chispas">
            {CHISPAS.map((a) => <i key={a} style={{ ["--a" as string]: `${a}deg` } as React.CSSProperties} />)}
          </span>
        </div>
        <h1 className="sala-celebracion-titulo">¡Hay match!</h1>
        {card.poster && <img className="sala-celebracion-poster" src={card.poster} alt="" />}
        <p className="sala-celebracion-nombre">{card.titulo}</p>
      </div>
      <button type="button" className="rlt-btn sala-celebracion-seguir" onClick={(e) => { e.stopPropagation(); onFin(); }}>Seguir</button>
    </div>
  );
}
