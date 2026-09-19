"use client";
import { DURACIONES, SIZES, type Duracion, type Size } from "@/lib/sala/tipos";

// Cantidad y duración de la tanda. Sólo lo ve el organizador. El default
// (10 + Cualquiera) lo pone quien monta esto con `CONFIG_DEFAULT`; la API no
// rellena nada. Reusa `.tt` (los chips del buscador) para los segmentos.
const ROTULO_SIZE: Record<Size, string> = { 5: "5 películas", 10: "10", 20: "20" };
const ROTULO_DUR: Record<Duracion, { tit: string; sub: string }> = {
  cualquiera: { tit: "Cualquiera", sub: "" },
  corta: { tit: "Corta", sub: "1 h 30 o menos" },
  larga: { tit: "Larga", sub: "Más de 1 h 30" },
};

export default function ConfigTanda({ size, duracion, onSize, onDuracion, disabled, alcanzables }: {
  size: Size; duracion: Duracion;
  onSize: (s: Size) => void; onDuracion: (d: Duracion) => void;
  disabled?: boolean;
  /** Si la última preparación dijo `insuficientes`, los tamaños que sí alcanzan; se destacan. */
  alcanzables?: Size[] | null;
}) {
  return (
    <div className="sala-config">
      <span className="chip-group-label">Cuántas películas</span>
      <div className="sala-seg" role="group" aria-label="Cantidad de películas">
        {SIZES.map((s) => (
          <button key={s} type="button" className={`tt ${size === s ? "on" : ""}`} aria-pressed={size === s}
            disabled={disabled} onClick={() => onSize(s)}>
            {ROTULO_SIZE[s]}{alcanzables && !alcanzables.includes(s) ? " ·" : ""}
          </button>
        ))}
      </div>
      <span className="chip-group-label">Duración</span>
      <div className="sala-seg" role="group" aria-label="Duración">
        {DURACIONES.map((d) => (
          <button key={d} type="button" className={`tt ${duracion === d ? "on" : ""}`} aria-pressed={duracion === d}
            disabled={disabled} onClick={() => onDuracion(d)} title={ROTULO_DUR[d].sub || undefined}>
            {ROTULO_DUR[d].tit}
          </button>
        ))}
      </div>
      <p className="sala-hint">
        {duracion === "corta" ? "Películas de 1 h 30 o menos." : duracion === "larga" ? "Películas de más de 1 h 30." : "Sin filtro de duración."}
        {" "}Tiempo para votar: {size === 5 ? "2" : size === 10 ? "3" : "5"} minutos.
      </p>
    </div>
  );
}
