"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import { usePlatforms } from "../PlatformsContext";
import SelectorPlataformasSala from "./SelectorPlataformasSala";
import { hrefSala } from "@/lib/rutas";
import { supabaseBrowser } from "@/lib/supabase";
import { confirmarSala, credencialParaCrear } from "@/lib/sala/token-store";
import { mensajeDeError } from "@/lib/sala/mensajes";
import type { PlatformCode } from "@/lib/types";

// Crear una sala. Requiere sesión (el organizador se identifica por su JWT en
// `sala_crear` y en la preparación); sin sesión se manda a /cuenta.
//
// Las plataformas se precargan desde "mis plataformas" pero viven en estado
// LOCAL: elegir con qué entrar a la sala no toca el contexto ni localStorage.
//
// La credencial se persiste ANTES de llamar a `sala_crear` y, con la respuesta,
// `confirmarSala` la MUEVE a la clave de la sala. Un reintento manda la misma
// credencial y la base devuelve la misma sala (`repetido: true`).
export default function CrearSala() {
  const { user, profile, ready } = useAuth();
  const { platforms: mias, ready: platsListas } = usePlatforms();
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [plats, setPlats] = useState<PlatformCode[]>([]);
  const [precargado, setPrecargado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { if (ready && !user) router.replace("/cuenta"); }, [ready, user, router]);
  useEffect(() => {
    if (precargado || !ready || !platsListas) return;
    setNombre((n) => n || (profile?.display_name ?? ""));
    setPlats((p) => (p.length ? p : mias));
    setPrecargado(true);
  }, [ready, platsListas, profile, mias, precargado]);

  if (!ready || !user) return <p className="loading">Cargando…</p>;

  async function crear() {
    const n = nombre.trim();
    if (!n) { setErr("Poné tu nombre."); return; }
    if (!plats.length) { setErr("Elegí al menos una plataforma."); return; }
    setBusy(true); setErr("");
    const credencial = credencialParaCrear();
    const { data, error } = await supabaseBrowser().rpc("sala_crear", { p_nombre: n, p_platforms: plats, p_credencial: credencial });
    if (error) { setBusy(false); setErr(mensajeDeError(error.message)); return; }
    const roomId = (data as { room_id: string }).room_id;
    confirmarSala(roomId);
    // `hrefSala`, no la ruta a mano: en el contenedor la sala se muestra en
    // `/s/?id=<uuid>` porque el segmento dinámico no existe en el artefacto.
    router.replace(hrefSala(roomId));
  }

  return (
    <div className="sala-form">
      <Link href="/" className="back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Volver</Link>
      <h1 className="sala-h1">Crear una sala</h1>
      <p className="section-sub">Invitás a hasta 5 personas, todos votan las mismas películas y ven en cuál coinciden.</p>
      <div className="field">
        <label htmlFor="sala-nombre">Tu nombre en la sala</label>
        <input id="sala-nombre" value={nombre} maxLength={24} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <span className="chip-group-label">Tus plataformas</span>
      <SelectorPlataformasSala value={plats} onChange={setPlats} />
      <p className="sala-hint">Las películas de la sala salen de las plataformas de todos los que entren.</p>
      {err && <p className="sala-err" role="alert">{err}</p>}
      <div className="sala-acciones">
        <button type="button" className="btn" onClick={crear} disabled={busy}>{busy ? "Creando…" : "Crear sala"}</button>
      </div>
    </div>
  );
}
