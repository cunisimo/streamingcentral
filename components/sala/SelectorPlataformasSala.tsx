"use client";
import ProviderCard from "../onboarding/ProviderCard";
import { PLATFORMS } from "@/lib/providers-ar";
import type { PlatformCode } from "@/lib/types";

// Las plataformas con las que entrás a la sala. ESTADO LOCAL del formulario,
// nunca `set()` del contexto: elegir con qué entrar a una sala no cambia "mis
// plataformas" de la app.
//
// La lista sale de `PLATFORMS` (lib/providers-ar.ts), no de /api/providers: es
// exactamente el conjunto que la base acepta (`sala_codigos_permitidos`, que un
// test compara con ALL_CODES), ya viene en el orden del selector y no cuesta
// una petición.
export default function SelectorPlataformasSala({ value, onChange }:
  { value: PlatformCode[]; onChange: (codes: PlatformCode[]) => void }) {
  const toggle = (c: PlatformCode) =>
    onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <div className="ob-grid sala-plats" role="group" aria-label="Tus plataformas para esta sala">
      {PLATFORMS.map((p) => (
        <ProviderCard key={p.code} name={p.name} selected={value.includes(p.code)} onToggle={() => toggle(p.code)} />
      ))}
    </div>
  );
}
