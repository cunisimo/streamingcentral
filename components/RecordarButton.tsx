"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { googleCalendarUrl, icsUrl } from "@/lib/calendar-links";
import { platformByCode } from "@/lib/providers-ar";
import type { MediaType, PlatformCode } from "@/lib/types";
import { apiUrl } from "@/lib/api-base";
import { ES_NATIVO } from "@/lib/plataforma";
import {
  CANAL_ESTRENOS, extraDeAviso, idRecordatorio, momentoDeAviso, textoDeAviso,
} from "@/lib/recordatorios";

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
  const [error, setError] = useState<string | null>(null);
  const [bajando, setBajando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ==========================================================================
  // EL AVISO DE ESTRENO EN ANDROID
  // ==========================================================================
  // En la web esto no existe: sigue el menú de Google Calendar / .ics de
  // siempre, y este estado nunca sale de "no".
  //
  //   no        se puede agendar
  //   listo     hay un aviso pendiente; el toque siguiente lo cancela
  //   hoy       el estreno es hoy y las 10:00 ya pasaron
  //   denegado  el usuario dijo que no a las notificaciones
  const [aviso, setAviso] = useState<"no" | "listo" | "hoy" | "denegado">("no");
  const [ocupado, setOcupado] = useState(false);
  const idAviso = idRecordatorio(tipo, id);

  // Al montar —y al cambiar de título— se pregunta por los pendientes. Sin esto
  // el botón mostraría "Recordarme" sobre un aviso ya programado, y el toque
  // siguiente intentaría programarlo de nuevo en vez de cancelarlo.
  useEffect(() => {
    if (!ES_NATIVO || idAviso === null) return;
    let vivo = true;
    (async () => {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        const { notifications } = await LocalNotifications.getPending();
        if (vivo) setAviso(notifications.some((n) => n.id === idAviso) ? "listo" : "no");
      } catch { /* sin plugin, queda el camino de Google Calendar */ }
    })();
    return () => { vivo = false; };
  }, [idAviso]);

  // 🔴 EL PERMISO SE PIDE ACÁ ADENTRO Y EN NINGÚN OTRO LADO: sólo después de que
  // el usuario tocó "Recordarme". Pedirlo al arrancar la app es la forma más
  // rápida de que lo rechacen para siempre.
  const alternarAviso = async () => {
    if (ocupado || idAviso === null) return;
    setOcupado(true);
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");

      if (aviso === "listo") {
        await LocalNotifications.cancel({ notifications: [{ id: idAviso }] });
        setAviso("no");
        return;
      }

      // Antes que el permiso: si el aviso no tiene futuro, no hay nada que pedir.
      const cuando = momentoDeAviso(fecha);
      if (cuando.estado !== "programable") {
        setAviso(cuando.estado === "hoy-tarde" ? "hoy" : "denegado");
        return;
      }

      let permiso = (await LocalNotifications.checkPermissions()).display;
      if (permiso !== "granted") permiso = (await LocalNotifications.requestPermissions()).display;
      if (permiso !== "granted") { setAviso("denegado"); return; }

      // Un canal por si el sistema es Android 8+. Sonido por defecto: no se sube
      // ningún audio al APK.
      try { await LocalNotifications.createChannel(CANAL_ESTRENOS); } catch { /* < Android 8 */ }

      await LocalNotifications.schedule({
        notifications: [{
          id: idAviso,
          title: "Yump",
          body: textoDeAviso(titulo, nombrePlat),
          schedule: {
            at: cuando.at,
            // 🔴 NO se usa alarma exacta. El permiso `SCHEDULE_EXACT_ALARM` es
            // sensible, está sacado del manifest, y con el valor por defecto
            // (`true`) el plugin abriría la pantalla de "Alarmas y recordatorios"
            // del sistema en Android 12+. Unos minutos de diferencia en un aviso
            // de estreno no cambian nada.
            allowWhileIdle: false,
          },
          channelId: CANAL_ESTRENOS.id,
          smallIcon: "ic_stat_yump",
          extra: extraDeAviso(tipo, id),
          isExactNotification: false,
        }],
      });
      setAviso("listo");
    } catch {
      // El plugin puede no estar (web) o fallar: queda Google Calendar.
      setAviso("denegado");
    } finally {
      setOcupado(false);
    }
  };

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
  // `apiUrl` se aplica UNA vez, acá, y no en cada uso. `ics` alimenta tres
  // cosas —el `fetch` de validación, el `window.location.href` de la descarga y
  // el `href` del `<a>`— y las tres apuntan al MISMO recurso: dejar una relativa
  // y otra absoluta sería incoherente, y en el contenedor la navegación
  // resolvería contra el bundle local, que no tiene `/api`.
  //
  // En la web `apiUrl` devuelve la ruta intacta, así que acá no cambia nada.
  //
  // ⚠️ Que la URL sea correcta NO alcanza para el contenedor: además hay que
  // abrirla fuera del WebView. Eso es trabajo de CP9 (`@capacitor/browser`), no
  // de CP3.
  const ics = apiUrl(icsUrl(tipo, id, plataforma));

  // El .ics NO se arma como blob en el cliente: en iOS un `blob:` con contenido
  // de calendario abre de forma inconsistente, y por eso existe la ruta (ver su
  // comentario). Pero un `<a download>` no puede enterarse de un 404: el
  // navegador se bajaba el JSON del error como si fuera el archivo, sin un solo
  // aviso. Así que se pide primero y recién si la respuesta sirve se navega —
  // la descarga la sigue haciendo el navegador contra la misma URL, con su
  // Content-Type, que es lo que iOS necesita.
  //
  // Son dos requests para un archivo de medio kilobyte. Es el precio de poder
  // avisar cuando algo falla.
  const bajarIcs = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setBajando(true);
    try {
      const r = await fetch(ics);
      if (!r.ok) {
        setError(r.status === 404
          ? "Todavía no hay una fecha confirmada para este título."
          : "No pudimos armar el recordatorio. Probá de nuevo en un rato.");
        return;
      }
      window.location.href = ics;
      cerrar();
    } catch {
      setError("No pudimos armar el recordatorio. Revisá tu conexión.");
    } finally {
      setBajando(false);
    }
  };

  const ico = (
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path d="M9 15.5l2 2 4-4" />
    </svg>
  );

  // El mismo calendario, con el tilde ya marcado: es el estado del contrato de
  // la ficha (`.act.on`), no un ícono nuevo.
  const icoListo = (
    <svg className="chk" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path d="M8.5 15.5l2.5 2.5 4.5-4.5" />
    </svg>
  );

  const menu = (
    <div className="panel panel-cal" onClick={(e) => e.stopPropagation()}>
      <h4>Agendar el estreno</h4>
      <a className="prow" href={google} target="_blank" rel="noreferrer" onClick={cerrar}>
        <div className="left">Google Calendar</div>
      </a>
      {/* El .ics lleva la alarma de 24 h adentro; Google usa el default del
          usuario, que no podemos fijar desde la URL. Sigue siendo un <a> con la
          URL real —así el menú contextual y "abrir en pestaña nueva" funcionan—
          pero el click pasa por `bajarIcs`, que chequea antes de navegar. */}
      {/* 🔴 EN EL CONTENEDOR ESTA FILA NO EXISTE, y no llega a mostrarse nunca
          porque en nativo ni siquiera se arma este menú (ver abajo). Queda
          igualmente detrás de la bandera para que sea imposible ofrecerla desde
          acá por accidente. Medido el 2026-09-06: el `.ics` termina abriendo
          Chrome y dejando el archivo en Descargas. */}
      {!ES_NATIVO && (
        <a className="prow" href={ics} onClick={bajarIcs} aria-busy={bajando}>
          <div className="left">{bajando ? "Preparando…" : "Apple Calendar / Outlook"}</div>
        </a>
      )}
      {error && <p className="panel-hint err" role="alert">{error}</p>}
    </div>
  );

  if (variant === "texto") {
    // 🔴 EN EL CONTENEDOR NO HAY MENÚ: el botón va derecho a Google Calendar.
    //
    // Con una sola opción, un desplegable de una fila es peor que el enlace. Y
    // la otra opción no se puede ofrecer: medido el 2026-09-06 en el teléfono,
    // el `.ics` no lo abre la WebView —Android le pasa la URL a Chrome, que la
    // baja a Descargas—, así que el usuario sale de Yump, pasa por un tercer
    // programa y termina con un archivo que tiene que buscar y abrir a mano.
    //
    // Es el MISMO `google` que usa la web: misma fecha, mismo `resumen`, mismo
    // `googleCalendarUrl`. Acá no se arma ninguna URL nueva — si se armara,
    // la fecha que se agenda podría separarse de la que habilita el botón.
    //
    // Abre la pantalla de "crear evento" ya completa: **no guarda nada solo**,
    // la decisión final sigue siendo del usuario. Y al volver, Yump sigue en la
    // ficha (CP8 #2: un enlace externo no secuestra la WebView).
    // 🔴 EN EL CONTENEDOR EL BOTÓN PROGRAMA UN AVISO LOCAL, no abre el
    // calendario. Un recordatorio que vive en el teléfono no depende de que el
    // usuario tenga cuenta de Google ni de que salga de la app, y al tocarlo
    // vuelve a la ficha exacta.
    //
    // Google Calendar sigue existiendo, pero como SALIDA: se ofrece —sin
    // abrirlo— cuando el usuario rechazó las notificaciones. Ahí es lo único
    // que queda, y abrirlo solo sería decidir por él dos veces seguidas.
    if (ES_NATIVO) {
      if (aviso === "denegado") {
        return (
          <a
            className="act" href={google} target="_blank" rel="noreferrer"
            aria-label="Agendar el estreno en Google Calendar"
            onClick={(e) => e.stopPropagation()}
          >
            {ico}<span className="lab">Agendar en Google Calendar</span>
          </a>
        );
      }
      return (
        <button
          type="button" className={`act ${aviso === "listo" ? "on" : ""}`}
          disabled={ocupado}
          aria-pressed={aviso === "listo"}
          aria-label={aviso === "listo" ? "Cancelar el recordatorio" : "Recordarme este estreno"}
          onClick={(e) => { e.stopPropagation(); void alternarAviso(); }}
        >
          {aviso === "listo" ? icoListo : ico}
          <span className="lab">
            {aviso === "listo" ? "Recordatorio listo" : aviso === "hoy" ? "Este estreno es hoy" : "Recordarme"}
          </span>
        </button>
      );
    }

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
