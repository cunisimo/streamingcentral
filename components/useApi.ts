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

// Centinela para distinguir "el body parseó y dio null" (dato legítimo) de "el
// body no se pudo parsear" (ej: captive portal que responde 200 con HTML). Un
// símbolo de módulo no puede confundirse con ningún valor real de T.
const PARSE_FAILED = Symbol("useApi:parse-failed");

interface UseApiOptions {
  // Por defecto `data` se limpia cuando el efecto re-corre con deps distintas
  // o cuando el fetch falla — así un consumidor que navega de un recurso a
  // otro (DetailView, PersonView, IndecisoHero por chip) nunca renderiza el
  // contenido del recurso anterior bajo una URL/título nuevo.
  // Solo CatalogView necesita lo contrario: que un hipo de red durante un
  // refetch del Home no borre los carruseles ya visibles.
  keepPrevious?: boolean;
}

// Fetch genérico que re-dispara cuando cambian las plataformas, las deps, o se
// pide un retry manual.
export function useApi<T>(url: () => string, deps: unknown[] = [], options: UseApiOptions = {}): ApiState<T> {
  const { keepPrevious = false } = options;
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
    if (!u) { setLoading(false); if (!keepPrevious) setData(null); return; }
    let alive = true;
    setLoading(true);
    setOffline(false);
    setError(false);
    // Limpiar ya (no solo en error) para que un consumidor sin keepPrevious no
    // muestre el contenido del recurso anterior mientras llega el nuevo.
    if (!keepPrevious) setData(null);
    fetch(u)
      .then(async (r) => {
        // Chequear r.ok ANTES de tomar el body como datos: r.json() resuelve
        // perfecto sobre un 500, así que sin esto el error pasaba por payload.
        let body: unknown = PARSE_FAILED;
        try { body = await r.json(); } catch { /* body queda en PARSE_FAILED */ }
        if (!alive) return;
        // 200 con body no-JSON (ej: captive portal) es tan inválido como un
        // 4xx/5xx: si no, `data` queda null con loading/offline/error en
        // false, un estado imposible que cuelga el skeleton para siempre.
        if (!r.ok || body === PARSE_FAILED) {
          setError(true);
          setLoading(false);
          if (!keepPrevious) setData(null);
          return;
        }
        setData(body as T);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        setOffline(true);
        if (!keepPrevious) setData(null);
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, platforms.join(","), nonce, ...deps]);

  // `|| !ready`: mientras PlatformsContext no leyó localStorage no se pidió
  // nada todavía, así que el estado honesto es "cargando" y no "no hay datos".
  // Sin esto, un consumidor que pasa URL vacía hasta estar listo (el Home, los
  // rieles controlados) recibía loading=false con data=null y pintaba por un
  // frame su estado de error o de vacío, con la app perfectamente sana.
  return { data, loading: loading || !ready, offline, error, retry };
}

export const provParam = (platforms: string[]) => platforms.join(",");
