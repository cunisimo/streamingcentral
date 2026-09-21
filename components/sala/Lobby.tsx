"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PlatformLogo from "../PlatformLogo";
import PrepararTanda from "./PrepararTanda";
import { supabaseBrowser } from "@/lib/supabase";
import { mensajeDeError } from "@/lib/sala/mensajes";
import { useVenceEn, formatoSeg } from "@/hooks/useVenceEn";
import type { EstadoSala } from "@/lib/sala/estado";

// El lobby: quiénes están, cuánto falta para que venza, y —sólo para quien
// creó la sala— la configuración de la tanda y el botón "Empezar"
// (`PrepararTanda`, compartido con "Otra tanda" de los resultados).
//
// El enlace para invitar se muestra acá como texto + "Copiar". El mensaje y la
// acción de compartir del sistema llegan en la Etapa 5.
export default function Lobby({ estado, desfase, roomId }: { estado: EstadoSala; desfase: number; roomId: string }) {
  const router = useRouter();
  const seg = useVenceEn(estado, desfase);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [enlace, setEnlace] = useState("");
  useEffect(() => { setEnlace(`${location.origin}/sala/${roomId}`); }, [roomId]);

  const soyHost = estado.soy.es_host;
  const organizador = estado.participantes.find((p) => p.es_host)?.nombre;

  async function cerrar() {
    if (!confirm("¿Cerrar la sala para todos?")) return;
    setBusy(true); setErr("");
    const { error } = await supabaseBrowser().rpc("sala_cerrar", { p_room: roomId });
    setBusy(false);
    if (error) { setErr(mensajeDeError(error.message)); return; }
    // El estado `vencida` llega por el canal; quien cerró vuelve al Home.
    router.replace("/");
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(enlace); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin clipboard */ }
  }

  return (
    <div className="sala-lobby">
      <div className="sala-head">
        <h1 className="sala-h1">Sala de {organizador ?? "…"}</h1>
        {seg !== null && (
          <p className="sala-vence" role="status">
            {seg > 0 ? <>La sala espera <strong>{formatoSeg(seg)}</strong> más.</> : "La sala está venciendo…"}
          </p>
        )}
      </div>

      <section className="sala-bloque">
        <span className="chip-group-label">Quiénes están ({estado.n} de 6)</span>
        <ul className="sala-gente">
          {estado.participantes.map((p, i) => (
            <li key={i} className={p.soy ? "soy" : ""}>
              <span className="sala-gente-nombre">{p.nombre}{p.soy ? " (vos)" : ""}</span>
              {p.es_host && <span className="sala-gente-tag">organiza</span>}
            </li>
          ))}
        </ul>
        {estado.n < 2 && <p className="sala-hint">Hacen falta al menos 2 personas para empezar.</p>}
      </section>

      <section className="sala-bloque">
        <span className="chip-group-label">Plataformas de la sala</span>
        <div className="sala-union">
          {estado.union.map((c) => <span key={c} className="rlt-tag"><PlatformLogo code={c} /></span>)}
        </div>
        <p className="sala-hint">Se eligen películas que estén en alguna de estas.</p>
      </section>

      <section className="sala-bloque">
        <span className="chip-group-label">Invitá a alguien</span>
        <div className="sala-enlace">
          <input readOnly value={enlace} aria-label="Enlace de la sala" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="rlt-btn" onClick={copiar}>{copiado ? "Copiado" : "Copiar"}</button>
        </div>
      </section>

      {soyHost ? (
        <section className="sala-bloque">
          <PrepararTanda roomId={roomId} rotulo="Empezar" disabled={estado.n < 2 || busy}
            sizeInicial={estado.config_default?.size} duracionInicial={estado.config_default?.duracion} />
          {err && <p className="sala-err" role="alert">{err}</p>}
          <div className="sala-acciones">
            <button type="button" className="btn ghost" onClick={cerrar} disabled={busy}>Cerrar sala</button>
          </div>
        </section>
      ) : (
        <section className="sala-bloque">
          <p className="sala-espera" role="status">Esperando a que {organizador ?? "quien organiza"} empiece…</p>
        </section>
      )}
    </div>
  );
}
