"use client";
import { useState } from "react";
import { avatarSvg, randomSeed } from "@/lib/avatar";

export default function AvatarPicker({
  current, onPick,
}: {
  current: string; onPick: (seed: string) => void;
}) {
  const [seeds, setSeeds] = useState<string[]>(() => {
    const s = new Set<string>([current].filter(Boolean));
    while (s.size < 16) s.add(randomSeed());
    return [...s];
  });

  return (
    <div className="field">
      <label>Elegí tu avatar</label>
      <div className="avpick">
        {seeds.map((s) => (
          <button
            key={s} type="button"
            className={`avopt ${s === current ? "on" : ""}`}
            onClick={() => onPick(s)}
            aria-pressed={s === current}
          >
            <img src={avatarSvg(s)} alt="" />
          </button>
        ))}
      </div>
      <button type="button" className="btn ghost" style={{ marginTop: 10 }}
        onClick={() => setSeeds((prev) => [...prev, ...Array.from({ length: 8 }, () => randomSeed())])}>
        Mostrar más
      </button>
    </div>
  );
}
