"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ES_NATIVO } from "@/lib/plataforma";
import { hrefTitulo } from "@/lib/rutas";
import { leerExtraAviso } from "@/lib/recordatorios";

/**
 * Tocar el aviso de un estreno abre SU ficha.
 *
 * ============================================================================
 * POR QUÉ VIVE EN EL LAYOUT Y NO EN LA FICHA
 * ============================================================================
 * El aviso llega días después de haberlo agendado, con la app cerrada o en
 * segundo plano. Quien lo recibe puede estar en cualquier pantalla, o en
 * ninguna: si el listener viviera en el componente que programó el aviso, no
 * habría nadie escuchando cuando el aviso llega. Va en la raíz, igual que
 * `AtrasNativo` y `NavHistorial`, que es el único lugar que siempre está.
 *
 * 🔴 EL `extra` SE VALIDA, NO SE CONFÍA. Es un dato que el sistema operativo
 * guardó durante días y que acá termina en una navegación. `leerExtraAviso`
 * exige `tipo` de `movie | tv` e `id` entero positivo; cualquier otra cosa se
 * descarta en silencio y la app queda donde estaba. Ver `lib/recordatorios.ts`.
 *
 * ⚠️ El listener se registra UNA vez (efecto con `[]`) y se remueve al
 * desmontar, como el de Atrás: dos listeners abrirían la ficha dos veces.
 *
 * Cubre los dos casos, y no hace falta código aparte para el segundo: con la app
 * abierta el plugin emite el evento en el momento, y arrancando desde el aviso
 * lo emite en cuanto hay alguien escuchando —por eso importa que el listener
 * quede puesto en el arranque y no al montar una pantalla.
 */
export default function AvisoNativo() {
  const router = useRouter();

  useEffect(() => {
    if (!ES_NATIVO) return;
    let quitar: (() => void) | null = null;
    let cancelado = false;

    (async () => {
      try {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        const h = await LocalNotifications.addListener("localNotificationActionPerformed", (accion) => {
          const extra = leerExtraAviso(accion?.notification?.extra);
          if (!extra) return;
          router.push(hrefTitulo(extra.tipo, extra.id));
        });
        if (cancelado) h.remove();
        else quitar = () => { h.remove(); };
      } catch {
        // Sin plugin no hay avisos que atender.
      }
    })();

    return () => { cancelado = true; quitar?.(); };
    // `router` es estable en el App Router; el listener se pone una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
