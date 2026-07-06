"use client";
import { useEffect, useState } from "react";
import { usePlatforms } from "./PlatformsContext";

// Fetch genérico que re-dispara cuando cambian las plataformas o las deps.
export function useApi<T>(url: () => string, deps: unknown[] = []): { data: T | null; loading: boolean } {
  const { platforms, ready } = usePlatforms();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    setLoading(true);
    fetch(url())
      .then((r) => r.json())
      .then((j) => { if (alive) { setData(j); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, platforms.join(","), ...deps]);
  return { data, loading };
}

export const provParam = (platforms: string[]) => platforms.join(",");
