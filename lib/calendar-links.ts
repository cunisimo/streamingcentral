// Links para agendar un estreno. Hay DOS mecanismos y ninguno es universal:
//
//   - Google Calendar acepta una URL de plantilla y abre la pantalla de "crear
//     evento" ya completa. Es lo que espera casi todo Android y cualquiera con
//     cuenta de Gmail. NO se le puede pedir un recordatorio: Google aplica el
//     default del usuario.
//   - Apple Calendar y Outlook no tienen equivalente: se manejan con un archivo
//     .ics, que sí lleva la alarma de 24 h adentro.
//
// Por eso el botón ofrece las dos y no adivina. Un .ics bajado en escritorio se
// queda en la carpeta de Descargas sin hacer nada, y ese era el problema.

const soloDigitos = (iso: string) => iso.replace(/-/g, "");

function diaSiguiente(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Evento de día completo: `dates` va con el fin EXCLUSIVO, igual que el DTEND
// del .ics.
export function googleCalendarUrl(opts: {
  titulo: string;
  fecha: string; // ISO YYYY-MM-DD
  detalle: string;
}): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.titulo,
    dates: `${soloDigitos(opts.fecha)}/${soloDigitos(diaSiguiente(opts.fecha))}`,
    details: opts.detalle,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function icsUrl(tipo: string, id: number, plataforma?: string | null): string {
  return `/api/recordatorio?tipo=${tipo}&id=${id}${plataforma ? `&plataforma=${plataforma}` : ""}`;
}
