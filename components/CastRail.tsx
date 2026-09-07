"use client";
import Link from "next/link";
import type { UICastMember } from "@/lib/types";
import { hrefPersona } from "@/lib/rutas";

// Riel horizontal de reparto tipo TMDB: foto + nombre + personaje, cada uno
// linkeando a la ficha de la persona. Sin loading="lazy" a propósito: son pocas
// fotos chicas y el lazy dejó imágenes sin cargar en otros rieles/modales.
export default function CastRail({ cast }: { cast: UICastMember[] }) {
  if (!cast.length) return null;
  return (
    <div className="cast-sec">
      <div className="dsec-h">Reparto</div>
      <div className="cast-rail">
        {cast.map((c) => (
          <Link key={c.id} href={hrefPersona(c.id)} className="cast-card">
            {c.profile
              ? <img className="cast-photo" src={c.profile} alt="" width={80} height={80} />
              : <span className="cast-photo cast-ph" aria-hidden>{c.name.charAt(0)}</span>}
            <span className="cast-name">{c.name}</span>
            {c.character && <span className="cast-char">{c.character}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
