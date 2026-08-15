"use client";

// ¿Hay adónde volver DENTRO de la app?
//
// `router.back()` es un back del navegador: si la ficha se abrió desde un link
// compartido —WhatsApp, un mail, el buscador— la entrada anterior del historial
// no es nuestra, y "Volver" sacaba al usuario de la aplicación.
//
// No alcanza con mirar `history.length`: en una pestaña que ya venía usada, el
// largo es mayor que 1 aunque nuestra app sea la primera página. Lo que hay que
// saber es si hubo una navegación NUESTRA en este documento, y eso se responde
// comparando el largo del historial contra el que había cuando la app arrancó:
// cada Link del App Router hace un pushState y lo incrementa.
//
// `document.referrer` no sirve: no se actualiza en las navegaciones del cliente.
let inicial: number | null = null;

// La llama NavHistorial, montado en el layout, así que corre en la primera
// página que se abra — sea el Home o una ficha por deep link.
export function marcarArranque() {
  if (inicial === null && typeof window !== "undefined") inicial = window.history.length;
}

export function hayHistorialInterno(): boolean {
  if (typeof window === "undefined" || inicial === null) return false;
  return window.history.length > inicial;
}
