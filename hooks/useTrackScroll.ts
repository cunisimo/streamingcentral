"use client";
import { useEffect, type RefObject } from "react";

// Recuerda la posición horizontal de un riel entre navegaciones.
//
// El scroll vertical lo restaura el navegador solo; el de un contenedor con
// overflow-x, no. Volver de una ficha te devolvía todos los rieles al principio
// y había que rehacer el camino hasta donde estabas.
//
// sessionStorage y no localStorage a propósito: es estado de una sesión de
// navegación, no una preferencia. Abrir la app al día siguiente tiene que
// empezar de cero, igual que el scroll vertical.
const KEY = "yump:track-scroll";

type Store = Record<string, number>;

function leer(): Store {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

export function useTrackScroll(clave: string | undefined, ref: RefObject<HTMLElement>, listo: boolean) {
  useEffect(() => {
    const el = ref.current;
    // `listo` es la condición clave: poner scrollLeft antes de que estén las
    // cards no hace nada (el contenedor todavía no tiene ancho que scrollear),
    // que es exactamente el bug que rompe la restauración vertical del Home.
    if (!clave || !el || !listo) return;

    const guardado = leer()[clave];
    if (guardado) el.scrollLeft = guardado;

    // Se guarda en el scroll con rAF en vez de en cada evento: el scroll
    // horizontal en touch dispara decenas de eventos por segundo y no hace
    // falta escribir en sessionStorage en cada uno.
    let pendiente = false;
    const onScroll = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        try {
          const store = leer();
          store[clave] = Math.round(el.scrollLeft);
          sessionStorage.setItem(KEY, JSON.stringify(store));
        } catch {
          /* sessionStorage lleno o bloqueado: no persiste, no rompe */
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [clave, ref, listo]);
}
