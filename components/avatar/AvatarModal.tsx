"use client";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/AuthContext";
import { DEFAULT_AVATAR_STYLE } from "@/lib/avatar";
import AvatarGrid from "./AvatarGrid";

const COUNT = 24;

// Semillas aleatorias con crypto.randomUUID(): únicas dentro de la tanda y
// entre tandas, sin números consecutivos.
function makeSeeds(n = COUNT): string[] {
  return Array.from({ length: n }, () => crypto.randomUUID());
}

export default function AvatarModal({ onClose }: { onClose: () => void }) {
  const { updateAvatar } = useAuth();
  const [batch, setBatch] = useState(0);
  const [seeds, setSeeds] = useState<string[]>(() => makeSeeds());
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // "Generar más": reemplaza las 24 opciones y anima la nueva tanda (el key
  // remonta el contenedor y dispara la transición CSS).
  const regen = useCallback(() => {
    setSeeds(makeSeeds());
    setSelected(null);
    setBatch((b) => b + 1);
  }, []);

  async function guardar() {
    if (!selected) return;
    setBusy(true); setErr("");
    const { error } = await updateAvatar(selected, DEFAULT_AVATAR_STYLE);
    setBusy(false);
    if (error) { setErr(error); return; }
    onClose();
  }

  return (
    <div className="avmodal-backdrop" role="dialog" aria-modal="true" aria-label="Elegí tu avatar" onClick={onClose}>
      <div className="avmodal" onClick={(e) => e.stopPropagation()}>
        <div className="avmodal-head">
          <h2>Elegí tu avatar</h2>
          <p>Tocá el que más te guste. Si ninguno te convence, generá otros 24.</p>
        </div>
        <div key={batch} className="avgrid-wrap">
          <AvatarGrid seeds={seeds} selected={selected} onSelect={setSelected} />
        </div>
        {err && <p className="avmodal-err">{err}</p>}
        <div className="avmodal-foot">
          <button type="button" className="btn ghost" onClick={regen}>Generar más</button>
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
