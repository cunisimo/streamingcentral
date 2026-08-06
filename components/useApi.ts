"use client";
import { useEffect, useState, useCallback } from "react";
import { usePlatforms } from "./PlatformsContext";

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  // true cuando el fetch falló por red (sin conexión) y no hay datos que mostrar.
  // La UI usa esto para renderizar <OfflineState> con "Reintentar" en vez de un
  // vacío mudo. El SW nunca sirve /api/* desde cache (Network Only), así que un
  // fallo de red acá siempre es un fallo real, no un dato viejo.
  offline: boolean;
  // true cuando SÍ hubo respuesta pero con status de error (4xx/5xx). Distinto de
  // `offline` (no hubo respuesta). Sin esto, un 500 con body JSON —el shape que
  // devuelven nuestras rutas: { error, ...vacíos }— se tomaba como datos buenos y
  // la vista quedaba vacía, sin mensaje ni reintento.
  // En este caso `data` conserva el último payload bueno (semántica tipo SWR),
  // para que un fallo de refetch no borre lo que ya está en pantalla.
  error: boolean;
  retry: () => void;
}

// Fetch genérico que re-dispara cuando cambian las plataformas, las deps, o se
// pide un retry manual.
export function useApi<T>(url: () => string, deps: unknown[] = []): ApiState<T> {
  const { platforms, ready } = usePlatforms();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!ready) return;
    const u = url();
    // URL vacía = riel en modo controlado (los items vienen por prop): no hay
    // nada que pedir y tampoco hay que quedar en loading para siempre.
    if (!u) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setOffline(false);
    setError(false);
    fetch(u)
      .then(async (r) => {
        // Chequear r.ok ANTES de tomar el body como datos: r.json() resuelve
        // perfecto sobre un 500, así que sin esto el error pasaba por payload.
        const body = await r.json().catch(() => null);
        if (!alive) return;
        if (!r.ok) { setError(true); setLoading(false); return; }
        setData(body as T);
        setLoading(false);
      })
      .catch(() => { if (alive) { setLoading(false); setOffline(true); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, platforms.join(","), nonce, ...deps]);

  return { data, loading, offline, error, retry };
}

export const provParam = (platforms: string[]) => platforms.join(",");
