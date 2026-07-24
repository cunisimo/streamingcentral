"use client";
import { memo } from "react";
import Avatar from "./Avatar";
import { DEFAULT_AVATAR_STYLE } from "@/lib/avatar";

// Una opción del grid del modal. Estilo fijo (adventurer-neutral); sólo varía
// la semilla. Resalta con borde + micro-animación cuando está seleccionada.
function AvatarCardBase({
  seed, selected, onSelect,
}: {
  seed: string;
  selected: boolean;
  onSelect: (seed: string) => void;
}) {
  return (
    <button
      type="button"
      className={`avcard ${selected ? "on" : ""}`}
      onClick={() => onSelect(seed)}
      aria-pressed={selected}
      aria-label="Elegir este avatar"
    >
      <Avatar seed={seed} style={DEFAULT_AVATAR_STYLE} size={64} />
    </button>
  );
}

const AvatarCard = memo(AvatarCardBase);
export default AvatarCard;
