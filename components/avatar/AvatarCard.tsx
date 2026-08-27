"use client";
import { memo } from "react";
import Avatar from "./Avatar";
import { type Avatar as AvatarDef } from "@/lib/avatares";
import { atributosBloqueo } from "@/lib/foco-modal";

// Una opción del selector. El nombre accesible sale del catálogo, así que un
// lector de pantalla dice "Buitracio" y no "Elegir este avatar" treinta y una
// veces seguidas.
//
// `lazy` viene del llamador: las primeras filas cargan de una y el resto espera
// a entrar en el área visible. Sin eso, abrir el selector se traía los 31
// archivos juntos.
function AvatarCardBase({
  avatar, selected, onSelect, lazy, bloqueado,
}: {
  avatar: AvatarDef;
  selected: boolean;
  onSelect: (id: string) => void;
  lazy: boolean;
  /** `true` mientras se guarda: la opción no se puede cambiar. */
  bloqueado: boolean;
}) {
  return (
    <button
      type="button"
      className={`avcard ${selected ? "on" : ""}${bloqueado ? " bloqueada" : ""}`}
      // `onSelect` decide con `nuevaSeleccion`, así que un toque durante el
      // guardado llega y no hace nada. El botón NO lleva `disabled`: eso lo
      // sacaría del orden de tabulación y el foco se caería al body.
      onClick={() => onSelect(avatar.id)}
      aria-pressed={selected}
      aria-label={avatar.nombre}
      title={avatar.nombre}
      {...atributosBloqueo(bloqueado)}
    >
      {/* Alcanza con la semilla: `resolverAvatar` resuelve por pertenencia al
          catálogo y no mira la columna de estilo. */}
      <Avatar perfil={{ avatar_seed: avatar.id }} size={64} lazy={lazy} />
    </button>
  );
}

const AvatarCard = memo(AvatarCardBase);
export default AvatarCard;
