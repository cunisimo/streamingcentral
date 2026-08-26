"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthContext";
import { ESTILO_YUMP, resolverAvatar } from "@/lib/avatares";
import AvatarGrid from "./AvatarGrid";

// El selector. Ya no genera nada: muestra los 31 avatares propios y guarda el id
// del elegido.
//
// Desapareció "Generar más", y con él la idea de tandas: antes las opciones eran
// semillas aleatorias de un generador infinito, así que había que poder pedir
// otras. Acá el catálogo es finito y está entero en pantalla.
export default function AvatarModal({ onClose }: { onClose: () => void }) {
  const { profile, updateAvatar } = useAuth();
  // Arranca con el avatar actual seleccionado, para que se vea cuál es el suyo.
  const [selected, setSelected] = useState<string | null>(() => resolverAvatar(profile).id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const caja = useRef<HTMLDivElement>(null);
  const previo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Devolver el foco al botón que abrió el modal cuando se cierra: sin esto,
    // al cerrar con Escape el foco se va al `<body>` y con teclado hay que
    // recorrer la página entera de nuevo.
    previo.current = document.activeElement as HTMLElement | null;
    caja.current?.focus();
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => {
      document.removeEventListener("keydown", h);
      previo.current?.focus?.();
    };
  }, [onClose]);

  async function guardar() {
    if (!selected) return;
    setBusy(true); setErr("");
    // `ESTILO_YUMP` es lo que distingue una elección explícita de una semilla
    // heredada: sin eso, el id elegido caería en el mapeo legado.
    const { error } = await updateAvatar(selected, ESTILO_YUMP);
    setBusy(false);
    if (error) { setErr(error); return; }
    onClose();
  }

  return (
    <div className="avmodal-backdrop" role="dialog" aria-modal="true" aria-label="Elegí tu avatar" onClick={onClose}>
      <div className="avmodal" ref={caja} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="avmodal-head">
          <h2>Elegí tu avatar</h2>
          <p>Son dibujos propios de Yump. Tocá el que más te guste.</p>
        </div>
        <div className="avgrid-wrap">
          <AvatarGrid selected={selected} onSelect={setSelected} />
        </div>
        {err && <p className="avmodal-err">{err}</p>}
        <div className="avmodal-foot">
          <div className="avmodal-foot-r">
            <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn" onClick={guardar} disabled={!selected || busy}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
