"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePlatforms } from "../PlatformsContext";
import { estaEnTusPlataformas, ordenarPorDisponibilidad } from "./desempate-orden";
import type { UITitle } from "@/lib/types";
import { apiUrl } from "@/lib/api-base";

// Mismo patrón de debounce que SearchView (250ms, desde 2 caracteres). Usa
// /api/search (multi, sin filtrar por plataforma), pero acá sólo se puede
// AGREGAR un título si está en alguna de tus plataformas: no tiene sentido
// desempatar entre algo que no podés ver. Los no disponibles NO se ocultan —se
// muestran atenuados, bloqueados y al final de la fila.
export default function DesempateManualSearch({
  onAdd, isSelected, full,
}: {
  onAdd: (t: UITitle) => void;
  isSelected: (t: UITitle) => boolean;
  full: boolean;
}) {
  const { platforms } = usePlatforms();
  const [q, setQ] = useState("");
  const [titles, setTitles] = useState<UITitle[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const available = (t: UITitle) => estaEnTusPlataformas(t, platforms);

  // El efecto depende SOLO de `q`. Cambiar de plataformas no vuelve a buscar:
  // la fila se reordena abajo con los resultados que ya están en memoria.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setTitles([]); setLoading(false); return; }
    if (timer.current) clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(() => {
      fetch(apiUrl(`/api/search?q=${encodeURIComponent(term)}`))
        .then((r) => r.json())
        .then((j) => { setTitles(j.titles ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  // Primero los disponibles, después el resto, conservando la relevancia dentro
  // de cada grupo. Depende de `platforms`, así que tocar el selector reordena
  // sin pedir nada.
  const ordenados = useMemo(
    () => ordenarPorDisponibilidad(titles, available),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [titles, platforms],
  );

  return (
    <div className="dsmp-manual">
      <div className="dsmp-search">
        <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscá una película o serie…"
        />
      </div>
      {!platforms.length && (
        <p className="empty-note">Activá al menos una plataforma (botón de arriba) para poder cargar títulos.</p>
      )}
      {loading && <p className="loading">Buscando…</p>}
      {!loading && q.trim().length >= 2 && titles.length === 0 && (
        <p className="empty-note">Sin resultados para “{q}”.</p>
      )}
      {ordenados.length > 0 && (
        <div className="dsmp-picks">
          {ordenados.map((t) => {
            const sel = isSelected(t);
            const avail = available(t);
            const disabled = sel || full || !avail;
            // La marca del centro: ✓ si ya está elegida, + si se puede elegir.
            // No aparece en las no disponibles —ahí no hay nada que sumar— y se
            // muestra apagada cuando el cupo está lleno, para que el botón siga
            // explicándose en vez de desaparecer sin motivo visible.
            const marca = !avail ? null : sel ? "✓" : "+";
            return (
              <button
                key={`${t.type}-${t.id}`}
                className={`dsmp-pick ${sel ? "is-sel" : ""} ${!avail ? "is-off" : ""}`}
                disabled={disabled}
                onClick={() => onAdd(t)}
                // El aria-label dice la ACCIÓN y por qué no se puede, cuando no
                // se puede: un lector de pantalla no ve el póster apagado ni el
                // cartel encima.
                aria-label={
                  !avail ? `${t.title}: no está en tus plataformas`
                    : sel ? `${t.title}: ya está en tu selección`
                    : full ? `${t.title}: ya elegiste el máximo de títulos`
                    : `Agregar ${t.title} a la ruleta`
                }
                title={avail ? t.title : `${t.title} — no está en tus plataformas`}
              >
                <span className="dsmp-pick-poster">
                  {/* El póster va en su PROPIA capa porque es la única que lleva
                      el filtro de "no disponible". Estando en el contenedor,
                      apagaba también el cartel y el texto blanco se veía gris. */}
                  <span
                    className="dsmp-pick-img"
                    style={t.poster ? { backgroundImage: `url(${t.poster})` } : { background: "#3A3A42" }}
                  />
                  {!t.poster && <span className="dsmp-pick-txt">{t.title}</span>}
                  {marca && (
                    <span className={`dsmp-pick-marca ${sel ? "is-sel" : ""} ${full && !sel ? "is-lleno" : ""}`} aria-hidden="true">
                      {marca}
                    </span>
                  )}
                  {!avail && <span className="dsmp-pick-off">No en tus plataformas</span>}
                </span>
                <span className="dsmp-pick-name">{t.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
