"use client";
import { useEffect, useRef, useState } from "react";
import { trailerEmbedUrl } from "@/lib/trailer";

const YT_ORIGIN = "https://www.youtube-nocookie.com";

export default function TrailerPlayer({ youtubeKey, onClose }: { youtubeKey: string; onClose: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [muted, setMuted] = useState(true);
  const [nonce, setNonce] = useState(0); // remonta el iframe al reintentar

  // Foco al botón cerrar (accesibilidad). Se re-ejecuta al cambiar de estado
  // para que el foco también aterrice en "Cerrar" del estado de error.
  useEffect(() => { closeRef.current?.focus(); }, [status]);

  // Cover: dimensiona el iframe para cubrir la caja manteniendo 16:9.
  useEffect(() => {
    const fit = () => {
      const box = wrapRef.current, ifr = iframeRef.current;
      if (!box || !ifr) return;
      const w = box.clientWidth, h = box.clientHeight;
      ifr.style.width = Math.max(w, (h * 16) / 9) + "px";
      ifr.style.height = Math.max(h, (w * 9) / 16) + "px";
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [nonce]);

  // Timeout de carga → estado error, sin romper el hero.
  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => setStatus((s) => (s === "loading" ? "error" : s)), 8000);
    return () => clearTimeout(t);
  }, [status, nonce]);

  const command = (func: "mute" | "unMute") => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args: [] }),
      YT_ORIGIN,
    );
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    command(next ? "mute" : "unMute");
  };

  const toggleFullscreen = () => {
    iframeRef.current?.requestFullscreen?.().catch(() => {});
  };

  const retry = () => { setStatus("loading"); setNonce((n) => n + 1); };

  if (status === "error") {
    return (
      <div className="htrailer-player htrailer-msg">
        <p>No se pudo cargar el tráiler.</p>
        <div className="htrailer-msg-actions">
          <button onClick={retry}>Reintentar</button>
          <button ref={closeRef} onClick={onClose}>Cerrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="htrailer-player" ref={wrapRef}>
      {status === "loading" && <div className="htrailer-spin" aria-hidden />}
      <iframe
        key={nonce}
        ref={iframeRef}
        src={trailerEmbedUrl(youtubeKey, typeof window !== "undefined" ? window.location.origin : undefined)}
        title="Tráiler"
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen
        // Limitación: si el trailer tiene el embed deshabilitado o está
        // bloqueado por región, YouTube igual dispara onLoad (renderiza su
        // propia página "Ver en YouTube"), así que no cae en el estado de
        // error. Degrada bien (queda el link de YouTube adentro de la caja).
        onLoad={() => setStatus("ready")}
        className={status === "ready" ? "is-ready" : ""}
      />
      <div className="htrailer-ctl">
        <button onClick={toggleMute} aria-label={muted ? "Activar sonido" : "Silenciar"}>
          {muted ? "🔇" : "🔊"}
        </button>
        <button onClick={toggleFullscreen} aria-label="Pantalla completa">⛶</button>
        <button ref={closeRef} onClick={onClose} aria-label="Cerrar tráiler">✕</button>
      </div>
    </div>
  );
}
