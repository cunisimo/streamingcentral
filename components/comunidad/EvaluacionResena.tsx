"use client";
import { useState } from "react";
import { accionVoto, conteoUtilidad, mensajeVoto, puedeEvaluar, type Voto } from "@/lib/comunidad/evaluacion-nucleo";

// "Me sirvió" / "No me sirvió" (E3a). Tocar el botón ya elegido retira el
// voto. El conteo es explícito ("A n de m les sirvió"). La lógica vive en
// lib/comunidad/evaluacion-nucleo.ts (puro, con tests). No es optimista: lo
// que se ve sale de la recarga después de la respuesta.
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

  return (
    <div className="cm-eval">
      <span className="cm-conteo" aria-live="polite">{conteoUtilidad(utiles, total)}</span>
      {puedeEvaluar(esPropia, true) && (
        <span className="cm-eval-btns">
          <button type="button" className={`cm-chip${miVoto === "util" ? " on" : ""}`} aria-pressed={miVoto === "util"}
            disabled={enviando} onClick={() => void tocar("util")}>Me sirvió</button>
          <button type="button" className={`cm-chip${miVoto === "no_util" ? " on" : ""}`} aria-pressed={miVoto === "no_util"}
            disabled={enviando} onClick={() => void tocar("no_util")}>No me sirvió</button>
        </span>
      )}
      {msg && <p className="cm-msg rechazo" role="alert">{msg}</p>}
    </div>
  );
}
