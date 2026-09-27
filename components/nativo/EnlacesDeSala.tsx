"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ES_NATIVO } from "@/lib/plataforma";
import { rutaDeEnlace } from "@/lib/sala/enlace-nativo";

/**
 * Los enlaces de invitación que llegan desde afuera (WhatsApp, correo, un chat).
 *
 * ============================================================================
 * 🔴 HACEN FALTA LOS DOS CAMINOS, Y ESE ES EL PUNTO DE ESTE COMPONENTE
 * ============================================================================
 * `appUrlOpen` sólo se dispara cuando la app YA está viva y el sistema le manda
 * un intent nuevo: es el caso de "la app estaba en segundo plano". Con la app
 * CERRADA, el intent viene en el arranque y ese evento no se emite nunca —el
 * listener se registra después—, así que hay que preguntarlo con
 * `getLaunchUrl()`. Atender uno solo deja la mitad de los casos sin abrir la
 * sala, y es justo la mitad que no se nota probando con la app abierta.
 *
 * El intent-filter del manifest está acotado a `https://app.yump.ar/sala/*`, así
 * que el sistema no manda acá la navegación del resto del sitio. Igual se
 * vuelve a validar con `rutaDeEnlace`, que es lista blanca: un intent puede
 * traer cualquier cosa y esto no es un saneador de urls.
 *
 * ⚠️ `router.replace`, no `push`: la sala es el destino del enlace, no un paso
 * adelante desde donde estaba la app. Con `push`, Atrás volvería a la pantalla
 * que el usuario no pidió.
 *
 * Todo detrás de `ES_NATIVO` —bandera de BUILD— y con import dinámico, así que
 * `@capacitor/app` no entra en el bundle web y en la web esto no hace nada.
 */
export default function EnlacesDeSala() {
  const router = useRouter();

  useEffect(() => {
    if (!ES_NATIVO) return;
    let quitar: (() => void) | null = null;
    let cancelado = false;

    const ir = (url: string | null | undefined) => {
      const ruta = url ? rutaDeEnlace(url) : null;
      if (ruta) router.replace(ruta);
    };

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        // 1. App cerrada: el intent ya estaba cuando arrancamos.
        ir((await App.getLaunchUrl())?.url);
        // 2. App viva en segundo plano: llega como evento.
        const h = await App.addListener("appUrlOpen", ({ url }) => ir(url));
        if (cancelado) h.remove();
        else quitar = () => { h.remove(); };
      } catch {
        // Sin plugin, el enlace simplemente no abre la sala; nada se rompe.
      }
    })();

    return () => { cancelado = true; quitar?.(); };
  }, [router]);

  return null;
}
