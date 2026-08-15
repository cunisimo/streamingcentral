"use client";
import { useEffect } from "react";
import { marcarArranque } from "./nav-historial";

// Anota el largo del historial al arrancar la app. Va en el layout para que
// corra en CUALQUIER primera página, incluida una ficha abierta por deep link:
// si se montara solo en el Home, una ficha compartida nunca tendría referencia
// y "Volver" no sabría si puede usar el back del navegador.
export default function NavHistorial() {
  useEffect(() => { marcarArranque(); }, []);
  return null;
}
