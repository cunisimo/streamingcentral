"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  consumirVuelta, decidirRestauracion, guardarLista, olvidarLista,
  type EstadoLista,
} from "./lista-paginada-store";

export { olvidarLista } from "./lista-paginada-store";

// El listener de `popstate` se MUDÓ a ./lista-paginada-store.
//
// Estaba acá y era un bug latente que apareció al usar el mecanismo en más
// vistas: `CategoryView` no importa este hook —usa el store directo—, así que en
// /categoria el listener nunca se registraba y la marca nunca se escribía. La
// restauración fallaba en silencio y parecía un problema de la vista.
//
// En el store, cualquiera que use el mecanismo lo arrastra por importarlo.

export type Fase = "decidiendo" | "listo";

/**
 * Estado paginado que sobrevive a ir a una ficha y volver.
 *
 * Restaura los títulos ya cargados, la página en la que iba y la posición
 * vertical — pero SOLO al volver con atrás/adelante. Entrar por un link, o
 * cambiar de plataformas, empieza arriba y con la lista limpia.
 *
 * `fase` es lo que evita la doble carga: la decisión de restaurar se toma en un
 * efecto (leer sessionStorage durante el render sería un mismatch de
 * hidratación — mismo motivo que en IndecisoHero), así que la vista tiene que
 * esperar a "listo" antes de pedir la página 1. Sin eso, se dispararía un fetch
 * que después quedaría pisado por lo restaurado: dos cargas y un parpadeo.
 */
export function useListaPaginada<T, E = unknown>(opts: {
  // Identifica la vista. Ej: "lista:miniseries", "lista:ultimos".
  clave: string;
  // Lo que invalida lo guardado: plataformas, tipo activo, query de búsqueda.
  firma: string;
  // El estado vivo de la vista, para persistirlo.
  items: T[];
  pagina: number;
  hayMas: boolean;
  // Estado propio de la vista que también tiene que volver (ver `EstadoLista`).
  extra?: E;
  // true cuando los items ya están en el DOM. Es la condición para devolver el
  // scroll: ponerlo antes, con la página todavía corta, no scrollea a ningún
  // lado — la misma lección que `listo` en useTrackScroll.
  listo: boolean;
}): { fase: Fase; inicial: EstadoLista<T, E> | null; reiniciar: () => void } {
  const { clave, firma, items, pagina, hayMas, extra, listo } = opts;
  const ruta = usePathname();
  const [fase, setFase] = useState<Fase>("decidiendo");
  const [inicial, setInicial] = useState<EstadoLista<T, E> | null>(null);
  const scrollPendiente = useRef<number | null>(null);
  const restaurado = useRef(false);

  // Decisión: restaurar o empezar limpio. Una sola vez, al montar.
  useEffect(() => {
    const e = decidirRestauracion<T, E>({ clave, firma, volvio: consumirVuelta(ruta) });
    if (e) { setInicial(e); scrollPendiente.current = e.scrollY; }
    restaurado.current = true;
    setFase("listo");
    // Sin `firma` en las dependencias A PROPÓSITO: un cambio de plataformas no
    // tiene que volver a decidir una restauración, tiene que resetear la vista.
    // De eso se encarga la vista, que ya recarga desde la página 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // Devolver la posición vertical, una sola vez y recién cuando hay contenido
  // que scrollear. El rAF doble no es superstición: con uno solo el navegador
  // todavía no midió el alto de la grilla y el scroll queda corto.
  useEffect(() => {
    if (!listo || scrollPendiente.current === null) return;
    const y = scrollPendiente.current;
    scrollPendiente.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [listo]);

  // Persistir. No escribe hasta haber decidido: el primer render trae el estado
  // vacío y pisaría lo guardado justo antes de leerlo.
  useEffect(() => {
    if (!restaurado.current || fase !== "listo") return;
    if (!items.length) return;
    guardarLista<T, E>(clave, { firma, items, pagina, hayMas, extra, scrollY: window.scrollY });
  }, [clave, firma, items, pagina, hayMas, extra, fase]);

  // El scroll se guarda aparte y con rAF: el evento dispara decenas de veces por
  // segundo y no hace falta serializar la lista entera en cada uno. Por eso lee
  // lo guardado y solo le cambia el `scrollY`.
  useEffect(() => {
    if (fase !== "listo") return;
    let pendiente = false;
    const onScroll = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        if (!items.length) return;
        guardarLista<T, E>(clave, { firma, items, pagina, hayMas, extra, scrollY: window.scrollY });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [clave, firma, items, pagina, hayMas, extra, fase]);

  // Empezar limpio es DOS cosas, y la segunda se olvida siempre: tirar lo
  // guardado y volver arriba. Sin el scroll, cambiar de plataformas (o de tipo
  // en "Últimos lanzamientos") recargaba la lista desde la página 1 pero dejaba
  // al usuario a 700 px de altura, mirando el medio de una lista que acababa de
  // cambiar debajo suyo. Va en el hook y no en cada vista justamente para que no
  // se pueda olvidar en la próxima.
  //
  // En el primer montaje es un no-op (la página ya está en 0), así que no hace
  // falta distinguir el caso.
  const reiniciar = useCallback(() => {
    olvidarLista(clave);
    window.scrollTo(0, 0);
  }, [clave]);

  return { fase, inicial, reiniciar };
}
