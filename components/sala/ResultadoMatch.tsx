"use client";
import Link from "next/link";
import PlatformLogo from "../PlatformLogo";
import Confetti from "../desempate/Confetti";
import CompartirMatch from "./CompartirMatch";
import PrepararTanda from "./PrepararTanda";
import { genreLabel } from "../data";
import { hrefTitulo } from "@/lib/rutas";
import { formatoDuracion } from "@/lib/sala/votacion-nucleo";
import { useVenceEn, formatoSeg } from "@/hooks/useVenceEn";
import type { EstadoSala } from "@/lib/sala/estado";
import type { CardSala } from "@/lib/sala/tipos";

// "¡Hay match!" (plan de salas, Tarea 4.1). Consume SÓLO `estado.resultado`
// (quién ganó lo dice la base: `ganador_pos`); acá no se cuenta ningún voto.
// En grupos el resultado es `ganador` (la más votada, aunque tenga 2 votos) y
// el texto es el mismo: es "nuestro match".
//
// Animación: dos mitades de corazón que se juntan (`sala-mitad-izq/der`) y el
// confeti de "Desempatá". Con `prefers-reduced-motion: reduce` el CSS deja el
// estado final sin transición y Confetti no se dibuja.
export default function ResultadoMatch({ estado, card, roomId, desfase }: {
  estado: EstadoSala; card: CardSala; roomId: string; desfase: number;
}) {
  const seg = useVenceEn(estado, desfase);
  return (
    <div className="sala-resultado sala-match">
      <Confetti count={60} />
      <div className="sala-corazon" aria-hidden>
        <span className="sala-mitad sala-mitad-izq" />
        <span className="sala-mitad sala-mitad-der" />
      </div>
      <h1 className="sala-h1 sala-titular">¡Hay match!</h1>
      <p className="sala-hint">{estado.n > 2 ? "La que más votaron entre todos. Nuestro match." : "Los dos dijeron que sí."}</p>
      <Ganadora card={card} union={estado.union} />
      <div className="sala-acciones sala-acciones-resultado">
        <CompartirMatch card={card} union={estado.union} />
        <Link className="rlt-btn" href={hrefTitulo("movie", card.tmdb_id)}>Ver la ficha</Link>
      </div>
      <PieResultado estado={estado} roomId={roomId} seg={seg} />
    </div>
  );
}

/** La película elegida: póster, identidad y plataformas (las de la sala, destacadas). */
export function Ganadora({ card, union }: { card: CardSala; union: CardSala["platforms"] }) {
  const meta = [card.anio, formatoDuracion(card.runtime), card.generos.length ? card.generos.map(genreLabel).join(" / ") : null]
    .filter(Boolean).join(" · ");
  return (
    <div className="sala-ganadora">
      {card.poster && <span className="rlt-poster sala-ganadora-poster"><img src={card.poster} alt="" /></span>}
      <div className="sala-ganadora-body">
        <h2 className="rlt-title">{card.titulo}</h2>
        {meta && <p className="rlt-meta">{meta}</p>}
        {card.platforms.length > 0 && (
          <div className="rlt-tags">
            {card.platforms.map((p) => (
              <span key={p} className={`rlt-tag ${union.includes(p) ? "rlt-tag-plat" : ""}`}><PlatformLogo code={p} /></span>
            ))}
          </div>
        )}
        <span className="chip-group-label">Por qué verla</span>
        <p className="rlt-razon">{card.razon}</p>
      </div>
    </div>
  );
}

/**
 * El pie común de los resultados: cuánto queda de la ventana de 5 min y, para
 * el organizador, "Otra tanda" (la misma preparación que "Empezar": renueva
 * `expires_at`, conserva participantes y plataformas, excluye lo ya mostrado).
 * `puede_otra_tanda` lo decide la base (host + estado `resultado`): con un
 * empate sin resolver no aparece.
 */
export function PieResultado({ estado, roomId, seg }: { estado: EstadoSala; roomId: string; seg: number | null }) {
  const puede = estado.resultado?.puede_otra_tanda === true;
  return (
    <div className="sala-pie-resultado">
      {seg !== null && seg > 0 && (
        <p className="sala-vence" role="status">La sala se cierra en <strong>{formatoSeg(seg)}</strong>{puede ? " si no empezás otra tanda." : "."}</p>
      )}
      {puede ? (
        <section className="sala-bloque">
          <span className="chip-group-label">¿Otra tanda?</span>
          <PrepararTanda roomId={roomId} rotulo="Otra tanda" hint="Sin repetir las películas que ya salieron." />
        </section>
      ) : (
        estado.estado === "resultado" && <p className="sala-hint">Quien organiza puede pedir otra tanda.</p>
      )}
    </div>
  );
}
