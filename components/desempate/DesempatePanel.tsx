"use client";
import { useDesempate } from "./useDesempate";
import DesempateSetup from "./DesempateSetup";
import Wheel from "./Wheel";
import DesempateResult from "./DesempateResult";

export default function DesempatePanel({ onClose }: { onClose: () => void }) {
  const g = useDesempate();
  const { phase, selected, winnerIdx } = g.state;

  return (
    <div className="dsmp-panel">
      <div className="dsmp-panel-head">
        {/* El nombre ya está en el banner justo arriba: repetirlo acá gastaba la
            línea más visible del panel en decir dos veces lo mismo. En su lugar,
            lo único que hace falta saber al abrirlo. */}
        <span className="dsmp-panel-title">Buscá o escribí una película o serie</span>
        <button className="dsmp-close" onClick={onClose} aria-label="Cerrar">✕</button>
      </div>

      {phase === "setup" && (
        <DesempateSetup
          selected={selected}
          add={g.add}
          remove={g.remove}
          spin={g.spin}
          keyOf={g.keyOf}
        />
      )}

      {phase === "spinning" && winnerIdx != null && (
        <Wheel selected={selected} winnerIdx={winnerIdx} onFinish={g.finish} />
      )}

      {phase === "result" && g.winner && (
        <DesempateResult winner={g.winner} onReplay={g.replay} />
      )}
    </div>
  );
}
