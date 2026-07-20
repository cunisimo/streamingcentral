"use client";
import { useMemo } from "react";

const COLORS = ["#FF6A1A", "#E1452B", "#3B6FE0", "#11A56A", "#E0A100", "#C1356B"];

// Confeti cayendo, sin dependencias: piezas con posición/color/delay al azar y
// una keyframe de caída. Se omite bajo prefers-reduced-motion.
export default function Confetti({ count = 70 }: { count?: number }) {
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        dur: 2.4 + Math.random() * 1.8,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6,
        drift: (Math.random() * 2 - 1) * 60,
        rot: Math.random() * 540,
      })),
    [count],
  );
  if (reduce) return null;
  return (
    <div className="dsmp-confetti" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="dsmp-confetti-pc"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.42,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            ["--drift" as string]: `${p.drift}px`,
            ["--rot" as string]: `${p.rot}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
