"use client";
import { useEffect, useState } from "react";

// Estado de conexión reactivo. OJO: navigator.onLine === true solo significa
// "hay interfaz de red", no "hay internet" (wifi de hotel, captive portal). La
// verdad la da un fetch fallido; este hook sirve para reaccionar rápido y para
// disparar reintentos automáticos cuando vuelve la conexión.
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}
