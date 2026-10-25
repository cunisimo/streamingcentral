"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CATEGORIAS, COMENTARIO_MAX, comentarioDenuncia, mensajeBloqueo, mensajeDenuncia, ofreceReintento, type Categoria, type Tono,
} from "@/lib/comunidad/menu-nucleo";
import type { RespuestaEditor } from "./EditorResena";

// Menú de una reseña AJENA (E3b): denunciar y bloquear al autor. Lo que
// decide (categorías, comentario, textos) vive en lib/comunidad/menu-nucleo.ts
// (puro, con tests).
//   - Denunciar pide motivo y confirmación, y ofrece bloquear en el mismo
//     paso. Nunca dice que la denuncia fue atendida ni oculta la reseña: la
//     revisa una persona. Si no se puede recibir, lo dice y ofrece bloquear.
//   - Bloquear pide confirmación; la reseña desaparece al recargar (la
//     lectura ya no la trae) y se gestiona desde la cuenta.
//   - Un envío cuya respuesta se perdió ofrece "Reintentar" con el mismo
//     pedido: denunciar y bloquear son idempotentes, no se duplican.
// Los diálogos van en un portal a <body>: dentro de `.review` heredarían la
// tipografía del texto de la reseña.
export type Enviar = (ruta: string, cuerpo: Record<string, unknown>) => Promise<RespuestaEditor>;

