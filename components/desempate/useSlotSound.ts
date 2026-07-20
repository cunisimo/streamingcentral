"use client";
import { useCallback, useRef, useState } from "react";

// SFX opcional sin assets: pequeños "ticks" y un acorde de resultado con
// WebAudio. Arranca en mute (enabled=false). Todo se crea tras un gesto del
// usuario (el click de girar), así que la política de autoplay no molesta.
export function useSlotSound() {
  const [enabled, setEnabled] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);

  const ctx = useCallback(() => {
    if (!enabled) return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    return ctxRef.current;
  }, [enabled]);

  const beep = useCallback((freq: number, dur = 0.05, gain = 0.04) => {
    const c = ctx();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g).connect(c.destination);
    const now = c.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.start(now);
    osc.stop(now + dur);
  }, [ctx]);

  const tick = useCallback(() => beep(520, 0.03, 0.03), [beep]);
  const win = useCallback(() => {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.16, 0.05), i * 90));
  }, [beep]);

  return { enabled, toggle: () => setEnabled((v) => !v), tick, win };
}
