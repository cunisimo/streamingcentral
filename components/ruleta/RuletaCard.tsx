"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../AuthContext";
import { usePlatforms } from "../PlatformsContext";
import PlatformLogo from "../PlatformLogo";
import { genreLabel } from "../data";
import { hasItem, setItem } from "@/lib/userdata";
import { fraseAtencion } from "./frases";
import type { RoulettePick } from "@/lib/roulette";

export default function RuletaCard({
  pick, onOtra, onCerrar,
}: { pick: RoulettePick; onOtra: () => void; onCerrar: () => void }) {
  const { user } = useAuth();
  const { platforms } = usePlatforms();
  const router = useRouter();
  const [visto, setVisto] = useState(false);
  const [busy, setBusy] = useState(false);
  const frase = fraseAtencion(pick.atencion, pick.id);
  // `pick.platforms` son TODAS las plataformas del título en AR, en el orden
  // que las da TMDB — no filtradas por las del usuario. La RPC garantiza que
  // el título está en alguna de las suyas, pero no necesariamente la primera
  // de esa lista, así que mostrar `[0]` a secas puede pintar una plataforma
  // que el usuario no tiene (ej: sólo MovistarTV, título en Netflix + Movistar
  // → mostraba NETFLIX). Elegimos la primera que sí tenga, y sólo si ninguna
  // matchea (no debería pasar, pero por las dudas) caemos a `[0]`.
  const plataforma = pick.platforms.find((p) => platforms.includes(p)) ?? pick.platforms[0];

  // Hidrata "ya la vi" al montar, igual que components/ListActions.tsx: el
  // criterio de aceptación pide reflejo en los dos sentidos (ficha↔tarjeta),
  // no sólo tarjeta→ficha. A diferencia de ListActions, NO llamamos
  // recordView acá: pasar por la ruleta no es "visitar la ficha".
  useEffect(() => {
    if (!user) { setVisto(false); return; }
    let alive = true;
    hasItem("watched", { tmdb_id: pick.id, tipo: pick.type }).then((w) => { if (alive) setVisto(w); });
    return () => { alive = false; };
  }, [user, pick.id, pick.type]);

  // Copia exacta de toggleWatched de components/ListActions.tsx:30 — mismo dato,
  // misma acción. Es un TOGGLE de ida y vuelta: un mistap se deshace tocando de
  // nuevo, sin tener que ir a buscar la ficha. Y por eso la tarjeta NO avanza
  // sola al marcar: si avanzara, deshacer sería imposible acá.
  async function toggleVisto() {
    if (!user) { router.push("/cuenta"); return; }
    if (busy) return;
    setBusy(true);
    const next = !visto;
    setVisto(next); // optimista
    const { error } = await setItem(user.id, "watched", { tmdb_id: pick.id, tipo: pick.type }, next);
    if (error) setVisto(!next); // rollback
    setBusy(false);
  }

  // `pick.genres` son slugs (`accion`, `misterio-intrincado`), no texto para
  // mostrar: hay que pasarlos por `genreLabel` como hace toda la app (ver
  // components/DetailView.tsx) antes de unirlos.
  const meta = [
    pick.year, pick.runtime,
    pick.genres.length ? pick.genres.map(genreLabel).join(" / ") : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="rlt-card">
      <button className="rlt-close" onClick={onCerrar} aria-label="Cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>

      {/* Póster al costado del bloque de identidad, no arriba de todo: la
          tarjeta es mayormente texto (razón + advertencia) y sin una imagen
          que la ancle se lee como un paredón. La razón queda a lo ancho abajo,
          que es donde el renglón largo se lee mejor. */}
      <div className="rlt-head">
        {pick.poster && (
          <Link className="rlt-poster" href={`/titulo/${pick.type}/${pick.id}`}>
            <img src={pick.poster} alt="" loading="lazy" />
          </Link>
        )}
        <div className="rlt-ident">
          <span className="chip-group-label">Te recomendamos</span>
          <h3 className="rlt-title">
            <Link href={`/titulo/${pick.type}/${pick.id}`}>{pick.title}</Link>
          </h3>
          {meta && <p className="rlt-meta">{meta}</p>}

          <div className="rlt-tags">
            {plataforma && <span className="rlt-tag rlt-tag-plat"><PlatformLogo code={plataforma} /></span>}
            {frase && <span className="rlt-tag">{frase}</span>}
          </div>
        </div>
      </div>

      <span className="chip-group-label">Por qué esta</span>
      <p className="rlt-razon">{pick.razon}</p>

      {/* El bloque PERO sólo existe si hay advertencia: viene NULL en ~27% de
          los casos por diseño, y preferimos que falte a inventarla. */}
      {pick.advertencia && (
        <div className="rlt-pero">
          <span className="rlt-pero-lab">⚠ Pero</span>
          <p>{pick.advertencia}</p>
        </div>
      )}

      <div className="rlt-acciones">
        {/* Va a la ficha dentro de la app, nunca afuera. Antes intentaba
            primero el `watchLink` de TMDB, que es su página agregadora y no la
            plataforma: mandaba al usuario fuera para nada. Mismo criterio que
            la ficha, ver el bloque `dprimary have` en DetailView. */}
        <a className="rlt-btn rlt-btn-primary" href={`/titulo/${pick.type}/${pick.id}`}>
          ▶ Verla
        </a>
        <button className="rlt-btn" onClick={onOtra}>Otra</button>
        <button className={`rlt-btn ${visto ? "on" : ""}`} onClick={toggleVisto} disabled={busy}>
          {visto ? "✓ Ya la viste" : "Ya la vi"}
        </button>
      </div>
    </div>
  );
}
