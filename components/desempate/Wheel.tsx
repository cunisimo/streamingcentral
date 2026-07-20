"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { UITitle } from "@/lib/types";
import { useSlotSound } from "./useSlotSound";

// Cuántas veces se repite la lista para armar un riel largo (sensación de giro
// aunque haya solo 2-3 pósters).
const LOOPS = 8;
const GAP = 8; // px entre pósters del riel

const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Rueda de la fortuna horizontal: el riel se desplaza hacia la izquierda y
// desacelera hasta dejar el ganador bajo el marcador central. Un solo riel,
// un solo marcador → se entiende cuál gana sin esperar la ficha.
//
// La animación usa la Web Animations API (element.animate) en vez de una
// transición CSS disparada por estado: no depende del timing de re-render de
// React, de requestAnimationFrame (que el panel de preview throttlea), ni se
// rompe con el doble-montaje de efectos de StrictMode. onfinish da el cierre.
export default function Wheel({
  selected, winnerIdx, onFinish,
}: {
  selected: UITitle[];
  winnerIdx: number;
  onFinish: () => void;
}) {
  const sound = useSlotSound();
  const reduce = prefersReduced();
  const n = selected.length;
  const [tile] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 560 ? { w: 104, h: 156 } : { w: 132, h: 198 },
  );
  const pitch = tile.w + GAP;
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef(false);
  const [vw, setVw] = useState(0);

  const strip = useMemo(() => {
    const arr: UITitle[] = [];
    for (let i = 0; i < LOOPS; i++) arr.push(...selected);
    return arr;
  }, [selected]);

  const targetIndex = (LOOPS - 1) * n + winnerIdx;
  const duration = reduce ? 300 : 4200;

  useLayoutEffect(() => {
    if (viewportRef.current) setVw(viewportRef.current.clientWidth);
  }, []);

  useEffect(() => {
    if (!vw || !trackRef.current) return;
    // Centra el póster ganador bajo el marcador (centro del viewport).
    const targetX = vw / 2 - tile.w / 2 - targetIndex * pitch;
    const anim = trackRef.current.animate(
      [{ transform: "translateX(0px)" }, { transform: `translateX(${targetX}px)` }],
      { duration, easing: "cubic-bezier(.11,.62,.14,1)", fill: "forwards" },
    );
    const done = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      sound.win();
      onFinish();
    };
    anim.onfinish = done;
    // Red de seguridad si onfinish no dispara por algún motivo del entorno.
    const fallback = setTimeout(done, duration + 500);
    // Ticks que se van espaciando, como el clic de una rueda al frenar.
    const ticks = reduce ? [] : [0, 250, 550, 950, 1450, 2050, 2750, 3450, 4050].map((d) => setTimeout(sound.tick, d));
    return () => { anim.cancel(); clearTimeout(fallback); ticks.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vw]);

  return (
    <div className="dsmp-wheel">
      <div className="dsmp-wheel-viewport" ref={viewportRef} style={{ height: tile.h }}>
        <div className="dsmp-wheel-track" ref={trackRef} style={{ gap: GAP }}>
          {strip.map((t, i) => (
            <div
              key={i}
              className="dsmp-wheel-tile"
              style={{ width: tile.w, height: tile.h, ...(t.poster ? { backgroundImage: `url(${t.poster})` } : { background: "#3A3A42" }) }}
            >
              {!t.poster && <span className="dsmp-wheel-tile-txt">{t.title}</span>}
            </div>
          ))}
        </div>
        <div className="dsmp-wheel-fade left" aria-hidden />
        <div className="dsmp-wheel-fade right" aria-hidden />
        <div className="dsmp-wheel-marker" style={{ width: tile.w + 6 }} aria-hidden>
          <span className="dsmp-wheel-pointer" />
        </div>
      </div>
      <div className="dsmp-slot-foot">
        <span className="dsmp-spinning-txt">Girando la rueda…</span>
        <button
          className={`dsmp-mute ${sound.enabled ? "on" : ""}`}
          onClick={sound.toggle}
          aria-label={sound.enabled ? "Silenciar" : "Activar sonido"}
          title={sound.enabled ? "Silenciar" : "Activar sonido"}
        >
          {sound.enabled ? "🔊" : "🔇"}
        </button>
      </div>
    </div>
  );
}
