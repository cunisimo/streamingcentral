"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import CardSala from "./CardSala";
import BotonesVoto from "./BotonesVoto";
import ProgresoRonda from "./ProgresoRonda";
import { supabaseBrowser } from "@/lib/supabase";
import { useVenceEn } from "@/hooks/useVenceEn";
import { arrancar, cerrar, claveInicioCard, limpiarAnteriores, restante, vencio, type StoreTemporizador } from "@/hooks/temporizador-card";
import { sincronizarPos } from "@/lib/sala/votacion-nucleo";
import { crearControlVotacion, type ControlVotacion } from "@/lib/sala/votacion-control";
import type { EstadoSala, RondaSala } from "@/lib/sala/estado";

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
// EL BUCLE VIVE EN lib/sala/votacion-control.ts, con reloj y RPC inyectados:
// un solo voto en vuelo (botones con `disabled` real), reintento acotado tras
// un fallo, y la COMPUERTA que se cierra con `ronda_cerrada` / `inexistente`
// para que el intervalo no siga mandando `sala_votar` mientras la relectura
// del estado se reintenta. Este componente se remonta por ronda
// (`key={ronda.id}` en SalaView), así que cada ronda tiene su control.
const TICK_MS = 250;

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
  const [err, setErr] = useState("");
  // El comienzo va ATADO a su posición. Si fuera un número suelto, el efecto del
  // contador correría una vez con el comienzo de la card anterior —ya vencido
  // tras un pass automático— y mandaría el pass de la nueva en el acto (pasó:
  // cada vencimiento se llevaba también la card siguiente).
  const [arranque, setArranque] = useState<{ pos: number; arrancoEn: number } | null>(null);
  const [segCard, setSegCard] = useState<number | null>(null);
  const segRonda = useVenceEn(estado, desfase);

  // Un control por montaje (= por ronda). Lo que cambia por render (releer) se
  // lee a través de un ref para no recrear el control.
  const releerRef = useRef(releer); releerRef.current = releer;
  const control = useRef<ControlVotacion | null>(null);
  if (!control.current) {
    control.current = crearControlVotacion({
      size,
      ahora: () => Date.now(),
      enviar: async (p, v) => {
        const { data, error } = await supabaseBrowser().rpc("sala_votar", { p_room: roomId, p_token: token, p_round: ronda.id, p_pos: p, p_voto: v });
        return { data, error };
      },
      releer: () => releerRef.current(),
      alConfirmar: (p) => cerrar(store(), claveInicioCard(roomId, ronda.id, p)),
      alAvanzar: (sig) => setPos(sig === null ? size : sig),
      alError: setErr,
      alVuelo: setEnVuelo,
    });
  }
  const ctl = control.current;

  // El servidor más adelante que la vista (recarga, otra pestaña, respuesta
  // perdida): saltar ahí y dar por confirmadas las anteriores.
  useEffect(() => {
    const s = sincronizarPos(pos, ronda.mi_siguiente_pos, size);
    if (s.pos !== pos) {
      limpiarAnteriores(store(), roomId, ronda.id, s.confirmadasHasta, size);
      setPos(s.pos);
    }
  }, [ronda.mi_siguiente_pos, ronda.id, roomId, size, pos]);

  // Al entrar en una card: leer (o fijar) su comienzo y arrancar SU contador,
  // en el mismo efecto, con el comienzo en el cierre. Cada 250 ms; al vencer, el
  // control manda el `pass` (una vez, con reintento acotado si falló). Si al
  // montar ya venció, el primer tick lo manda sin mostrar la card.
  useEffect(() => {
    if (pos >= size) { setArranque(null); setSegCard(null); return; }
    const { arrancoEn } = arrancar(store(), claveInicioCard(roomId, ronda.id, pos), Date.now());
    setArranque({ pos, arrancoEn });
    setErr("");
    const tick = () => {
      const ahora = Date.now();
      setSegCard(restante(arrancoEn, ahora));
      ctl.tick(pos, vencio(arrancoEn, ahora));
    };
    tick();
    const t = setInterval(tick, TICK_MS);
    return () => clearInterval(t);
  }, [pos, size, roomId, ronda.id, ctl]);

  // Si vuelve la red con una card vencida y una solicitud fallida, no esperar al reintento.
  useEffect(() => {
    const al = () => ctl.permitirReintento();
    window.addEventListener("online", al);
    return () => window.removeEventListener("online", al);
  }, [ctl]);

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
          <BotonesVoto onVoto={(v) => void ctl.votar(v, pos)} disabled={enVuelo} />
        </>
      ) : (
        <p className="loading" role="status">{yaVencio ? "Pasando a la siguiente…" : "Cargando la película…"}</p>
      )}
      {err && <p className="sala-err" role="alert">{err}</p>}
    </div>
  );
}
