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
  retry: () => void;
}

// Fetch genérico que re-dispara cuando cambian las plataformas, las deps, o se
// pide un retry manual.
export function useApi<T>(url: () => string, deps: unknown[] = []): ApiState<T> {
  const { platforms, ready } = usePlatforms();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoading(true);
    setOffline(false);
    fetch(url())
      .then((r) => r.json())
      .then((j) => { if (alive) { setData(j); setLoading(false); } })
      .catch(() => { if (alive) { setLoading(false); setOffline(true); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, platforms.join(","), nonce, ...deps]);

  return { data, loading, offline, retry };
}

export const provParam = (platforms: string[]) => platforms.join(",");
