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
// RESPUESTAS FUERA DE ORDEN NO RETROCEDEN (hooks/sala-compuerta.ts): cada
// lectura sale con un ticket y sólo se aplica si es más nueva que la última
// aplicada y de la misma generación; cambiar de sala o de credencial abre una
// generación nueva, así que una respuesta de la sala anterior no escribe sobre
// la nueva. Vale para el éxito y para el error.
//
// TOKEN INVÁLIDO ≠ FALLO DE RED. `sala_token_invalido` (la base no reconoce la
// credencial en esa sala) se informa como `sinAcceso` para que la vista
// ofrezca entrar de nuevo; un fallo de red o de la RPC conserva el último
// estado y se reintenta. Sólo en un estado terminal (vencida / inexistente) se
// cierra el canal y se borra la credencial.
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase";
import { desfaseReloj, esTerminal, plazoVigente, type RespuestaEstado } from "@/lib/sala/estado";
import { borrarToken } from "@/lib/sala/token-store";
import { alReleer, alSenal, inicial, type EstadoRelectura } from "./sala-relectura-nucleo";
import { crearCompuerta } from "./sala-compuerta";

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

  const vivo = useRef(true);
  const relectura = useRef<EstadoRelectura>(inicial());
  const timerRelectura = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminal = useRef(false);
  const canalRef = useRef<RealtimeChannel | null>(null);
  const compuerta = useRef(crearCompuerta());

  const leer = useCallback(async () => {
    if (!token || terminal.current) return;
    const ticket = compuerta.current.emitir();
    try {
      const { data, error: e } = await supabaseBrowser().rpc("sala_estado", { p_room: roomId, p_token: token });
      if (!vivo.current) return;
      // Más vieja que la última aplicada, o de otra sala/credencial: se descarta entera.
      if (!compuerta.current.aplicar(ticket)) return;
      if (e) {
        if (/sala_token_invalido/.test(e.message)) {
          setSinAcceso(true);
          borrarToken(roomId);
          terminal.current = true;
          canalRef.current?.unsubscribe();
        } else {
          setError(e.message);
        }
        return;
      }
      const r = data as RespuestaEstado;
      setDesfase(desfaseReloj(r, Date.now()));
      setEstado(r);
      setError(null);
      if (esTerminal(r)) {
        terminal.current = true;
        canalRef.current?.unsubscribe();
        borrarToken(roomId);
      }
    } catch (err) {
      if (vivo.current && compuerta.current.aplicar(ticket)) setError(err instanceof Error ? err.message : "fallo");
    } finally {
      relectura.current = alReleer(relectura.current, Date.now());
      if (vivo.current) setCargando(false);
    }
  }, [roomId, token]);

  // Una señal del canal: relectura acotada (trailing, 1500 ms).
  const senal = useCallback(() => {
    const r = alSenal(relectura.current, Date.now());
    relectura.current = r.estado;
    if (r.programarEnMs === null) return;
    if (timerRelectura.current) clearTimeout(timerRelectura.current);
    timerRelectura.current = setTimeout(() => { timerRelectura.current = null; void leer(); }, r.programarEnMs);
  }, [leer]);

  // Montaje: primera lectura + canal + respaldos.
  useEffect(() => {
    vivo.current = true;
    terminal.current = false;
    relectura.current = inicial();
    compuerta.current.reiniciar();   // otra sala u otra credencial: lo que estaba en vuelo ya no cuenta
    setCargando(true); setSinAcceso(false); setError(null); setEstado(null);
    if (!token) { setCargando(false); return; }

    void leer();

    const sb = supabaseBrowser();
    const ch = sb.channel(`sala:${roomId}`, { config: { private: false } });
    canalRef.current = ch;
    let respaldo: ReturnType<typeof setInterval> | null = setInterval(() => { void leer(); }, RESPALDO_MS);
    ch.on("broadcast", { event: "cambio" }, () => senal())
      .subscribe((status) => {
        if (!vivo.current) return;
        if (status === "SUBSCRIBED") {
          setCanal("conectado");
          if (respaldo) { clearInterval(respaldo); respaldo = null; }
          // Lo que haya pasado entre la primera lectura y la suscripción.
          senal();
        } else {
          setCanal("desconectado");
          if (!respaldo && !terminal.current) respaldo = setInterval(() => { void leer(); }, RESPALDO_MS);
        }
      });

    const alVolver = () => { if (document.visibilityState === "visible") void leer(); };
    const alConectar = () => { void leer(); };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alConectar);

    return () => {
      vivo.current = false;
      if (respaldo) clearInterval(respaldo);
      if (timerRelectura.current) { clearTimeout(timerRelectura.current); timerRelectura.current = null; }
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alConectar);
      canalRef.current = null;
      void sb.removeChannel(ch);
    };
  }, [roomId, token, leer, senal]);

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
    const t = setTimeout(() => { void leer(); }, enMs);
    return () => clearTimeout(t);
  }, [estado, desfase, leer]);

  // Al terminar, el respaldo no tiene que seguir.
  useEffect(() => {
    if (estado && esTerminal(estado)) canalRef.current?.unsubscribe();
  }, [estado]);

  return { estado, cargando, error, sinAcceso, canal, desfase, releer: leer };
}
