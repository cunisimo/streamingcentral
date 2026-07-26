"use client";
import AvatarCard from "./AvatarCard";

// Grilla de opciones. No maneja estado: recibe las semillas y la selección.
export default function AvatarGrid({
  seeds, selected, onSelect,
}: {
  seeds: string[];
  selected: string | null;
  onSelect: (seed: string) => void;
}) {
  return (
    <div className="avgrid">
      {seeds.map((s) => (
        <AvatarCard key={s} seed={s} selected={s === selected} onSelect={onSelect} />
      ))}
    </div>
  );
}
