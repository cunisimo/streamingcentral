"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  adoptar, alCambiarPersistida, avisoReinicio, cargarRemota, conservarIntento, contador, cuerpoEnvio, cuerpoRevision, empezarEdicion,
  etiquetaEstado, firmaEnvio, firmaRevision, guardoVersion, hayBorrador, intentoPara, mantenerBorrador, ofreceRevision, publicarComoNueva,
  puedeEnviar, trasGuardado, type EstadoEditor, type Intento, type Persistida, type Titulo,
} from "@/lib/comunidad/editor-nucleo";
import {
  AVISO_REINICIO, AVISO_REVISION_EDICION, MENSAJE_CONFLICTO_BORRADOR, OFERTA_REVISION, REMOTO_BORRADA, REMOTO_MODIFICADA, REMOTO_PUBLICADA,
  mensajeEscritura, type Tono,
} from "@/lib/comunidad/mensajes";
import { normalizarTexto } from "@/lib/comunidad/texto";

export type RespuestaEditor = Record<string, unknown> | "sin-confirmar";

// Escribir, editar y borrar la propia reseña (E3a). Lo que decide vive en
// lib/comunidad/editor-nucleo.ts (puro, con tests):
//   - el contador cuenta igual que el servidor y la base;
//   - al editar un texto ya guardado se avisa ANTES de confirmar que se
//     reinician los votos;
//   - un reintento del mismo envío reusa el id_intento: si la respuesta se
//     perdió, reintentar no duplica ni reinicia votos dos veces;
//   - ningún mensaje afirma un resultado que no se confirmó;
//   - una versión que llega de otra sesión mientras se edita NO pisa el
//     borrador ni cambia la versión esperada: aviso y decisión explícita (A2).
// Quien lo monta le da una `key` por cuenta y título (`claveEditor`): cambiar
// de una a otra empieza de cero, sin borrador ni intento.
//
// E3b, "Pedir revisión" (§3.3.3): sólo tras un rechazo por regla de
// contenido y mientras el texto sea el rechazado. Va por su propia ruta y con
// su propio id_intento; en una edición pide antes la confirmación de que la
// publicada deja de verse (§3.4.1). "Reintentar" repite la última acción.
export default function EditorResena({
  titulo, mia, enviar, pedirRevision, borrar, recargar,
}: {
  titulo: Titulo;
  mia: Persistida | null;
  enviar: (cuerpo: Record<string, unknown>) => Promise<RespuestaEditor>;
  pedirRevision: (cuerpo: Record<string, unknown>) => Promise<RespuestaEditor>;
  borrar: (resenaId: number) => Promise<RespuestaEditor>;
  recargar: () => void;
}) {
  const [e, setE] = useState<EstadoEditor>(() => adoptar(mia));
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ tono: Tono; texto: string } | null>(null);
  const [confirmar, setConfirmar] = useState<"reinicio" | "borrar" | "revision" | null>(null);
  const intento = useRef<Intento | null>(null);
  const intentoRev = useRef<Intento | null>(null);
  // El texto (normalizado) que las reglas rechazaron por contenido: la oferta
  // de revisión vale sólo para ESE texto.
  const [rechazado, setRechazado] = useState<string | null>(null);
  const ultima = useRef<"guardar" | "revision">("guardar");
  // La última versión persistida, para decidir al volver una respuesta.
  const miaActual = useRef(mia);
  miaActual.current = mia;
  // Otra versión persistida (recién guardada, borrada o cambiada en otro
  // dispositivo): el núcleo decide si se toma o si se avisa. El editor NO se
  // vuelve a montar: así el mensaje del último envío sigue a la vista.
  const versionVista = mia?.versionId ?? null;
  useEffect(() => {
    setE((x) => alCambiarPersistida(x, miaActual.current));
  }, [versionVista]);
  const idTexto = useId();
  const idCont = useId();
  const c = contador(e.texto);
  const base = e.base;

  async function guardar() {
    setConfirmar(null);
    if (!puedeEnviar(base, e.texto, enviando)) return;
    setEnviando(true);
    setMsg(null);
    setRechazado(null);
    ultima.current = "guardar";
    const it = intentoPara(intento.current, firmaEnvio(base, titulo, e.texto), () => crypto.randomUUID());
    intento.current = it;
    const r = await enviar(cuerpoEnvio(e, titulo, it.id));
    if (!conservarIntento(r === "sin-confirmar" ? r : (r as { resultado?: unknown }))) intento.current = null;
    const res = r === "sin-confirmar" ? null : r.resultado;
    // Un conflicto de versión con borrador: la recarga de abajo trae la
    // vigente y el aviso ofrece la decisión; el mensaje remite a él.
    setMsg(res === "conflicto" && (r as { motivo?: unknown }).motivo === "version" && hayBorrador(e)
      ? { tono: "rechazo", texto: MENSAJE_CONFLICTO_BORRADOR }
      : mensajeEscritura(r === "sin-confirmar" ? r : (r as { resultado?: unknown })));
    setEnviando(false);
    if (ofreceRevision(r)) setRechazado(normalizarTexto(e.texto));
    if (guardoVersion(res)) {
      setE((x) => trasGuardado(x, (r as { version_id?: unknown }).version_id, miaActual.current));
      recargar();
    }
    // Conflicto o reseña existente: traer la vigente para que el aviso ofrezca
    // la decisión. El borrador no se toca.
    if (res === "conflicto" || (res === "rechazo_cuenta" && (r as { motivo?: unknown }).motivo === "resena_existente")) recargar();
  }

  async function revisar(confirmado: boolean) {
    setConfirmar(null);
    if (enviando) return;
    if (base && !confirmado) { setConfirmar("revision"); return; }
    setEnviando(true);
    setMsg(null);
    ultima.current = "revision";
    const it = intentoPara(intentoRev.current, firmaRevision(base, titulo, e.texto), () => crypto.randomUUID());
    intentoRev.current = it;
    const r = await pedirRevision(cuerpoRevision(e, titulo, it.id, true));
    if (!conservarIntento(r === "sin-confirmar" ? r : (r as { resultado?: unknown }))) intentoRev.current = null;
    setMsg(mensajeEscritura(r === "sin-confirmar" ? r : (r as { resultado?: unknown })));
    setEnviando(false);
    const res = r === "sin-confirmar" ? null : r.resultado;
    if (guardoVersion(res)) {
      setRechazado(null);
      setE((x) => trasGuardado(x, (r as { version_id?: unknown }).version_id, miaActual.current));
      recargar();
    }
    if (res === "conflicto") recargar();
  }

  function pedirGuardar() {
    if (avisoReinicio(base, e.texto)) setConfirmar("reinicio");
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
    if (r !== "sin-confirmar" && r.resultado === "borrada") recargar();
  }

  const decidir = (s: EstadoEditor) => { setE(s); setMsg(null); };
  const remoto = e.remoto;

  return (
    <div className="cm-bloque">
      <h3 className="cm-h">{mia || base ? "Tu reseña" : "Escribí tu reseña"}</h3>
      {mia && !e.editando && (
        <>
          <p className="cm-estado">{etiquetaEstado(mia.estado)}</p>
          <p className="cm-texto">{mia.texto}</p>
          <div className="cm-acciones">
            <button className="btn ghost" onClick={() => decidir(empezarEdicion(mia))}>Editar</button>
            <button className="cfg-danger-btn" onClick={() => setConfirmar("borrar")} disabled={enviando}>Borrar</button>
          </div>
        </>
      )}
      {remoto && (
        <div className="cm-msg sin_confirmar" role="alert">
          <p>{remoto.tipo === "borrada" ? REMOTO_BORRADA : base ? REMOTO_MODIFICADA : REMOTO_PUBLICADA}</p>
          <div className="cm-acciones">
            {remoto.tipo === "borrada" ? (
              <>
                <button className="btn ghost" disabled={enviando} onClick={() => decidir(cargarRemota(miaActual.current))}>Descartar el borrador</button>
                <button className="btn" disabled={enviando} onClick={() => decidir(publicarComoNueva(e))}>Publicarla como nueva</button>
              </>
            ) : (
              <>
                <button className="btn ghost" disabled={enviando} onClick={() => decidir(cargarRemota(miaActual.current))}>
                  {base ? "Cargar la versión nueva" : "Ver la publicada"}
                </button>
                <button className="btn" disabled={enviando} onClick={() => decidir(mantenerBorrador(e))}>
                  {base ? "Usar mi borrador sobre la nueva" : "Reemplazarla con mi borrador"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {e.editando && (
        <>
          <label className="dlg-lbl" htmlFor={idTexto}>{base ? "Editá tu reseña" : "Qué te pareció"}</label>
          <textarea id={idTexto} className="cm-textarea" value={e.texto} rows={6} disabled={enviando}
            aria-describedby={idCont} onChange={(ev) => { const t = ev.target.value; setE((x) => ({ ...x, texto: t })); }} />
          <p id={idCont} className={`cm-contador ${c.estado}`} aria-live="polite">{c.texto}</p>
          {c.aviso && <p className="cm-msg rechazo" role="alert">{c.aviso}</p>}
          {base && avisoReinicio(base, e.texto) && <p className="cm-aviso">{AVISO_REINICIO}</p>}
          <div className="cm-acciones">
            {(base || mia) && <button className="btn ghost" disabled={enviando} onClick={() => decidir(cargarRemota(miaActual.current))}>Cancelar</button>}
            <button className="btn" disabled={!puedeEnviar(base, e.texto, enviando)} onClick={pedirGuardar}>
              {enviando ? "Guardando…" : base ? "Guardar cambios" : "Publicar"}
            </button>
          </div>
        </>
      )}
      {msg && (
        <p className={`cm-msg ${msg.tono}`} role={msg.tono === "exito" || msg.tono === "info" ? "status" : "alert"}>
          {msg.texto}
          {msg.tono === "sin_confirmar" && e.editando && <> <button className="cm-link" onClick={() => void (ultima.current === "revision" ? revisar(true) : guardar())}>Reintentar</button></>}
          {msg.tono === "rechazo" && /otro dispositivo/.test(msg.texto) && !remoto && <> <button className="cm-link" onClick={recargar}>Recargar</button></>}
        </p>
      )}

      {/* Después del motivo del rechazo: primero qué pasó, después la oferta. */}
      {e.editando && rechazado !== null && normalizarTexto(e.texto) === rechazado && (
        <div className="cm-aviso cm-revision">
          <p>{OFERTA_REVISION}</p>
          <button className="btn ghost" disabled={enviando} onClick={() => void revisar(false)}>Pedir revisión</button>
        </div>
      )}

      {confirmar && (
        <div className="dlg-backdrop" onClick={() => setConfirmar(null)} role="presentation">
          <div className="dlg" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cm-conf-t">
            <h2 id="cm-conf-t">{confirmar === "borrar" ? "Borrar tu reseña" : confirmar === "revision" ? "Pedir revisión" : "Guardar cambios"}</h2>
            <p className="dlg-sub">
              {confirmar === "borrar"
                ? "Tu reseña deja de verse al instante. No se puede deshacer."
                : confirmar === "revision"
                  ? (mia?.estado === "publicada" ? AVISO_REVISION_EDICION : "Esta edición reemplaza la versión actual y queda en revisión hasta que se resuelva.")
                  : `${AVISO_REINICIO} ¿Querés guardar igual?`}
            </p>
            <div className="dlg-acciones">
              <button className="btn ghost" autoFocus onClick={() => setConfirmar(null)}>Cancelar</button>
              {confirmar === "borrar"
                ? <button className="cfg-danger-btn" onClick={() => void borrarla()}>Borrar</button>
                : confirmar === "revision"
                  ? <button className="btn" onClick={() => void revisar(true)}>Pedir revisión</button>
                  : <button className="btn" onClick={() => void guardar()}>Guardar</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
