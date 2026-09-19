"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { usePlatforms } from "../PlatformsContext";
import SelectorPlataformasSala from "./SelectorPlataformasSala";
import { supabaseBrowser } from "@/lib/supabase";
import { credencialParaUnirse } from "@/lib/sala/token-store";
import { mensajeDeError } from "@/lib/sala/mensajes";
import type { PlatformCode } from "@/lib/types";

// Entrar a una sala ajena: nombre + plataformas. No hace falta cuenta.
//
// La credencial se persiste ANTES de llamar a `sala_unirse` y se manda siempre
// la misma (lib/sala/token-store.ts): un reintento tras una respuesta perdida
// devuelve `{repetido: true}` y la participación es la misma. `onEntro` recibe
// esa credencial: la vista la usa como token de `useSala`.
export default function UnirseForm({ roomId, onEntro }: { roomId: string; onEntro: (credencial: string) => void }) {
  const { profile, ready } = useAuth();
  const { platforms: mias, ready: platsListas } = usePlatforms();
  const [nombre, setNombre] = useState("");
  const [plats, setPlats] = useState<PlatformCode[]>([]);
  const [precargado, setPrecargado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Precarga UNA vez: nombre del perfil (si hay sesión) y "mis plataformas" en
  // estado local. Después el formulario es de la persona.
  useEffect(() => {
    if (precargado || !ready || !platsListas) return;
    setNombre((n) => n || (profile?.display_name ?? ""));
    setPlats((p) => (p.length ? p : mias));
    setPrecargado(true);
  }, [ready, platsListas, profile, mias, precargado]);

  async function entrar() {
    const n = nombre.trim();
    if (!n) { setErr("Poné tu nombre."); return; }
    if (!plats.length) { setErr("Elegí al menos una plataforma."); return; }
    setBusy(true); setErr("");
    const credencial = credencialParaUnirse(roomId);
    const { error } = await supabaseBrowser().rpc("sala_unirse", { p_room: roomId, p_nombre: n, p_platforms: plats, p_credencial: credencial });
    setBusy(false);
    if (error) { setErr(mensajeDeError(error.message)); return; }
    onEntro(credencial);
  }

  return (
    <div className="sala-form">
      <h1 className="sala-h1">Te invitaron a una sala</h1>
      <p className="section-sub">Van a votar las mismas películas y ver en qué coinciden. Decí cómo te llamás y qué plataformas tenés.</p>
      <div className="field">
        <label htmlFor="sala-nombre">Tu nombre</label>
        <input id="sala-nombre" value={nombre} maxLength={24} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void entrar()} />
      </div>
      <span className="chip-group-label">Tus plataformas</span>
      <SelectorPlataformasSala value={plats} onChange={setPlats} />
      {err && <p className="sala-err" role="alert">{err}</p>}
      <div className="sala-acciones">
        <button type="button" className="btn" onClick={entrar} disabled={busy}>{busy ? "Entrando…" : "Entrar a la sala"}</button>
      </div>
    </div>
  );
}
