"use client";
import { PieResultado } from "./ResultadoMatch";
import { useVenceEn } from "@/hooks/useVenceEn";
import type { EstadoSala } from "@/lib/sala/estado";
import type { CardSala } from "@/lib/sala/tipos";

// "Esta vez no coincidieron" (plan de salas, Tarea 4.1). Sin corazón roto: las
// cards de la tanda se separan suavemente (`sala-separa`) y listo. El
// organizador puede pedir otra tanda; los demás esperan.
export default function ResultadoSinCoincidencias({ estado, titulos, roomId, desfase, releer }: {
  estado: EstadoSala; titulos: CardSala[]; roomId: string; desfase: number; releer: () => Promise<void>;
}) {
  const seg = useVenceEn(estado, desfase);
  const muestra = titulos.slice(0, 6);
  return (
    <div className="sala-resultado sala-sin">
      <div className="sala-separan" aria-hidden>
        {muestra.map((t, i) => (
          <span key={t.pos} className="sala-separa" style={{ ["--i" as string]: i, ["--n" as string]: muestra.length } as React.CSSProperties}>
            {t.poster ? <img src={t.poster} alt="" /> : <span className="sala-separa-txt">{t.titulo}</span>}
          </span>
        ))}
      </div>
      <h1 className="sala-h1 sala-titular">Esta vez no coincidieron</h1>
      <p className="sala-hint">Ninguna película juntó dos síes. Pasa. Otra tanda trae otras.</p>
      <PieResultado estado={estado} roomId={roomId} seg={seg} releer={releer} />
    </div>
  );
}
