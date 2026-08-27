"use client";
import AvatarCard from "./AvatarCard";
import { AVATARES } from "@/lib/avatares";

// Grilla de opciones. No maneja estado: recibe la selección y avisa.
//
// LAS 31 IMÁGENES SE PIDEN AL MONTAR, que es cuando alguien abrió el selector —
// y no antes: el modal entra por `dynamic`, así que este código ni siquiera viaja
// al navegador hasta que se toca "Cambiar avatar".
//
// Antes las primeras 10 iban `eager` y las otras 21 `lazy`, y esas 21 se
// quedaban **sin pedir**: círculos vacíos, distintos en cada apertura. La
// medición está en `docs/ISSUES.md` → #15.
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
      {AVATARES.map((a) => (
        <AvatarCard
          key={a.id}
          avatar={a}
          selected={a.id === selected}
          onSelect={onSelect}
          bloqueado={bloqueado}
        />
      ))}
    </div>
  );
}
