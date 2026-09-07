"use client";
import { useEffect } from "react";
import { ES_NATIVO } from "@/lib/plataforma";

/**
 * El botón Atrás físico de Android.
 *
 * ============================================================================
 * EL PROBLEMA QUE ARREGLA, MEDIDO EN CP8
 * ============================================================================
 * Sin esto, Atrás **sale al launcher** aunque haya historial interno. Verificado
 * en un motorola edge 60: Home → `/top/` con `history.length: 2`, y Atrás
 * mandaba al launcher en vez de volver al Home. Es el comportamiento por defecto
 * del contenedor cuando nadie escucha el evento.
 *
 * 🔴 EN LA RAÍZ SE SALE, Y ES LA DECISIÓN DELIBERADA. `canGoBack: false` sólo
 * pasa cuando no queda historial dentro de la app, y ahí lo que un usuario de
 * Android espera es salir — no quedarse encerrado en una pantalla sin salida.
 * `exitApp()` es lo mismo que hace el sistema por defecto; la diferencia es que
 * ahora sólo ocurre ahí.
 *
 * ⚠️ El listener se registra UNA vez (efecto con `[]`) y se remueve al
 * desmontar. Sin eso, cada remontaje sumaría uno y un solo toque de Atrás
 * dispararía varios `history.back()`.
 *
 * El import es dinámico y va detrás de `ES_NATIVO` —bandera de BUILD, no
 * detección en runtime— así que el plugin no entra en el bundle web y este
 * componente no hace nada allá.
 */
export default function AtrasNativo() {
  useEffect(() => {
    if (!ES_NATIVO) return;
    let quitar: (() => void) | null = null;
    let cancelado = false;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const h = await App.addListener("backButton", ({ canGoBack }) => {
          // 🔴 `canGoBack` NO ALCANZA, Y ESTO ESTÁ MEDIDO.
          //
          // Viene de `WebView.canGoBack()` (Java), que mira el historial de
          // DOCUMENTOS de la WebView. El router de Next navega con `pushState`,
          // así que desde una ficha —Home → `/t/?tipo=movie&id=16237`, con
          // `history.length: 2`— el plugin igual reporta `canGoBack: false`.
          // Confiar sólo en él hacía que Atrás saliera al launcher: el bug que
          // CP8 midió, reproducido por otra causa.
          //
          // Se usa la ruta como segunda señal. En el contenedor la app SIEMPRE
          // arranca en `/` —una URL directa a otra ruta cae en la Home, ver el
          // hallazgo #16 de CP8—, así que estar fuera de `/` significa que hubo
          // una navegación interna y hay a dónde volver.
          if (canGoBack || window.location.pathname !== "/") window.history.back();
          else App.exitApp();
        });
        // Si el componente se desmontó mientras se resolvía el import, el
        // listener ya no tiene dueño: se remueve en el acto.
        if (cancelado) h.remove();
        else quitar = () => { h.remove(); };
      } catch {
        // Sin plugin, el contenedor vuelve al comportamiento anterior.
      }
    })();

    return () => { cancelado = true; quitar?.(); };
  }, []);

  return null;
}
