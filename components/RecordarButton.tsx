"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { googleCalendarUrl, icsUrl } from "@/lib/calendar-links";
import { platformByCode } from "@/lib/providers-ar";
import type { MediaType, PlatformCode } from "@/lib/types";

// "Recordarme": agenda el estreno en el calendario del usuario.
//
// Ofrece DOS caminos en vez de adivinar, porque no hay uno solo que sirva:
// Google Calendar se abre con una URL de plantilla (lo que espera Android y
// cualquiera con Gmail), y Apple Calendar / Outlook se manejan con un .ics.
// Bajar el .ics a secas en escritorio no hacía nada visible: quedaba en la
// carpeta de Descargas.
//
// Dos presentaciones de la MISMA acción:
//   - `icono` (default): sobre la card de Próximamente, sin texto.
//   - `texto`: en la ficha, junto a "Mi lista" y "Ya la vi".
export default function RecordarButton({
  id, tipo, titulo, fecha, plataforma, variant = "icono", solo = false,
}: {
  id: number;
  tipo: MediaType;
  titulo: string;
  fecha: string; // ISO YYYY-MM-DD del estreno
  plataforma?: PlatformCode | null;
  variant?: "icono" | "texto";
  // Sin el botón "+" al lado, sube al lugar de arriba en vez de dejar un hueco.
  solo?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const cerrar = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) cerrar(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(); };
    document.addEventListener("click", h);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", h); document.removeEventListener("keydown", esc); };
  }, [open, cerrar]);

  const nombrePlat = plataforma ? platformByCode(plataforma)?.name : null;
  const resumen = `${titulo} — estreno${nombrePlat ? ` en ${nombrePlat}` : ""}`;
  const google = googleCalendarUrl({
    titulo: resumen,
    fecha,
    detalle: "Te lo recordás desde Yump.",
  });
  const ics = icsUrl(tipo, id, plataforma);

  const ico = (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path d="M9 15.5l2 2 4-4" />
    </svg>
  );

  const menu = (
    <div className="panel panel-cal" onClick={(e) => e.stopPropagation()}>
      <h4>Agendar el estreno</h4>
      <a className="prow" href={google} target="_blank" rel="noreferrer" onClick={cerrar}>
        <div className="left">Google Calendar</div>
      </a>
      {/* El .ics lleva la alarma de 24 h adentro; Google usa el default del
          usuario, que no podemos fijar desde la URL. */}
      <a className="prow" href={ics} download onClick={cerrar}>
        <div className="left">Apple Calendar / Outlook</div>
      </a>
    </div>
  );

  if (variant === "texto") {
    return (
      <div className="act-wrap" ref={ref}>
        <button
          type="button" className="act" aria-expanded={open} aria-haspopup="menu"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        >
          {ico}<span className="lab">Recordarme</span>
        </button>
        {open && menu}
      </div>
    );
  }

  // En la card NO va menú: la tarjeta mide 158px y en el riel del Home vive
  // dentro de un contenedor con overflow-x, que recortaría el desplegable. Un
  // toque va derecho a Google Calendar, que es lo que espera la mayoría (todo
  // Android y cualquiera con Gmail). Quien use Apple Calendar u Outlook tiene
  // las dos opciones a un toque, en la ficha.
  return (
    <a
      className={`quick-add quick-cal${solo ? " solo" : ""}`}
      href={google}
      target="_blank"
      rel="noreferrer"
      aria-label="Agendar el estreno en Google Calendar"
      // La card entera es un <Link>: sin esto el click navega a la ficha.
      onClick={(e) => e.stopPropagation()}
    >
      {ico}
    </a>
  );
}
