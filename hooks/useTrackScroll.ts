"use client";
import { useEffect, type RefObject } from "react";
import { guardarPosicion, posicionDe } from "./track-scroll-store";

// Recuerda la posición horizontal de un riel entre navegaciones.
//
// El scroll vertical lo restaura el navegador solo; el de un contenedor con
// overflow-x, no. Volver de una ficha te devolvía todos los rieles al principio
// y había que rehacer el camino hasta donde estabas.
//
// El almacén vive en ./track-scroll-store, que es la parte con tests: un hook
// necesita un DOM que dispare scroll y ejecute rAF, y eso no existe en
// `node --test`.
//
// QUIÉN LO USA. Hasta el 18/08 solo `Shelf`, y por eso "6 para hoy" y
// "Próximamente" —que tienen su propio `.track` sin pasar por `Shelf`— volvían
// siempre al principio. Ahora los tres lo usan.
export { debeReiniciar, olvidarTrack } from "./track-scroll-store";

export function useTrackScroll(clave: string | undefined, ref: RefObject<HTMLElement>, listo: boolean) {
  useEffect(() => {
    const el = ref.current;
    // `listo` es la condición clave: poner scrollLeft antes de que estén las
    // cards no hace nada (el contenedor todavía no tiene ancho que scrollear),
    // que es exactamente el bug que rompe la restauración vertical del Home.
    if (!clave || !el || !listo) return;

    // SIEMPRE se asigna, aunque no haya nada guardado — `posicionDe` devuelve 0.
    // Ver el comentario largo en track-scroll-store.ts.
    el.scrollLeft = posicionDe(clave);

    // Se guarda en el scroll con rAF en vez de en cada evento: el scroll
    // horizontal en touch dispara decenas de eventos por segundo y no hace
    // falta escribir en sessionStorage en cada uno.
    let pendiente = false;
    const onScroll = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        guardarPosicion(clave, el.scrollLeft);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [clave, ref, listo]);
}
