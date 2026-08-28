"use client";

// Una plataforma en el onboarding.
//
// ⚠️ ACÁ SE MOSTRABA EL LOGO REAL DE LA PLATAFORMA, servido desde
// `image.tmdb.org` con el `logo_path` de TMDB. Es el mismo problema que los
// wordmarks imitados, y en algún sentido peor: no era una imitación, era la
// marca registrada tal cual, traída de un tercero y puesta en la pantalla que
// abre todo el mundo la primera vez.
//
// Ahora es **la inicial y el nombre, con la tipografía de Yump**. Se ve peor y
// se decidió igual (ver `docs/PLAY-STORE.md` §0.a y §6): usar el logo de TMDB
// como reemplazo de los wordmarks era cambiar de fuente, no de problema.
export default function ProviderCard({ name, selected, onToggle }:
  { name: string; selected: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`ob-card ${selected ? "on" : ""}`} onClick={onToggle} aria-pressed={selected}>
      <span className="ob-card-logo" aria-hidden="true">
        <span className="ob-card-ph">{name.charAt(0)}</span>
      </span>
      <span className="ob-card-name">{name}</span>
      {selected && (
        <span className="ob-card-check">
          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </span>
      )}
    </button>
  );
}
