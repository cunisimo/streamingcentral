// Una sola lectura para los títulos de una misma tanda.
//
// POR QUÉ. En frío, todos los títulos sin proveedores en Argentina de un bloque
// piden `disp:top-manual` a la vez: la clave todavía no está y cada uno la lee,
// consulta Supabase y la escribe. Es la misma evidencia para todos.
//
// Se crea POR TANDA, nunca a nivel de módulo: un valor a nivel de proceso mezclaría
// pedidos distintos, con sus señales y sus fallos. Si la lectura falla, ese fallo le
// llega a toda la tanda (cada título lo informa como siempre) y no se reintenta
// hasta el pedido siguiente.
export function lecturaCompartida<R>(leer: () => Promise<R>): () => Promise<R> {
  let enCurso: Promise<R> | null = null;
  return () => (enCurso ??= leer());
}
