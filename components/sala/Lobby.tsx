"use client";
import { useEffect, useRef, useState } from "react";
import PlatformLogo from "../PlatformLogo";
import PrepararTanda from "./PrepararTanda";
import CerrarSala from "./CerrarSala";
import { useVenceEn, formatoSeg } from "@/hooks/useVenceEn";
import { rotuloEmpezar, lineaGente, reciénLlegados, avisoDeLlegada, MINIMO } from "@/lib/sala/lobby-nucleo";
import type { EstadoSala } from "@/lib/sala/estado";

// El lobby: quiénes están, cuánto falta para que venza, y —sólo para quien
// creó la sala— la configuración de la tanda y el botón "Empezar"
// (`PrepararTanda`, compartido con "Otra tanda" de los resultados).
//
// El enlace para invitar se muestra acá como texto + "Copiar". El mensaje y la
// acción de compartir del sistema llegan en la Etapa 5.
export default function Lobby({ estado, desfase, roomId, releer }: { estado: EstadoSala; desfase: number; roomId: string; releer: () => Promise<void> }) {
  const seg = useVenceEn(estado, desfase);
  const [copiado, setCopiado] = useState(false);
  const [enlace, setEnlace] = useState("");
  useEffect(() => { setEnlace(`${location.origin}/sala/${roomId}`); }, [roomId]);

  const soyHost = estado.soy.es_host;
  const organizador = estado.participantes.find((p) => p.es_host)?.nombre;

  // Aviso de llegada, JUNTO AL BOTÓN. La lista de arriba ya se actualizaba sola
  // por Realtime; lo que faltaba era que el organizador se enterara sin subir la
  // pantalla. El cálculo está en lib/sala/lobby-nucleo.ts (puro, con pruebas).
  const [aviso, setAviso] = useState<string | null>(null);
  // Arranca con la primera lectura ya "vista": al montar no llegó nadie.
  const nombresPrevios = useRef<string[] | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);
  useEffect(() => {
    const ahora = estado.participantes.map((p) => p.nombre);
    const antes = nombresPrevios.current;
    nombresPrevios.current = ahora;
    if (antes === null) return;
    const texto = avisoDeLlegada(reciénLlegados(antes, ahora));
    if (!texto) return;
    setAviso(texto);
    // El temporizador va en un ref y NO en el `return` del efecto: `estado` se
    // vuelve a leer seguido (canal + relecturas) y cada lectura trae un array
    // nuevo, así que la limpieza del efecto anterior cancelaría la cuenta y el
    // aviso se quedaría pegado.
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setAviso(null), 6000);
  }, [estado.participantes]);

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
          <PrepararTanda roomId={roomId} rotulo={rotuloEmpezar(estado.n)} releer={releer} disabled={estado.n < MINIMO}
            sizeInicial={estado.config_default?.size} duracionInicial={estado.config_default?.duracion}
            hint={<><span>{lineaGente(estado.n)}</span>{aviso && <strong className="sala-llego"> {aviso}</strong>}</>} />
          <CerrarSala roomId={roomId} />
        </section>
      ) : (
        <section className="sala-bloque">
          <p className="sala-espera" role="status">Esperando a que {organizador ?? "quien organiza"} empiece…</p>
        </section>
      )}
    </div>
  );
}
