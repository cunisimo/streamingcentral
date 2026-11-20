"use client";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api-base";
import { publicasDeRespuesta, type CuriosidadPublica, type TipoTitulo } from "@/lib/curiosidades-nucleo";
import SabiasQueTarjeta from "./SabiasQueTarjeta";

// Sección «¿Sabías que…?» de la ficha (web y contenedor Android: el mismo
// componente, con `apiUrl` hacia la API remota en el contenedor).
//
// - Pide `/api/curiosidad/<tipo>/<id>` recién al montarse, o sea DESPUÉS de que
//   la ficha ya se dibujó: no retrasa el contenido principal.
// - Sin curiosidad publicada, mientras carga o si la consulta falla, NO dibuja
//   nada (ni título ni hueco): la ficha sigue igual que sin esta sección.
// - La ficha la monta con `key` por título: al cambiar de película/serie se
//   desmonta la anterior (su respuesta tardía se descarta por `vivo`) y el
//   spoiler revelado no se arrastra.
export default function SabiasQue({ tipo, tmdbId }: { tipo: TipoTitulo; tmdbId: number }) {
  const [items, setItems] = useState<CuriosidadPublica[]>([]);

  useEffect(() => {
    let vivo = true;
    const ctrl = new AbortController();
    fetch(apiUrl(`/api/curiosidad/${tipo}/${tmdbId}`), { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => { if (vivo) setItems(publicasDeRespuesta(body)); })
      .catch(() => { /* sin red o 5xx: la sección no aparece, la ficha sigue */ });
    return () => { vivo = false; ctrl.abort(); };
  }, [tipo, tmdbId]);

  if (!items.length) return null;
  return (
    <section className="sq" aria-labelledby={`sq-h-${tipo}-${tmdbId}`}>
      <h2 className="dsec-h" id={`sq-h-${tipo}-${tmdbId}`}>¿Sabías que…?</h2>
      {items.map((c, i) => <SabiasQueTarjeta key={i} c={c} />)}
    </section>
  );
}
