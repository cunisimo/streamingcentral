"use client";
import { memo } from "react";
import Avatar from "./Avatar";
import { ESTILO_YUMP, type Avatar as AvatarDef } from "@/lib/avatares";

// Una opción del selector. El nombre accesible sale del catálogo, así que un
// lector de pantalla dice "Buitracio" y no "Elegir este avatar" treinta y una
// veces seguidas.
//
// `lazy` viene del llamador: las primeras filas cargan de una y el resto espera
// a entrar en el área visible. Sin eso, abrir el selector se traía los 31
// archivos juntos.
function AvatarCardBase({
  avatar, selected, onSelect, lazy,
}: {
  avatar: AvatarDef;
  selected: boolean;
  onSelect: (id: string) => void;
  lazy: boolean;
}) {
  return (
    <button
      type="button"
      className={`avcard ${selected ? "on" : ""}`}
      onClick={() => onSelect(avatar.id)}
      aria-pressed={selected}
      aria-label={avatar.nombre}
      title={avatar.nombre}
    >
      <Avatar
        perfil={{ avatar_style: ESTILO_YUMP, avatar_seed: avatar.id }}
        size={64}
        lazy={lazy}
      />
    </button>
  );
}

const AvatarCard = memo(AvatarCardBase);
export default AvatarCard;
