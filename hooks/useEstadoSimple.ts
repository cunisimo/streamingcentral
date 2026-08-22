"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  consumirVuelta, decidirRestauracionVista, guardarVista, olvidarLista,
  type EstadoVista,
} from "./lista-paginada-store";
import type { Fase } from "./useListaPaginada";

/**
 * Lo mismo que `useListaPaginada`, para las vistas que NO paginan.
 *
 * Traen todo de una y su estado es filtro + datos + scroll. Meterlas en el hook
 * paginado obligaría a inventarles una `pagina` y un `hayMas` que no tienen, y
 * esa mentira después hay que mantenerla. Comparten el almacén y la marca de
 * vuelta: un solo `popstate` para toda la app.
 *
 * `volvio` es el ticket. Si viene, el hook NO consume la marca: se la dio el
 * padre, que la consumió una sola vez para repartirla entre sus hijos (ver
 * ./ticket-vuelta). Si no viene, la consume él, que es el caso de las vistas
 * sin hijos.
 */
export function useEstadoSimple<D, E = unknown>(opts: {
  clave: string;
  firma: string;
  datos: D;
  extra?: E;
  // true cuando los datos ya están en el DOM. Igual que en el hook paginado:
  // devolver el scroll antes es scrollear un documento que todavía no creció.
  listo: boolean;
  // Si es `true`, no se guarda. Sin esto, el primer render —con la lista
  // vacía— pisa el snapshot justo antes de que alguien lo lea.
  vacio: boolean;
  // El ticket del padre. `undefined` = esta vista consume la marca por su cuenta.
  volvio?: boolean;
  // Se llama cuando la decisión ya se tomó, haya restaurado o no. Es como el
  // hijo cierra el ticket: el padre no lo apaga por tiempo ni por render.
  onDecidido?: () => void;
}): { fase: Fase; inicial: EstadoVista<D, E> | null; reiniciar: () => void } {
  const { clave, firma, datos, extra, listo, vacio, volvio, onDecidido } = opts;
  const ruta = usePathname();
  const [fase, setFase] = useState<Fase>("decidiendo");
  const [inicial, setInicial] = useState<EstadoVista<D, E> | null>(null);
  const scrollPendiente = useRef<number | null>(null);
  const decidido = useRef(false);
  // En un ref para que cambiar la identidad del callback no vuelva a decidir.
  const avisar = useRef(onDecidido);
  avisar.current = onDecidido;

  useEffect(() => {
    const vino = volvio ?? consumirVuelta(ruta);
    const e = decidirRestauracionVista<D, E>({ clave, firma, volvio: vino });
    if (e) { setInicial(e); scrollPendiente.current = e.scrollY; }
    decidido.current = true;
    setFase("listo");
    // El ticket se cierra ACÁ, con la decisión tomada, restaure o no. Si solo se
    // cerrara al restaurar, un snapshot inválido (otras plataformas) dejaría el
    // ticket abierto y el próximo hijo que montara lo reclamaría.
    avisar.current?.();
    // Sin `firma` ni `volvio` en las dependencias: la decisión se toma UNA vez
    // al montar. Un cambio de plataformas no vuelve a decidir, resetea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // El scroll, recién con contenido montado. El rAF doble es el mismo criterio
  // probado en `useListaPaginada`: con uno solo el navegador todavía no midió la
  // grilla y el scroll queda corto.
  useEffect(() => {
    if (!listo || scrollPendiente.current === null) return;
    const y = scrollPendiente.current;
    scrollPendiente.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [listo]);

  useEffect(() => {
    if (!decidido.current || fase !== "listo" || vacio) return;
    guardarVista<D, E>(clave, { firma, datos, extra, scrollY: window.scrollY });
  }, [clave, firma, datos, extra, fase, vacio]);

  // El scroll se guarda aparte y con rAF: serializar los datos en cada evento de
  // scroll sería decenas de veces por segundo.
  useEffect(() => {
    if (fase !== "listo" || vacio) return;
    let pendiente = false;
    const onScroll = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => {
        pendiente = false;
        guardarVista<D, E>(clave, { firma, datos, extra, scrollY: window.scrollY });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [clave, firma, datos, extra, fase, vacio]);

  const reiniciar = useCallback(() => {
    olvidarLista(clave);
    window.scrollTo(0, 0);
  }, [clave]);

  return { fase, inicial, reiniciar };
}
