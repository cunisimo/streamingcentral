"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CardSala from "./CardSala";
import BotonesVoto from "./BotonesVoto";
import ProgresoRonda from "./ProgresoRonda";
import { supabaseBrowser } from "@/lib/supabase";
import { useVenceEn } from "@/hooks/useVenceEn";
import { arrancar, cerrar, claveInicioCard, limpiarAnteriores, restante, vencio, type StoreTemporizador } from "@/hooks/temporizador-card";
import { decidirTrasVotar, sincronizarPos, VOTO_AL_VENCER, type RespuestaVotar } from "@/lib/sala/votacion-nucleo";
import { mensajeDeError, SIN_RED } from "@/lib/sala/mensajes";
import type { EstadoSala, RondaSala, Voto } from "@/lib/sala/estado";

// La votación (plan de salas, Tarea 3.4). Una card por vez, en el orden de la
// ronda, con 10 s locales por card y el plazo global del servidor arriba.
//
// EL COMIENZO DE CADA CARD PERSISTE (hooks/temporizador-card.ts): recargar a los
// 6 s deja 4 s, no vuelve a 10. `cerrar` se llama ÚNICAMENTE cuando el servidor
// confirmó el avance (lib/sala/votacion-nucleo.ts decide). Si la solicitud
// falla —red, 5xx— el comienzo se conserva, vencido o no: al volver, si venció,
// se reintenta el `pass` en cuanto se pueda. Si al montar ya venció, se manda
// `pass` sin mostrar la card.
//
// Mientras hay un `sala_votar` en vuelo los tres botones llevan `disabled`
// real: un segundo toque no dispara nada.
const TICK_MS = 250;
const REINTENTO_MS = 3000;

const memoria = new Map<string, string>();
const storeMemoria: StoreTemporizador = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => { memoria.set(k, v); }, removeItem: (k) => { memoria.delete(k); } };
function store(): StoreTemporizador {
  try { return typeof localStorage !== "undefined" ? localStorage : storeMemoria; } catch { return storeMemoria; }
}

export default function Votacion({ estado, ronda, roomId, token, desfase, releer }: {
  estado: EstadoSala; ronda: RondaSala; roomId: string; token: string; desfase: number; releer: () => Promise<void>;
}) {
  const size = ronda.size;
  const [pos, setPos] = useState<number>(() => Math.min(ronda.mi_siguiente_pos, size));
  const [enVuelo, setEnVuelo] = useState(false);
  const enVueloRef = useRef(false);
  const [err, setErr] = useState("");
  // El comienzo va ATADO a su posición. Si fuera un número suelto, el efecto del
  // contador correría una vez con el comienzo de la card anterior —ya vencido
  // tras un pass automático— y mandaría el pass de la nueva en el acto (pasó:
  // cada vencimiento se llevaba también la card siguiente).
  const [arranque, setArranque] = useState<{ pos: number; arrancoEn: number } | null>(null);
  const [segCard, setSegCard] = useState<number | null>(null);
  const reintentarEn = useRef(0);
  const segRonda = useVenceEn(estado, desfase);

  // El servidor más adelante que la vista (recarga, otra pestaña, respuesta
  // perdida): saltar ahí y dar por confirmadas las anteriores.
  useEffect(() => {
    const s = sincronizarPos(pos, ronda.mi_siguiente_pos, size);
    if (s.pos !== pos) {
      limpiarAnteriores(store(), roomId, ronda.id, s.confirmadasHasta, size);
      setPos(s.pos);
    }
  }, [ronda.mi_siguiente_pos, ronda.id, roomId, size, pos]);


  const votar = useCallback(async (v: Voto, p: number) => {
    if (enVueloRef.current) return;
    enVueloRef.current = true; setEnVuelo(true); setErr("");
    try {
      const { data, error } = await supabaseBrowser().rpc("sala_votar", { p_room: roomId, p_token: token, p_round: ronda.id, p_pos: p, p_voto: v });
      if (error) { setErr(mensajeDeError(error.message)); reintentarEn.current = Date.now() + REINTENTO_MS; return; }
      const d = decidirTrasVotar(data as RespuestaVotar, p, size);
      if (d.cerrar) cerrar(store(), claveInicioCard(roomId, ronda.id, p));
      if (d.rondaCerrada) { void releer(); return; }
      if (d.siguiente === null) { setPos(size); void releer(); } else setPos(d.siguiente);
    } catch {
      setErr(SIN_RED); reintentarEn.current = Date.now() + REINTENTO_MS;
    } finally {
      enVueloRef.current = false; setEnVuelo(false);
    }
  }, [roomId, token, ronda.id, size, releer]);

  // Al entrar en una card: leer (o fijar) su comienzo y arrancar SU contador,
  // en el mismo efecto, con el comienzo en el cierre. Cada 250 ms; al vencer,
  // `pass` automático (con reintento acotado si la solicitud anterior falló).
  // Si al montar ya venció, el primer tick manda el pass sin mostrar la card.
  useEffect(() => {
    if (pos >= size) { setArranque(null); setSegCard(null); return; }
    const { arrancoEn } = arrancar(store(), claveInicioCard(roomId, ronda.id, pos), Date.now());
    setArranque({ pos, arrancoEn });
    setErr("");
    const tick = () => {
      const ahora = Date.now();
      setSegCard(restante(arrancoEn, ahora));
      if (vencio(arrancoEn, ahora) && !enVueloRef.current && ahora >= reintentarEn.current) void votar(VOTO_AL_VENCER, pos);
    };
    tick();
    const t = setInterval(tick, TICK_MS);
    return () => clearInterval(t);
  }, [pos, size, roomId, ronda.id, votar]);

  // Si vuelve la red con una card vencida y una solicitud fallida, no esperar al reintento.
  useEffect(() => {
    const al = () => { reintentarEn.current = 0; };
    window.addEventListener("online", al);
    return () => window.removeEventListener("online", al);
  }, []);

  const card = useMemo(() => ronda.titulos.find((t) => t.pos === pos) ?? null, [ronda.titulos, pos]);

  if (pos >= size) {
    return (
      <div className="sala-espera-tanda" role="status" aria-live="polite">
        <p className="sala-h2">Listo, esperando a los demás</p>
        <p className="sala-hint">Terminaron {ronda.terminaron} de {estado.n}.{segRonda !== null && segRonda > 0 ? ` La ronda cierra en ${Math.floor(segRonda / 60)}:${String(segRonda % 60).padStart(2, "0")}.` : ""}</p>
      </div>
    );
  }

  // Ya venció al montar (recarga tardía): se manda `pass` sin mostrar la card.
  const yaVencio = arranque !== null && arranque.pos === pos && vencio(arranque.arrancoEn, Date.now());

  return (
    <div className="sala-votacion">
      <ProgresoRonda pos={pos} size={size} segRonda={segRonda} segCard={yaVencio ? null : segCard} />
      {card && !yaVencio ? (
        <>
          <CardSala card={card} union={estado.union} />
          <BotonesVoto onVoto={(v) => void votar(v, pos)} disabled={enVuelo} />
        </>
      ) : (
        <p className="loading" role="status">{yaVencio ? "Pasando a la siguiente…" : "Cargando la película…"}</p>
      )}
      {err && <p className="sala-err" role="alert">{err}</p>}
    </div>
  );
}