function Dialogo({ titulo, cerrar, children }: { titulo: string; cerrar: () => void; children: ReactNode }) {
  const id = useId();
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [cerrar]);
  return createPortal(
    <div className="dlg-backdrop" onClick={cerrar} role="presentation">
      <div className="dlg cm-dlg" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby={id}>
        <h2 id={id}>{titulo}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

type Msg = { tono: Tono; texto: string } | null;

/** El diálogo de denuncia. `ofrecerBloqueo`: falso cuando ya se bloqueó. */
export function DialogoDenuncia({ versionId, enviar, cerrar, alTerminar, ofrecerBloqueo = true }: {
  versionId: number;
  enviar: Enviar;
  cerrar: () => void;
  alTerminar: (r: { denunciada: boolean; bloqueado: boolean }) => void;
  ofrecerBloqueo?: boolean;
}) {
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [comentario, setComentario] = useState("");
  const [bloquear, setBloquear] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [msgBloqueo, setMsgBloqueo] = useState<Msg>(null);
  const [hecho, setHecho] = useState(false);
  const idCom = useId();
  const c = comentarioDenuncia(comentario);

  async function mandar() {
    if (!categoria || !c.ok || enviando) return;
    setEnviando(true);
    setMsg(null);
    setMsgBloqueo(null);
    const r = await enviar("/api/comunidad/denuncias", {
      version_id: versionId, categoria, ...(c.valor ? { comentario: c.valor } : {}), ...(bloquear ? { bloquear: true } : {}),
    });
    setEnviando(false);
    const m = mensajeDenuncia(r === "sin-confirmar" ? r : (r as { resultado?: unknown }));
    setMsg(m);
    const b = r !== "sin-confirmar" ? (r as { bloqueo?: { resultado?: unknown } }).bloqueo : undefined;
    if (b) setMsgBloqueo(mensajeBloqueo(b));
    const denunciada = r !== "sin-confirmar" && r.resultado === "denuncia_registrada";
    const bloqueado = b?.resultado === "bloqueado";
    if (denunciada || bloqueado) { setHecho(!ofreceReintento(m.tono)); alTerminar({ denunciada, bloqueado }); }
  }

  return (
    <Dialogo titulo="Denunciar esta reseña" cerrar={cerrar}>
      {!hecho && (
        <>
          <p className="dlg-sub">Una persona la va a revisar. Denunciar no la oculta para los demás.</p>
          <fieldset className="cm-cats" disabled={enviando}>
            <legend className="dlg-lbl">Motivo</legend>
            {CATEGORIAS.map((x) => (
              <label key={x.id} className="cm-cat">
                <input type="radio" name={`cm-cat-${versionId}`} value={x.id} checked={categoria === x.id} onChange={() => setCategoria(x.id)} />
                <span>{x.etiqueta}</span>
              </label>
            ))}
          </fieldset>
          <label className="dlg-lbl" htmlFor={idCom}>Comentario (opcional, sólo lo ve quien revisa)</label>
          <textarea id={idCom} className="cm-textarea cm-com" rows={3} value={comentario} disabled={enviando}
            maxLength={COMENTARIO_MAX * 2} onChange={(e) => setComentario(e.target.value)} />
          {!c.ok && <p className="cm-msg rechazo" role="alert">{c.aviso}</p>}
          {ofrecerBloqueo && (
            <label className="cm-cat cm-bloq">
              <input type="checkbox" checked={bloquear} disabled={enviando} onChange={(e) => setBloquear(e.target.checked)} />
              <span>Bloquear también al autor: dejás de ver sus reseñas (no se le avisa).</span>
            </label>
          )}
        </>
      )}
      {msg && <p className={`cm-msg ${msg.tono}`} role={msg.tono === "exito" ? "status" : "alert"}>{msg.texto}</p>}
      {msgBloqueo && <p className={`cm-msg ${msgBloqueo.tono}`} role="status">{msgBloqueo.texto}</p>}
      <div className="dlg-acciones">
        <button className="btn ghost" autoFocus onClick={cerrar}>{hecho ? "Cerrar" : "Cancelar"}</button>
        {!hecho && (
          <button className="btn" disabled={!categoria || !c.ok || enviando} onClick={() => void mandar()}>
            {enviando ? "Enviando…" : msg && ofreceReintento(msg.tono) ? "Reintentar" : "Enviar denuncia"}
          </button>
        )}
      </div>
    </Dialogo>
  );
}

function DialogoBloqueo({ versionId, enviar, cerrar, alBloquear }: {
  versionId: number; enviar: Enviar; cerrar: () => void; alBloquear: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function confirmar() {
    if (enviando) return;
    setEnviando(true);
    setMsg(null);
    const r = await enviar("/api/comunidad/bloqueos", { accion: "bloquear", version_id: versionId });
    setEnviando(false);
    if (r !== "sin-confirmar" && r.resultado === "bloqueado") { alBloquear(); return; }
    setMsg(mensajeBloqueo(r === "sin-confirmar" ? r : (r as { resultado?: unknown })));
  }
  return (
    <Dialogo titulo="Bloquear al autor" cerrar={cerrar}>
      <p className="dlg-sub">Dejás de ver sus reseñas. No se le avisa y podés desbloquearlo desde tu cuenta.</p>
      {msg && <p className={`cm-msg ${msg.tono}`} role="alert">{msg.texto}</p>}
      <div className="dlg-acciones">
        <button className="btn ghost" autoFocus onClick={cerrar}>Cancelar</button>
        <button className="cfg-danger-btn" disabled={enviando} onClick={() => void confirmar()}>
          {enviando ? "Bloqueando…" : msg && ofreceReintento(msg.tono) ? "Reintentar" : "Bloquear"}
        </button>
      </div>
    </Dialogo>
  );
}

export default function MenuResena({ versionId, denunciada, enviar, alDenunciar, alBloquear }: {
  versionId: number;
  denunciada: boolean;
  enviar: Enviar;
  alDenunciar: () => void;
  alBloquear: (r: { denunciada: boolean }) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [dialogo, setDialogo] = useState<"denunciar" | "bloquear" | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const idMenu = useId();

  useEffect(() => {
    if (!abierto) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const fuera = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  function teclaMenu(e: React.KeyboardEvent) {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") { setAbierto(false); boton.current?.focus(); }
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  }
  const elegir = (d: "denunciar" | "bloquear") => { setAbierto(false); setDialogo(d); };
  const cerrarDialogo = () => { setDialogo(null); boton.current?.focus(); };

  return (
    <div className="cm-menu">
      <button ref={boton} type="button" className="cm-menu-btn" aria-label="Opciones de la reseña" title="Opciones de la reseña"
        aria-haspopup="menu" aria-expanded={abierto} aria-controls={abierto ? idMenu : undefined} onClick={() => setAbierto((a) => !a)}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
          <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {abierto && (
        <div ref={menu} id={idMenu} className="cm-menu-lista" role="menu" aria-label="Opciones de la reseña" onKeyDown={teclaMenu}>
          <button type="button" role="menuitem" className="cm-menu-item" onClick={() => elegir("denunciar")}>
            {denunciada ? "Ya la denunciaste" : "Denunciar"}
          </button>
          <button type="button" role="menuitem" className="cm-menu-item" onClick={() => elegir("bloquear")}>Bloquear al autor</button>
        </div>
      )}
      {dialogo === "denunciar" && (
        <DialogoDenuncia versionId={versionId} enviar={enviar} cerrar={cerrarDialogo}
          alTerminar={({ denunciada: d, bloqueado }) => { if (bloqueado) { setDialogo(null); alBloquear({ denunciada: d }); } else if (d) alDenunciar(); }} />
      )}
      {dialogo === "bloquear" && (
        <DialogoBloqueo versionId={versionId} enviar={enviar} cerrar={cerrarDialogo}
          alBloquear={() => { setDialogo(null); alBloquear({ denunciada }); }} />
      )}
    </div>
  );
}
