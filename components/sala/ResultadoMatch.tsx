"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import PlatformLogo from "../PlatformLogo";
import Confetti from "../desempate/Confetti";
import CompartirMatch from "./CompartirMatch";
import PrepararTanda from "./PrepararTanda";
import CerrarSala from "./CerrarSala";
import CelebracionMatch, { permiteCelebracion } from "./CelebracionMatch";
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
// Primero la CELEBRACIÓN a pantalla completa (CelebracionMatch: corazón grande,
// título, póster, confeti, ~3 s o "Seguir"); debajo ya está esta pantalla con
// todo lo accionable: póster, plataformas, Compartir, Ver la ficha y —para el
// organizador— "Cerrar sala": con ganadora la sala se termina y NO se ofrece
// otra tanda (decisión del dueño, 23/09; ver PieResultado). Con
// `prefers-reduced-motion: reduce` la celebración no se monta y esta pantalla
// queda en su estado final sin transición.
export default function ResultadoMatch({ estado, card, roomId, desfase, releer }: {
  estado: EstadoSala; card: CardSala; roomId: string; desfase: number; releer: () => Promise<void>;
}) {
  const seg = useVenceEn(estado, desfase);
  // Una vez por montaje (= por ronda, SalaView usa key = ronda.id).
  const [celebrando, setCelebrando] = useState(() => permiteCelebracion());
  const terminar = useCallback(() => setCelebrando(false), []);
  return (
    <div className="sala-resultado sala-match" aria-busy={celebrando}>
      {celebrando && <CelebracionMatch card={card} onFin={terminar} />}
      {!celebrando && <Confetti count={40} />}
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
      <PieResultado estado={estado} roomId={roomId} seg={seg} releer={releer} />
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
 * El pie común de los tres resultados: cuánto queda de la ventana de 5 min y,
 * debajo, lo único que se puede hacer.
 *
 * 🔴 CON GANADORA NO HAY "OTRA TANDA" (decisión del dueño, 23/09). Si el
 * grupo ya tiene película —por match directo o después de desempatar— la sala
 * se terminó; para otra ronda se arma una sala nueva. El plan la ofrecía en las
 * tres pantallas y eso cambió. **Lo decide la base**: `puede_otra_tanda` pide
 * host, estado `resultado` y `ganador_pos is null`, así que acá no se deduce
 * nada; "Otra tanda" queda sólo para "Esta vez no coincidieron".
 *
 * Y por eso el organizador ve acá "Cerrar sala": no puede tener dos salas
 * activas, y sin este botón tendría que esperar los 5 minutos de la ventana
 * para poder armar la siguiente.
 *
 * Al invitado, cuando no puede hacer nada, no se le dice nada: acá había un
 * "Quien organiza puede pedir otra tanda." que el dueño sacó el 23/09 —la
 * pantalla del invitado termina en la bajada— y que además repetía lo que ya
 * dice la línea de vencimiento.
 */
export function PieResultado({ estado, roomId, seg, releer }: { estado: EstadoSala; roomId: string; seg: number | null; releer: () => Promise<void> }) {
  const puede = estado.resultado?.puede_otra_tanda === true;
  // Se LEE el ganador que ya calculó la base (`sala_computar` / `sala_desempatar`),
  // no se cuenta ningún voto.
  const hayGanadora = typeof estado.resultado?.ganador_pos === "number";
  return (
    <div className="sala-pie-resultado">
      {seg !== null && seg > 0 && (
        <p className="sala-vence" role="status">La sala se cierra en <strong>{formatoSeg(seg)}</strong>{puede ? " si no empezás otra tanda." : "."}</p>
      )}
      {hayGanadora ? (
        <>
          <p className="sala-hint">Ya tienen película. Para otra ronda, armen una sala nueva.</p>
          {estado.soy.es_host && <CerrarSala roomId={roomId} />}
        </>
      ) : puede ? (
        <section className="sala-bloque">
          <span className="chip-group-label">¿Otra tanda?</span>
          <PrepararTanda roomId={roomId} rotulo="Otra tanda" releer={releer} hint="Sin repetir las películas que ya salieron." />
        </section>
      ) : null}
    </div>
  );
}
