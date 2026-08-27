"use client";
import AvatarCard from "./AvatarCard";
import { AVATARES } from "@/lib/avatares";

// Cuántas cargan de entrada. Con la grilla más angosta (320 px, 4 columnas) las
// primeras dos filas y media entran en pantalla; el resto llega al hacer scroll.
const ANSIOSAS = 10;

// Grilla de opciones. No maneja estado: recibe la selección y avisa.
//
// Recorre el catálogo directamente en vez de recibir una lista: el orden del
// catálogo ES el orden de la grilla, y así no hay dos sitios que puedan
// discrepar.
export default function AvatarGrid({
  selected, onSelect, bloqueado,
}: {
  selected: string | null;
  onSelect: (id: string) => void;
  /** `true` mientras se guarda. */
  bloqueado: boolean;
}) {
  return (
    <div className="avgrid" role="group" aria-label="Avatares disponibles">
      {AVATARES.map((a, i) => (
        <AvatarCard
          key={a.id}
          avatar={a}
          selected={a.id === selected}
          onSelect={onSelect}
          lazy={i >= ANSIOSAS}
          bloqueado={bloqueado}
        />
      ))}
    </div>
  );
}
