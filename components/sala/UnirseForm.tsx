"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { supabaseBrowser } from "@/lib/supabase";
import { credencialParaUnirse } from "@/lib/sala/token-store";
import { mensajeDeError } from "@/lib/sala/mensajes";

// Entrar a una sala ajena: SÓLO el nombre. No hace falta cuenta.
//
// 🔴 EL INVITADO NO ELIGE PLATAFORMAS (decisión del dueño, 23/09). Las de la
// sala las pone quien la crea y el invitado hereda esas; `sala_unirse` ya ni
// siquiera recibe el parámetro, así que esto no es sólo un selector escondido.
// Sus "mis plataformas" del Home no se tocan: son suyas y siguen igual.
//
// La credencial se persiste ANTES de llamar a `sala_unirse` y se manda siempre
// la misma (lib/sala/token-store.ts): un reintento tras una respuesta perdida
// devuelve `{repetido: true}` y la participación es la misma. `onEntro` recibe
// esa credencial: la vista la usa como token de `useSala`.
export default function UnirseForm({ roomId, onEntro }: { roomId: string; onEntro: (credencial: string) => void }) {
  const { profile, ready } = useAuth();
  const [nombre, setNombre] = useState("");
  const [precargado, setPrecargado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Precarga UNA vez el nombre del perfil, si hay sesión. Después es de la persona.
  useEffect(() => {
    if (precargado || !ready) return;
    setNombre((n) => n || (profile?.display_name ?? ""));
    setPrecargado(true);
  }, [ready, profile, precargado]);

  async function entrar() {
    const n = nombre.trim();
    if (!n) { setErr("Poné tu nombre."); return; }
    setBusy(true); setErr("");
    const credencial = credencialParaUnirse(roomId);
    const { error } = await supabaseBrowser().rpc("sala_unirse", { p_room: roomId, p_nombre: n, p_credencial: credencial });
    setBusy(false);
    if (error) { setErr(mensajeDeError(error.message)); return; }
    onEntro(credencial);
  }

  return (
    <div className="sala-form">
      <h1 className="sala-h1">Te invitaron a una sala</h1>
      <p className="section-sub">Van a votar las mismas películas y ver en qué coinciden. Decí cómo te llamás; las plataformas las eligió quien armó la sala.</p>
      <div className="field">
        <label htmlFor="sala-nombre">Tu nombre</label>
        <input id="sala-nombre" value={nombre} maxLength={24} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void entrar()} />
      </div>
      {err && <p className="sala-err" role="alert">{err}</p>}
      <div className="sala-acciones">
        <button type="button" className="btn" onClick={entrar} disabled={busy}>{busy ? "Entrando…" : "Entrar a la sala"}</button>
      </div>
    </div>
  );
}
