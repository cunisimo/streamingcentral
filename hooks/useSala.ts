"use client";
// El estado de una sala en el cliente (plan de salas, Tarea 3.2).
//
// LA VERDAD ES `sala_estado`; el canal sólo AVISA. La base publica por
// Broadcast público `{v: version}` en `sala:<id>` (trigger rooms_publicar_cambio)
// y nada más: sin nombres, votos ni resultado. Cada señal pide releer, acotado a
// una relectura por 1500 ms (hooks/sala-relectura-nucleo.ts). Este hook NUNCA
// publica en el canal.
//
// RESPALDOS, porque Realtime puede no llegar (proxy, red móvil, pestaña
// dormida): mientras el canal no está SUBSCRIBED se relee cada 5 s; al volver
// a la pestaña (`visibilitychange`) y al recuperar la red (`online`) se relee;
// y se relee 1 s después de cada plazo del servidor (deadline de la ronda,
// vencimiento del lobby, ventana de resultado), corregido por el desfase del
// reloj, porque los vencimientos los aplica la base al leer y no hay señal
// hasta que alguien lee.
//
// LA LECTURA VIVE EN hooks/sala-lector.ts (compuerta monotónica + relectura
// acotada, sin React): una respuesta más vieja que la última aplicada, o de otra
// sala/credencial, no toca NADA — ni estado, ni error, ni `cargando`, ni la
// coordinación de relecturas. Un lector por montaje; cambiar de sala o de
// credencial monta otro.
//
// TOKEN INVÁLIDO ≠ FALLO DE RED. `sala_token_invalido` (la base no reconoce la
// credencial en esa sala) se informa como `sinAcceso` para que la vista
// ofrezca entrar de nuevo; un fallo de red o de la RPC conserva el último
// estado y se reintenta. Sólo en un estado terminal (vencida / inexistente) se
// cierra el canal y se borra la credencial.
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase";
import { desfaseReloj, plazoVigente, type RespuestaEstado } from "@/lib/sala/estado";
import { borrarToken } from "@/lib/sala/token-store";
import { crearLector, type Lector } from "./sala-lector";

export type EstadoCanal = "conectado" | "desconectado";

export interface UsoSala {
  estado: RespuestaEstado | null;
  /** Primera lectura en curso (no hay nada que mostrar todavía). */
  cargando: boolean;
  /** Último fallo de lectura (red / RPC), o null. El estado anterior se conserva. */
  error: string | null;
  /** La credencial no sirve en esta sala: hay que entrar de nuevo. */
  sinAcceso: boolean;
  canal: EstadoCanal;
  /** `ahora` del servidor − reloj local, en ms. Se suma a `Date.now()` para comparar con plazos del servidor. */
  desfase: number;
  releer: () => Promise<void>;
}

const RESPALDO_MS = 5000;
const TRAS_PLAZO_MS = 1000;

export function useSala(roomId: string, token: string | null): UsoSala {
  const [estado, setEstado] = useState<RespuestaEstado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sinAcceso, setSinAcceso] = useState(false);
  const [canal, setCanal] = useState<EstadoCanal>("desconectado");
  const [desfase, setDesfase] = useState(0);

  const lectorRef = useRef<Lector | null>(null);
  const canalRef = useRef<RealtimeChannel | null>(null);
  const timerRelectura = useRef<ReturnType<typeof setTimeout> | null>(null);

  const releer = useCallback(async () => { await lectorRef.current?.leer(); }, []);

  // Montaje (y cada cambio de sala o credencial): lector nuevo, primera
  // lectura, canal y respaldos. El cleanup deja al lector anterior sin
  // efectos: se descuelga del ref y su generación se cierra.
  useEffect(() => {
    setCargando(true); setSinAcceso(false); setError(null); setEstado(null);
    if (!token) { setCargando(false); return; }

    let vivo = true;
    const sb = supabaseBrowser();
    const ch = sb.channel(`sala:${roomId}`, { config: { private: false } });
    canalRef.current = ch;

    const lector = crearLector({
      pedir: async () => {
        const { data, error: e } = await sb.rpc("sala_estado", { p_room: roomId, p_token: token });
        return { data, error: e };
      },
      ahora: () => Date.now(),
      alEstado: (r, recibidoMs) => { if (!vivo) return; setDesfase(desfaseReloj(r, recibidoMs)); setEstado(r); setError(null); },
      alError: (m) => { if (vivo) setError(m); },
      alTokenInvalido: () => { if (!vivo) return; setSinAcceso(true); borrarToken(roomId); ch.unsubscribe(); },
      alTerminarLectura: () => { if (vivo) setCargando(false); },
      alTerminal: () => { if (!vivo) return; ch.unsubscribe(); borrarToken(roomId); },
    });
    lectorRef.current = lector;

    void lector.leer();

    // Señal del canal → relectura acotada (trailing, 1500 ms).
    const senal = () => {
      const enMs = lector.senal();
      if (enMs === null) return;
      if (timerRelectura.current) clearTimeout(timerRelectura.current);
      timerRelectura.current = setTimeout(() => { timerRelectura.current = null; void lector.leer(); }, enMs);
    };

    let respaldo: ReturnType<typeof setInterval> | null = setInterval(() => { void lector.leer(); }, RESPALDO_MS);
    ch.on("broadcast", { event: "cambio" }, () => senal())
      .subscribe((status) => {
        if (!vivo) return;
        if (status === "SUBSCRIBED") {
          setCanal("conectado");
          if (respaldo) { clearInterval(respaldo); respaldo = null; }
          // Lo que haya pasado entre la primera lectura y la suscripción.
          senal();
        } else {
          setCanal("desconectado");
          if (!respaldo && !lector.terminal()) respaldo = setInterval(() => { void lector.leer(); }, RESPALDO_MS);
        }
      });

    const alVolver = () => { if (document.visibilityState === "visible") void lector.leer(); };
    const alConectar = () => { void lector.leer(); };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alConectar);

    return () => {
      vivo = false;
      lector.reiniciar();   // lo que quede en vuelo de esta generación no se aplica
      if (lectorRef.current === lector) lectorRef.current = null;
      if (respaldo) clearInterval(respaldo);
      if (timerRelectura.current) { clearTimeout(timerRelectura.current); timerRelectura.current = null; }
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alConectar);
      if (canalRef.current === ch) canalRef.current = null;
      void sb.removeChannel(ch);
    };
  }, [roomId, token]);

  // Releer 1 s después del plazo vigente: los vencimientos los aplica la base
  // al leer, así que sin esto una sala cuyo lobby venció seguiría mostrando el
  // lobby hasta que alguien tocara algo.
  useEffect(() => {
    if (!estado) return;
    const plazo = plazoVigente(estado);
    if (!plazo) return;
    const fin = Date.parse(plazo);
    if (!Number.isFinite(fin)) return;
    const enMs = Math.max(0, fin - (Date.now() + desfase)) + TRAS_PLAZO_MS;
    const t = setTimeout(() => { void lectorRef.current?.leer(); }, enMs);
    return () => clearTimeout(t);
  }, [estado, desfase]);

  return { estado, cargando, error, sinAcceso, canal, desfase, releer };
}
