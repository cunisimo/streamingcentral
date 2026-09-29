"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ES_NATIVO } from "@/lib/plataforma";
import { atenderEnlaces } from "@/lib/enlaces-app";

/**
 * Los enlaces públicos que llegan desde afuera (WhatsApp, correo, un chat) y
 * que Android le entrega a la app: invitaciones a una sala (`/sala/<uuid>`) y,
 * desde el 28/09, fichas (`/titulo/movie|tv/<id>`, el enlace que comparte un
 * match). Se llamaba `EnlacesDeSala`; el nombre dejó de describirlo.
 *
 * ============================================================================
 * 🔴 HACEN FALTA LOS DOS CAMINOS, Y ESE ES EL PUNTO DE ESTE COMPONENTE
 * ============================================================================
 * `appUrlOpen` sólo se dispara cuando la app YA está viva y el sistema le manda
 * un intent nuevo: es el caso de "la app estaba en segundo plano". Con la app
 * CERRADA, el intent viene en el arranque y ese evento no se emite nunca —el
 * listener se registra después—, así que hay que preguntarlo con
 * `getLaunchUrl()`. Atender uno solo deja la mitad de los casos sin abrir el
 * enlace, y es justo la mitad que no se nota probando con la app abierta.
 *
 * Los intent-filters del manifest están acotados a `/sala/`, `/titulo/movie/`
 * y `/titulo/tv/` de `https://app.yump.ar`, así que el sistema no manda acá
 * la navegación del resto del sitio. Igual se vuelve a validar con
 * `rutaDeEnlace` (lib/enlaces-app.ts), que es lista blanca: un intent puede
 * traer cualquier cosa y esto no es un saneador de urls.
 *
 * ⚠️ `router.replace`, no `push`: la sala o la ficha es el destino del enlace, no un paso
 * adelante desde donde estaba la app. Con `push`, Atrás volvería a la pantalla
 * que el usuario no pidió.
 *
 * Todo detrás de `ES_NATIVO` —bandera de BUILD— y con import dinámico, así que
 * `@capacitor/app` no entra en el bundle web y en la web esto no hace nada.
 */
export default function EnlacesEntrantes() {
  const router = useRouter();

  useEffect(() => {
    if (!ES_NATIVO) return;
    let quitar: (() => void) | null = null;
    let cancelado = false;

    // La lógica —los dos caminos (App.getLaunchUrl() para la app cerrada y
    // addListener("appUrlOpen") para la app en segundo plano), la lista blanca
    // y la limpieza— vive en `atenderEnlaces` (lib/enlaces-app.ts), probada con
    // un plugin simulado. Acá sólo se carga el plugin real y se navega con
    // router.replace(ruta).
    import("@capacitor/app")
      .then(({ App }) => {
        if (cancelado) return;
        quitar = atenderEnlaces(App, (ruta) => router.replace(ruta));
      })
      .catch(() => { /* sin plugin: el enlace no se abre adentro, nada se rompe */ });

    return () => { cancelado = true; quitar?.(); };
  }, [router]);

  return null;
}
