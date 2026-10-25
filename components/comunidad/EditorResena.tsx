"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  avisoReinicio, conservarIntento, contador, etiquetaEstado, firmaEnvio, intentoPara, puedeEnviar,
  type Intento, type Persistida, type Titulo,
} from "@/lib/comunidad/editor-nucleo";
import { AVISO_REINICIO, mensajeEscritura, type Tono } from "@/lib/comunidad/mensajes";

export type RespuestaEditor = Record<string, unknown> | "sin-confirmar";

// Escribir, editar y borrar la propia reseña (E3a). Lo que decide vive en
// lib/comunidad/editor-nucleo.ts (puro, con tests):
//   - el contador cuenta igual que el servidor y la base;
//   - al editar un texto ya guardado se avisa ANTES de confirmar que se
//     reinician los votos;
//   - un reintento del mismo envío reusa el id_intento: si la respuesta se
//     perdió, reintentar no duplica ni reinicia votos dos veces;
//   - ningún mensaje afirma un resultado que no se confirmó.
export default function EditorResena({
  titulo, mia, enviar, borrar, recargar,
}: {
  titulo: Titulo;
  mia: Persistida | null;
  enviar: (cuerpo: Record<string, unknown>) => Promise<RespuestaEditor>;
  borrar: (resenaId: number) => Promise<RespuestaEditor>;
  recargar: () => void;
}) {
  const [texto, setTexto] = useState(mia?.texto ?? "");
  const [editando, setEditando] = useState(mia === null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tono: Tono; texto: string } | null>(null);
  const [confirmar, setConfirmar] = useState<"reinicio" | "borrar" | null>(null);
  const intento = useRef<Intento | null>(null);
  // Cuando llega otra versión persistida (recién guardada, borrada o cambiada
  // en otro dispositivo) y no se está editando, la vista la toma. El editor NO
  // se vuelve a montar: así el mensaje del último envío sigue a la vista.
  const versionVista = mia?.versionId ?? null;
  useEffect(() => {
    if (enviando) return;
    setTexto(mia?.texto ?? "");
    setEditando(mia === null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionVista]);
  const idTexto = useId();
  const idCont = useId();
  const c = contador(texto);

  async function guardar() {
    setConfirmar(null);
    if (!puedeEnviar(mia, texto, enviando)) return;
    setEnviando(true);
    setMsg(null);
    const it = intentoPara(intento.current, firmaEnvio(mia, titulo, texto), () => crypto.randomUUID());
    intento.current = it;
    const cuerpo = mia
      ? { accion: "editar", resena_id: mia.resenaId, version_esperada: mia.versionId, texto, id_intento: it.id }
      : { accion: "publicar", tipo: titulo.tipo, tmdb_id: titulo.tmdbId, texto, id_intento: it.id };
    const r = await enviar(cuerpo);
    if (!conservarIntento(r === "sin-confirmar" ? r : (r as { resultado?: unknown }))) intento.current = null;
    setMsg(mensajeEscritura(r === "sin-confirmar" ? r : (r as { resultado?: unknown })));
    setEnviando(false);
    const res = r === "sin-confirmar" ? null : r.resultado;
    if (res === "publicada" || res === "retenida") { setEditando(false); recargar(); }
    if (res === "rechazo_cuenta" && (r as { motivo?: unknown }).motivo === "resena_existente") recargar();
  }

  function pedirGuardar() {
    if (avisoReinicio(mia, texto)) setConfirmar("reinicio");
    else void guardar();
  }

  async function borrarla() {
    setConfirmar(null);
    if (!mia || enviando) return;
    setEnviando(true);
    setMsg(null);
    const r = await borrar(mia.resenaId);
    setMsg(mensajeEscritura(r === "sin-confirmar" ? r : (r as { resultado?: unknown })));
    setEnviando(false);
    if (r !== "sin-confirmar" && r.resultado === "borrada") { setTexto(""); recargar(); }
  }

  return (
    <div className="cm-bloque">
      <h3 className="cm-h">{mia ? "Tu reseña" : "Escribí tu reseña"}</h3>
      {mia && !editando && (
        <>
          <p className="cm-estado">{etiquetaEstado(mia.estado)}</p>
          <p className="cm-texto">{mia.texto}</p>
          <div className="cm-acciones">
            <button className="btn ghost" onClick={() => { setTexto(mia.texto); setEditando(true); setMsg(null); }}>Editar</button>
            <button className="cfg-danger-btn" onClick={() => setConfirmar("borrar")} disabled={enviando}>Borrar</button>
          </div>
        </>
      )}
      {editando && (
        <>
          <label className="dlg-lbl" htmlFor={idTexto}>{mia ? "Editá tu reseña" : "Qué te pareció"}</label>
          <textarea id={idTexto} className="cm-textarea" value={texto} rows={6} disabled={enviando}
            aria-describedby={idCont} onChange={(e) => setTexto(e.target.value)} />
          <p id={idCont} className={`cm-contador ${c.estado}`} aria-live="polite">{c.texto}</p>
          {c.aviso && <p className="cm-msg rechazo" role="alert">{c.aviso}</p>}
          {mia && avisoReinicio(mia, texto) && <p className="cm-aviso">{AVISO_REINICIO}</p>}
          <div className="cm-acciones">
            {mia && <button className="btn ghost" disabled={enviando} onClick={() => { setEditando(false); setTexto(mia.texto); setMsg(null); }}>Cancelar</button>}
            <button className="btn" disabled={!puedeEnviar(mia, texto, enviando)} onClick={pedirGuardar}>
              {enviando ? "Guardando…" : mia ? "Guardar cambios" : "Publicar"}
            </button>
          </div>
        </>
      )}
      {msg && (
        <p className={`cm-msg ${msg.tono}`} role={msg.tono === "exito" || msg.tono === "info" ? "status" : "alert"}>
          {msg.texto}
          {msg.tono === "sin_confirmar" && editando && <> <button className="cm-link" onClick={() => void guardar()}>Reintentar</button></>}
          {msg.tono === "rechazo" && mia && /otro dispositivo/.test(msg.texto) && <> <button className="cm-link" onClick={recargar}>Recargar</button></>}
        </p>
      )}

      {confirmar && (
        <div className="dlg-backdrop" onClick={() => setConfirmar(null)} role="presentation">
          <div className="dlg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cm-conf-t">
            <h2 id="cm-conf-t">{confirmar === "borrar" ? "Borrar tu reseña" : "Guardar cambios"}</h2>
            <p className="dlg-sub">
              {confirmar === "borrar"
                ? "Tu reseña deja de verse al instante. No se puede deshacer."
                : `${AVISO_REINICIO} ¿Querés guardar igual?`}
            </p>
            <div className="dlg-acciones">
              <button className="btn ghost" autoFocus onClick={() => setConfirmar(null)}>Cancelar</button>
              {confirmar === "borrar"
                ? <button className="cfg-danger-btn" onClick={() => void borrarla()}>Borrar</button>
                : <button className="btn" onClick={() => void guardar()}>Guardar</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
