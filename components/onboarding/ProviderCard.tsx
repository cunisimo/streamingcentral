"use client";

export default function ProviderCard({ name, logo, selected, onToggle }:
  { name: string; logo: string | null; selected: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`ob-card ${selected ? "on" : ""}`} onClick={onToggle} aria-pressed={selected}>
      <span className="ob-card-logo">
        {logo ? <img src={logo} alt="" width={40} height={40} /> : <span className="ob-card-ph">{name.charAt(0)}</span>}
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
