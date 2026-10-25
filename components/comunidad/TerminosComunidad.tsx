"use client";
import { useState } from "react";
import { TERMINOS_PUNTOS, TERMINOS_VERSION } from "@/lib/comunidad/terminos";
import { mensajeEscritura } from "@/lib/comunidad/mensajes";

// Aceptación versionada de los términos de la comunidad (E3a), antes de crear
// contenido. 🔴 El texto es un BORRADOR LOCAL sin aprobar (lib/comunidad/terminos.ts).
export default function TerminosComunidad({ aceptar }: { aceptar: (version: string) => Promise<unknown> }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    const r = await aceptar(TERMINOS_VERSION);
    if (!(r && typeof r === "object" && (r as { resultado?: unknown }).resultado === "terminos_aceptados")) {
      setError(mensajeEscritura((r as { resultado?: unknown }) ?? "sin-confirmar").texto);
    }
    setEnviando(false);
  }

  return (
    <div className="cm-bloque" role="group" aria-labelledby="cm-terminos-t">
      <h3 id="cm-terminos-t" className="cm-h">Antes de escribir</h3>
      <p className="cm-sub">Para publicar y evaluar reseñas tenés que aceptar los términos de la comunidad (versión {TERMINOS_VERSION}).</p>
      <ul className="dlg-lista">
        {TERMINOS_PUNTOS.map((p) => <li key={p}>{p}</li>)}
      </ul>
      {error && <p className="cm-msg rechazo" role="alert">{error}</p>}
      <button className="btn" onClick={() => void enviar()} disabled={enviando}>
        {enviando ? "Guardando…" : "Acepto los términos"}
      </button>
    </div>
  );
}
