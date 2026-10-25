"use client";
import { useState } from "react";
import { accionVoto, conteoUtilidad, mensajeVoto, nombreBotonVoto, puedeEvaluar, type Voto } from "@/lib/comunidad/evaluacion-nucleo";

// Pulgar arriba / pulgar abajo (E3a; iconos pedidos por el dueño el 25/10).
// Encima, el conteo explícito: "285 de 481 encontraron útil esta opinión".
// Tocar el pulgar ya elegido retira el voto; tocar el otro lo cambia; la
// propia reseña muestra el conteo sin botones. La lógica vive en
// lib/comunidad/evaluacion-nucleo.ts (puro, con tests). No es optimista: lo
// que se ve sale de la recarga después de la respuesta.
//
// Los trazos son los de components/LikeButton.tsx. El SVG lleva width y
// height propios además del CSS: un SVG sin tamaño mide 0×0 dentro de un
// flex (pasó con el ícono de compartir de Salas). Mientras se envía, el
// botón queda `aria-disabled` y no `disabled`: un botón deshabilitado pierde
// el foco y quien vota con teclado vuelve al principio de la página.
const PULGAR_ARRIBA = ["M7 10v12", "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"];
const PULGAR_ABAJO = ["M17 14V2", "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"];

function Pulgar({ abajo, lleno }: { abajo?: boolean; lleno: boolean }) {
  return (
    <svg className="cm-pulgar-ico" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill={lleno ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {(abajo ? PULGAR_ABAJO : PULGAR_ARRIBA).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export default function EvaluacionResena({
  versionId, utiles, total, miVoto, esPropia, votar,
}: {
  versionId: number;
  utiles: number;
  total: number;
  miVoto: Voto | null;
  esPropia: boolean;
  votar: (versionId: number, voto: Voto | "retirar") => Promise<{ resultado?: unknown; motivo?: unknown } | "sin-confirmar">;
}) {
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function tocar(boton: Voto) {
    if (enviando) return;
    setEnviando(true);
    setMsg(null);
    const r = await votar(versionId, accionVoto(miVoto, boton));
    setMsg(mensajeVoto(r));
    setEnviando(false);
  }

  const boton = (v: Voto) => {
    const elegido = miVoto === v;
    return (
      <button type="button" className={`cm-pulgar${elegido ? " on" : ""}${v === "no_util" ? " abajo" : ""}`}
        aria-label={nombreBotonVoto(v)} aria-pressed={elegido} title={nombreBotonVoto(v)}
        aria-disabled={enviando} onClick={() => void tocar(v)}>
        <Pulgar abajo={v === "no_util"} lleno={elegido} />
      </button>
    );
  };

  return (
    <div className="cm-eval">
      <p className="cm-conteo" aria-live="polite">{conteoUtilidad(utiles, total)}</p>
      {puedeEvaluar(esPropia, true) && (
        <div className="cm-eval-btns" role="group" aria-label="¿Te sirvió esta opinión?">
          {boton("util")}
          {boton("no_util")}
        </div>
      )}
      {msg && <p className="cm-msg rechazo" role="alert">{msg}</p>}
    </div>
  );
}
