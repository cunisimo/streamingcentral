"use client";
import PlatformLogo from "../PlatformLogo";
import { genreLabel } from "../data";
import { formatoDuracion, hayAdvertencia } from "@/lib/sala/votacion-nucleo";
import type { CardSala as Card } from "@/lib/sala/tipos";
import type { PlatformCode } from "@/lib/types";

// La card que se vota. Misma anatomía que la tarjeta de la ruleta (`.rlt-*`):
// póster, identidad, "Por qué verla" y "Pero" — pero SIN enlace a la ficha: en
// la sala se decide con lo que hay, no se navega (ir a la ficha corta los 10 s
// y desincroniza la ronda). El "Pero" se dibuja SÓLO si tiene contenido: sin
// título, sin caja vacía, sin texto de reemplazo.
export default function CardSala({ card, union }: { card: Card; union: PlatformCode[] }) {
  const meta = [card.anio, formatoDuracion(card.runtime), card.generos.length ? card.generos.map(genreLabel).join(" / ") : null]
    .filter(Boolean).join(" · ");
  return (
    <div className="rlt-card sala-card">
      <div className="rlt-head">
        {card.poster && (
          <span className="rlt-poster"><img src={card.poster} alt="" loading="eager" /></span>
        )}
        <div className="rlt-ident sala-ident">
          <h2 className="rlt-title">{card.titulo}</h2>
          {meta && <p className="rlt-meta">{meta}</p>}
          {card.platforms.length > 0 && (
            <div className="rlt-tags">
              {card.platforms.map((p) => (
                <span key={p} className={`rlt-tag ${union.includes(p) ? "rlt-tag-plat" : ""}`}><PlatformLogo code={p} /></span>
              ))}
            </div>
          )}
        </div>
      </div>
      <span className="chip-group-label">Por qué verla</span>
      <p className="rlt-razon">{card.razon}</p>
      {hayAdvertencia(card.advertencia) && (
        <div className="rlt-pero">
          <span className="rlt-pero-lab">⚠ Pero</span>
          <p>{card.advertencia}</p>
        </div>
      )}
    </div>
  );
}
