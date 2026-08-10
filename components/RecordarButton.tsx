"use client";
import type { MediaType, PlatformCode } from "@/lib/types";

// "Recordarme": baja un .ics y el calendario del usuario se encarga del aviso.
// Dos presentaciones de la MISMA acción:
//   - `icono` (default): sobre la card de Próximamente, sin texto.
//   - `texto`: en la ficha, junto a "Mi lista" y "Ya la vi".
//
// No es un <button> con fetch: es un <a> directo a la ruta que sirve el archivo.
// En iOS eso es lo que hace que Safari lo mande a la app Calendario en vez de
// abrirlo como texto. Por lo mismo NO lleva target="_blank": abrir en pestaña
// nueva deja una pestaña en blanco colgada después de la descarga.
export default function RecordarButton({
  id, tipo, plataforma, variant = "icono", solo = false,
}: {
  id: number;
  tipo: MediaType;
  plataforma?: PlatformCode | null;
  variant?: "icono" | "texto";
  // Sin el botón "+" al lado, sube al lugar de arriba en vez de dejar un hueco.
  solo?: boolean;
}) {
  const href = `/api/recordatorio?tipo=${tipo}&id=${id}`
    + (plataforma ? `&plataforma=${plataforma}` : "");

  // Calendario con tilde adentro: dice "agendar", no "ver fechas".
  const ico = (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path d="M9 15.5l2 2 4-4" />
    </svg>
  );

  if (variant === "texto") {
    return (
      <a className="act" href={href} download aria-label="Recordarme este estreno">
        {ico}<span className="lab">Recordarme</span>
      </a>
    );
  }
  return (
    <a
      className={`quick-add quick-cal${solo ? " solo" : ""}`}
      href={href}
      download
      aria-label="Recordarme este estreno"
      // La card entera es un <Link>; sin esto el click navega a la ficha en vez
      // de bajar el archivo.
      onClick={(e) => e.stopPropagation()}
    >
      {ico}
    </a>
  );
}
