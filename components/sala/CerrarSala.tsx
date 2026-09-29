"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { mensajeDeError } from "@/lib/sala/mensajes";

// "Cerrar sala" del organizador. Estaba dentro de `Lobby`; se extrajo porque la
// pantalla de resultado con ganadora también lo necesita (decisión del dueño,
// 23/09: con match la sala se termina, no se ofrece otra tanda).
//
// 🔴 POR QUÉ HACE FALTA AHÍ: un organizador no puede tener DOS salas activas
// (`sala_ya_tiene_activa`), y una sala en `resultado` sigue activa 5 minutos. Sin
// este botón, el que quisiera armar otra tendría que esperar a que venciera
// sola. `sala_cerrar` la deja `vencida` en el acto —conservando los 5 min para
// que los demás vean que se cerró—, y el conteo de "una sola sala activa"
// excluye justamente `vencida`.
// `bloqueado` / `onOcupado`: en "sin coincidencias" comparte pantalla con "Otra
// tanda" (28/09); mientras una de las dos está en curso, la otra no se toca.
export default function CerrarSala({ roomId, rotulo = "Cerrar sala", bloqueado, onOcupado }: {
  roomId: string; rotulo?: string; bloqueado?: boolean; onOcupado?: (ocupado: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function cerrar() {
    if (busy || bloqueado) return;
    if (!confirm("¿Cerrar la sala para todos?")) return;
    setBusy(true); onOcupado?.(true); setErr("");
    const { error } = await supabaseBrowser().rpc("sala_cerrar", { p_room: roomId });
    setBusy(false); onOcupado?.(false);
    if (error) { setErr(mensajeDeError(error.message)); return; }
    // El estado `vencida` llega por el canal; quien cerró vuelve al Home.
    router.replace("/");
  }

  return (
    <>
      <div className="sala-acciones">
        <button type="button" className="btn ghost" onClick={cerrar} disabled={busy || bloqueado}>{busy ? "Cerrando…" : rotulo}</button>
      </div>
      {err && <p className="sala-err" role="alert">{err}</p>}
    </>
  );
}
