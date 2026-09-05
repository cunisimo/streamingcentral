"use client";
import { useEffect } from "react";
import { marcarArranque } from "./nav-historial";
import { registrarVueltaAtras } from "@/hooks/lista-paginada-store";

// 🔴 EN EL SCOPE DEL MÓDULO, NO EN UN EFECTO, y no es un detalle de estilo. El
// listener de `popstate` que marca las vueltas atrás tiene que quedar registrado
// ANTES que el de `AppRouter` de Next, que se registra en un efecto de arranque
// y que —adentro de su propio handler— monta la ruta restaurada. Si el nuestro
// llega después, la vista pregunta "¿volví?" antes de que la marca exista y la
// restauración se pierde. Medido y explicado en `hooks/lista-paginada-store.ts`.
//
// Este componente vive en el layout raíz, así que su módulo se evalúa al arrancar
// la app, en cualquier primera página.
registrarVueltaAtras();

// Anota el largo del historial al arrancar la app. Va en el layout para que
// corra en CUALQUIER primera página, incluida una ficha abierta por deep link:
// si se montara solo en el Home, una ficha compartida nunca tendría referencia
// y "Volver" no sabría si puede usar el back del navegador.
export default function NavHistorial() {
  useEffect(() => { marcarArranque(); }, []);
  return null;
}
