"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import UnirseForm from "./UnirseForm";
import Lobby from "./Lobby";
import Votacion from "./Votacion";
import ResultadoMatch from "./ResultadoMatch";
import ResultadoEmpate from "./ResultadoEmpate";
import ResultadoSinCoincidencias from "./ResultadoSinCoincidencias";
import { useSala } from "@/hooks/useSala";
import { supabaseBrowser } from "@/lib/supabase";
import { credencialParaUnirse, leerToken } from "@/lib/sala/token-store";
import { codigoDe, mensajeDeError } from "@/lib/sala/mensajes";
import { esInexistente, esTerminal, type EstadoSala } from "@/lib/sala/estado";

// La página de una sala. Decide con qué credencial se mira:
//   1. la guardada para esta sala (`yump:sala:<id>`), si hay;
//   2. si no hay y hay sesión, `sala_reclamar` con una credencial nueva de este
//      navegador (organizador o invitado con cuenta que cambió de dispositivo);
//   3. si no, el formulario para entrar.
// Con credencial, `useSala` lee y escucha. `sinAcceso` (la base no la reconoce)
// vuelve al formulario. El estado decide qué se ve; el cliente no computa nada.
type Acceso = { fase: "leyendo" } | { fase: "reclamando" } | { fase: "sin-token" } | { fase: "con-token"; token: string } | { fase: "error"; texto: string };

export default function SalaView({ roomId }: { roomId: string }) {
  const { user, ready } = useAuth();
  const [acceso, setAcceso] = useState<Acceso>({ fase: "leyendo" });

  useEffect(() => {
    const t = leerToken(roomId);
    if (t) { setAcceso({ fase: "con-token", token: t }); return; }
    if (!ready) return;
    if (!user) { setAcceso({ fase: "sin-token" }); return; }
    let vivo = true;
    setAcceso({ fase: "reclamando" });
    const credencial = credencialParaUnirse(roomId);
    supabaseBrowser().rpc("sala_reclamar", { p_room: roomId, p_credencial: credencial }).then(({ error }) => {
      if (!vivo) return;
      if (!error) { setAcceso({ fase: "con-token", token: credencial }); return; }
      const c = codigoDe(error.message);
      if (c === "sala_no_participa") { setAcceso({ fase: "sin-token" }); return; }
      setAcceso({ fase: "error", texto: mensajeDeError(error.message) });
    });
    return () => { vivo = false; };
  }, [roomId, ready, user]);

  const token = acceso.fase === "con-token" ? acceso.token : null;
  const sala = useSala(roomId, token);

  useEffect(() => {
    if (sala.sinAcceso) setAcceso({ fase: "sin-token" });
  }, [sala.sinAcceso]);

  if (acceso.fase === "leyendo" || acceso.fase === "reclamando") return <div className="wrap"><p className="loading">Cargando…</p></div>;
  if (acceso.fase === "error") return <div className="wrap sala-wrap"><p className="sala-err" role="alert">{acceso.texto}</p><Link href="/" className="back">Volver al inicio</Link></div>;
  if (acceso.fase === "sin-token") {
    return (
      <div className="wrap sala-wrap">
        <UnirseForm roomId={roomId} onEntro={(c) => setAcceso({ fase: "con-token", token: c })} />
      </div>
    );
  }

  const e = sala.estado;
  return (
    <div className="wrap sala-wrap">
      {sala.canal === "desconectado" && e && !esTerminal(e) && !sala.cargando && (
        <p className="sala-canal" role="status">Sin conexión en vivo: actualizando cada 5 segundos.</p>
      )}
      {sala.error && e && <p className="sala-err" role="alert">{mensajeDeError(sala.error)} <button type="button" className="up-retry" onClick={() => void sala.releer()}>Reintentar</button></p>}
      {!e && sala.cargando && <p className="loading">Cargando la sala…</p>}
      {!e && !sala.cargando && sala.error && (
        <p className="sala-err" role="alert">{mensajeDeError(sala.error)} <button type="button" className="up-retry" onClick={() => void sala.releer()}>Reintentar</button></p>
      )}
      {e && esInexistente(e) && <Terminal titulo="Esta sala no existe" sub="Puede que se haya borrado. Las salas duran hasta 5 minutos después de terminar." />}
      {e && !esInexistente(e) && e.estado === "vencida" && <Terminal titulo="La sala terminó" sub="Venció o la cerró quien la organizaba." />}
      {e && !esInexistente(e) && e.estado === "lobby" && <Lobby estado={e} desfase={sala.desfase} roomId={roomId} releer={sala.releer} />}
      {e && !esInexistente(e) && e.estado === "preparando" && (
        <div className="sala-espera-tanda" role="status" aria-live="polite">
          <p className="sala-h2">Armando la tanda…</p>
          <p className="sala-hint">Estamos eligiendo las películas para todos. Son unos segundos.</p>
        </div>
      )}
      {e && !esInexistente(e) && e.estado === "votando" && e.ronda && token && (
        <Votacion key={e.ronda.id} estado={e} ronda={e.ronda} roomId={roomId} token={token} desfase={sala.desfase} releer={sala.releer} />
      )}
      {e && !esInexistente(e) && (e.estado === "empate" || e.estado === "resultado") && e.ronda && e.resultado && (
        // El resultado lo trae la base (`estado.resultado`); acá sólo se elige
        // la pantalla. Un componente por ronda: la rueda del empate y las
        // animaciones corren una vez por tanda, no por relectura.
        <Resultado key={e.ronda.id} estado={e} roomId={roomId} desfase={sala.desfase} releer={sala.releer} />
      )}
    </div>
  );
}

function Resultado({ estado: e, roomId, desfase, releer }: { estado: EstadoSala; roomId: string; desfase: number; releer: () => Promise<void> }) {
  const ronda = e.ronda!, r = e.resultado!;
  if (r.tipo === "empate") return <ResultadoEmpate estado={e} resultado={r} titulos={ronda.titulos} roomId={roomId} desfase={desfase} releer={releer} />;
  if (r.tipo === "sin_coincidencias") return <ResultadoSinCoincidencias estado={e} titulos={ronda.titulos} roomId={roomId} desfase={desfase} releer={releer} />;
  const ganadora = r.ganador_pos === null ? null : ronda.titulos.find((t) => t.pos === r.ganador_pos) ?? null;
  if ((r.tipo === "match" || r.tipo === "ganador") && ganadora) return <ResultadoMatch estado={e} card={ganadora} roomId={roomId} desfase={desfase} releer={releer} />;
  // `vencida` (empate que nadie resolvió) o un resultado sin card: la sala termina.
  return <Terminal titulo="La ronda terminó" sub="No quedó una película elegida." />;
}

function Terminal({ titulo, sub }: { titulo: string; sub: string }) {
  return (
    <div className="sala-espera-tanda" role="status">
      <p className="sala-h2">{titulo}</p>
      <p className="sala-hint">{sub}</p>
      <Link href="/" className="rlt-btn">Volver al inicio</Link>
    </div>
  );
}
