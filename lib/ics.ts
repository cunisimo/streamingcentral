// Generador de archivos .ics (iCalendar, RFC 5545) para el botón "Recordarme".
//
// Por qué un archivo y no una notificación push: el push web en iOS exige la app
// instalada en la pantalla de inicio y iOS 16.4+, y desde una pestaña de Safari
// ni siquiera se puede pedir permiso. El .ics funciona igual en iPhone, Android
// y escritorio, sin permisos, sin login y sin backend que dispare nada — el
// recordatorio lo maneja el calendario del usuario. Cuando la app sea nativa y
// el push pase por APNs/FCM, esto se puede reemplazar sin tocar la UI.

// Escapa los caracteres que el formato usa como separadores. Sin esto, un
// título con coma parte el valor en dos y el evento entra mal (o no entra).
function esc(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// El RFC obliga a cortar las líneas a 75 octetos, continuando con un espacio al
// principio de la siguiente. Un título largo sin plegar hace que algunos
// calendarios (Outlook entre ellos) descarten el evento entero.
function fold(linea: string): string {
  if (linea.length <= 75) return linea;
  const partes: string[] = [linea.slice(0, 75)];
  let resto = linea.slice(75);
  while (resto.length > 74) {
    partes.push(" " + resto.slice(0, 74));
    resto = resto.slice(74);
  }
  if (resto) partes.push(" " + resto);
  return partes.join("\r\n");
}

const soloDigitos = (iso: string) => iso.replace(/-/g, "");

// Día siguiente en ISO. Un evento de día completo se declara con DTEND en el
// día POSTERIOR: el rango es semiabierto, así que sin esto el evento no ocupa
// ningún día y varios calendarios directamente no lo muestran.
function diaSiguiente(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface EventoRecordatorio {
  uid: string;
  fecha: string;      // ISO YYYY-MM-DD, día del estreno
  titulo: string;
  descripcion: string;
  url: string;
}

export function buildIcs(e: EventoRecordatorio): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Yump//Recordatorio//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${stamp}`,
    // Evento de día completo: el estreno queda marcado en el día, y la alarma
    // de abajo es la que avisa la víspera.
    `DTSTART;VALUE=DATE:${soloDigitos(e.fecha)}`,
    `DTEND;VALUE=DATE:${soloDigitos(diaSiguiente(e.fecha))}`,
    `SUMMARY:${esc(e.titulo)}`,
    `DESCRIPTION:${esc(e.descripcion)}`,
    `URL:${esc(e.url)}`,
    "TRANSP:TRANSPARENT",
    "BEGIN:VALARM",
    // 24 h antes del comienzo del día del estreno.
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(e.titulo)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // CRLF obligatorio por el RFC: con \n solo, Outlook y el calendario de iOS
  // rechazan el archivo.
  return lineas.map(fold).join("\r\n") + "\r\n";
}
