"use client";
import type React from "react";
import { useState } from "react";
import ConfigTanda from "./ConfigTanda";
import { supabaseBrowser } from "@/lib/supabase";
import { apiUrl } from "@/lib/api-base";
import { CONFIG_DEFAULT, type Duracion, type Size } from "@/lib/sala/tipos";
import { pedirTanda } from "@/lib/sala/acciones-host";

// La configuración de una tanda y el botón que la pide. Lo usan el lobby
// ("Empezar") y las pantallas de resultado ("Otra tanda"), que son la misma
// operación: `POST /api/sala/preparar` con el JWT del organizador (patrón de
// TeVaAGustar.tsx). SÓLO lo ve el organizador: quien lo monta lo decide con
// `estado.soy.es_host`, y la API lo vuelve a comprobar con el JWT.
//
// La lógica vive en lib/sala/acciones-host.ts (testeable): tras un 2xx se
// RELEE el estado en el acto con `releer` — el organizador no depende de
// recibir su propio aviso por el canal para ver "Armando la tanda…"—; los 409
// se muestran (`insuficientes` trae los tamaños alcanzables, destacados).
export default function PrepararTanda({ roomId, rotulo, releer, sizeInicial, duracionInicial, disabled, hint }: {
  roomId: string;
  rotulo: string;
  releer: () => Promise<void>;
  sizeInicial?: Size;
  duracionInicial?: Duracion;
  /** Si el botón no puede tocarse todavía (p. ej. faltan participantes). */
  disabled?: boolean;
  /** La línea de arriba del botón. Admite marcado: el lobby resalta ahí quién se sumó. */
  hint?: React.ReactNode;
}) {
  const [size, setSize] = useState<Size>(sizeInicial ?? CONFIG_DEFAULT.size);
  const [duracion, setDuracion] = useState<Duracion>(duracionInicial ?? CONFIG_DEFAULT.duracion);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [alcanzables, setAlcanzables] = useState<Size[] | null>(null);

  async function pedir() {
    setBusy(true); setErr(""); setAlcanzables(null);
    const r = await pedirTanda({
      jwt: async () => (await supabaseBrowser().auth.getSession()).data.session?.access_token ?? null,
      post: async (body, jwt) => {
        const res = await fetch(apiUrl("/api/sala/preparar"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
          body: JSON.stringify(body),
        });
        return { status: res.status, body: await res.json().catch(() => null) };
      },
      releer,
    }, roomId, size, duracion);
    setBusy(false);
    if (!r.ok) { setErr(r.texto); if (r.alcanzables) setAlcanzables(r.alcanzables); }
  }

  return (
    <div className="sala-preparar">
      <ConfigTanda size={size} duracion={duracion} onSize={setSize} onDuracion={setDuracion} disabled={busy} alcanzables={alcanzables} />
      {/* `role="status"` para que el lector de pantalla anuncie las llegadas
          sin robar el foco. En "Otra tanda" el texto es fijo, así que no
          produce anuncios de más. */}
      {hint && <p className="sala-hint" role="status">{hint}</p>}
      {err && <p className="sala-err" role="alert">{err}</p>}
      <div className="sala-acciones">
        <button type="button" className="btn" onClick={pedir} disabled={busy || disabled}>
          {busy ? "Un momento…" : rotulo}
        </button>
      </div>
    </div>
  );
}
