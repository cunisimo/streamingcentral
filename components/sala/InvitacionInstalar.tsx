"use client";
import { useEffect, useState } from "react";
import { ES_NATIVO } from "@/lib/plataforma";
import { formaDeInvitacion, PLAY_PUBLICA, URL_PLAY, type FormaInvitacion } from "@/lib/sala/invitacion-instalar";

// La invitación a instalar Yump, al terminar una sala (decisión del dueño,
// 27/09).
//
// DÓNDE SE MONTA, Y POR QUÉ ALCANZA CON ESO: dentro de `PieResultado`, al final.
// Ese pie existe SÓLO en las tres pantallas de resultado final —match, empate ya
// resuelto y sin coincidencias—; el lobby, la votación y el empate SIN resolver
// no lo usan. Así que "nunca antes del resultado" no es una condición que haya
// que comprobar acá: es dónde vive el componente. Y al ir último queda debajo de
// "Cerrar sala" cuando hay ganadora y debajo de "Otra tanda" cuando no la hay.
//
// Es un BLOQUE del flujo, no una ventana flotante: sin `position: fixed`, sin
// overlay y sin botón de cerrar. No tapa nada ni interrumpe.
//
// La ve también un invitado sin cuenta: no mira la sesión.
//
// 🔴 NO PROMETE QUE LA SALA VUELVA. Instalar no reabre la partida recién jugada
// —la credencial del participante vive en el `localStorage` del navegador y no
// viaja a la app, y la ventana de resultado dura 5 minutos—, así que el texto
// habla de la próxima vez y de nada más.
//
// La decisión de qué mostrar está en `lib/sala/invitacion-instalar.ts`, que es
// puro y tiene pruebas de las seis combinaciones.
export default function InvitacionInstalar() {
  // El sistema y "ya está instalada" sólo se pueden leer en el navegador, así
  // que se decide después del montaje. Hasta entonces no se dibuja nada, que es
  // además lo correcto para el HTML del servidor: sin parpadeo ni desajuste de
  // hidratación.
  const [forma, setForma] = useState<FormaInvitacion>("nada");

  useEffect(() => {
    const instalada =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setForma(formaDeInvitacion({
      nativo: ES_NATIVO,
      instalada,
      ua: window.navigator.userAgent,
      playPublicada: PLAY_PUBLICA,
      puntosTactiles: window.navigator.maxTouchPoints,
      plataforma: window.navigator.platform,
    }));
  }, []);

  if (forma === "nada") return null;

  return (
    <section className="sala-instalar">
      {forma === "play" ? (
        <>
          <p className="sala-instalar-txt">
            <strong>Yump también es una app.</strong> Instalala y la próxima vez la tenés en tu pantalla de inicio.
          </p>
          <a className="rlt-btn" href={URL_PLAY} target="_blank" rel="noopener noreferrer">Ver en Google Play</a>
        </>
      ) : (
        <p className="sala-instalar-txt">
          <strong>Agregá Yump a tu pantalla de inicio.</strong> Tocá <span className="pwa-share" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M8 8l4-4 4 4" /><path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /></svg>
          </span> Compartir y después <b>Agregar a inicio</b>.
        </p>
      )}
    </section>
  );
}
