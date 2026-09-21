"use client";
import { useState } from "react";
import ConfigTanda from "./ConfigTanda";
import { supabaseBrowser } from "@/lib/supabase";
import { apiUrl } from "@/lib/api-base";
import { CONFIG_DEFAULT, SIZES, type Duracion, type Size } from "@/lib/sala/tipos";
import { mensajeDeError, mensajeDePreparar } from "@/lib/sala/mensajes";

// La configuración de una tanda y el botón que la pide. Lo usan el lobby
// ("Empezar") y las pantallas de resultado ("Otra tanda"), que son la misma
// operación: `POST /api/sala/preparar` con el JWT del organizador (patrón de
// TeVaAGustar.tsx). SÓLO lo ve el organizador: quien lo monta lo decide con
// `estado.soy.es_host`, y la API lo vuelve a comprobar con el JWT.
//
// La respuesta no dibuja nada: el estado pasa a `preparando` en la base y llega
// por el canal a TODOS, incluido quien tocó. Los 409 sí se muestran:
// `insuficientes` trae los tamaños alcanzables y se destacan en el selector.
export default function PrepararTanda({ roomId, rotulo, sizeInicial, duracionInicial, disabled, hint }: {
  roomId: string;
  rotulo: string;
  sizeInicial?: Size;
  duracionInicial?: Duracion;
  /** Si el botón no puede tocarse todavía (p. ej. faltan participantes). */
  disabled?: boolean;
  hint?: string;
}) {
  const [size, setSize] = useState<Size>(sizeInicial ?? CONFIG_DEFAULT.size);
  const [duracion, setDuracion] = useState<Duracion>(duracionInicial ?? CONFIG_DEFAULT.duracion);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [alcanzables, setAlcanzables] = useState<Size[] | null>(null);

  async function pedir() {
    setBusy(true); setErr(""); setAlcanzables(null);
    try {
      const { data } = await supabaseBrowser().auth.getSession();
      const jwt = data.session?.access_token;
      if (!jwt) { setErr(mensajeDePreparar(401, { motivo: "sin_sesion" })); return; }
      const r = await fetch(apiUrl("/api/sala/preparar"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ room_id: roomId, size, duracion }),
      });
      if (r.ok) return; // el cambio de estado llega por el canal
      const body = await r.json().catch(() => null) as { motivo?: string; alcanzables?: number[] } | null;
      setErr(mensajeDePreparar(r.status, body));
      if (body?.motivo === "insuficientes") setAlcanzables((body.alcanzables ?? []).filter((s): s is Size => SIZES.includes(s as Size)));
    } catch (e) {
      setErr(mensajeDeError(e instanceof Error ? e.message : null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sala-preparar">
      <ConfigTanda size={size} duracion={duracion} onSize={setSize} onDuracion={setDuracion} disabled={busy} alcanzables={alcanzables} />
      {hint && <p className="sala-hint">{hint}</p>}
      {err && <p className="sala-err" role="alert">{err}</p>}
      <div className="sala-acciones">
        <button type="button" className="btn" onClick={pedir} disabled={busy || disabled}>
          {busy ? "Un momento…" : rotulo}
        </button>
      </div>
    </div>
  );
}
