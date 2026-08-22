// Cuándo se asentó una categoría, para poder devolverle el scroll.
//
// `/categoria/[slug]` no es una lista paginada: son N rieles que cargan cada uno
// por su cuenta. Restaurar el scroll apenas termina el primero es incorrecto —
// los que faltan siguen cambiando la altura de la página, así que el scroll
// aterriza en un documento que todavía va a crecer y queda en cualquier lado.
// Y un timeout fijo es adivinar: con red lenta se queda corto y con red rápida
// hace esperar de gusto.
//
// Un riel VACÍO o FALLIDO también termina: lo que importa no es que haya
// contenido, sino que ya no vaya a cambiar de alto.
//
// LAS GENERACIONES. Al tocar Películas/Series arranca una tanda nueva de rieles.
// Los de la tanda anterior pueden seguir respondiendo —un fetch en vuelo no se
// cancela— y sus avisos llegarían tarde, sumando al contador de la tanda nueva y
// dándola por asentada antes de tiempo. Por eso cada aviso viaja con el número
// de generación en el que nació y se descarta si no es la vigente.
export interface Generacion {
  gen: number;
  esperados: number;
  recibidos: number;
}

export function nuevaGeneracion(gen: number, esperados: number): Generacion {
  return { gen, esperados, recibidos: 0 };
}

// Registra que un riel terminó. Ignora los avisos de otra generación.
//
// El tope en `esperados` no es defensa de más: un `Shelf` puede avisar dos veces
// —termina vacío y después llega un reintento— y sin el tope el contador pasaría
// el total y `estaAsentada` daría true con rieles todavía en vuelo.
export function registrarListo(g: Generacion, gen: number): Generacion {
  if (gen !== g.gen) return g;
  if (g.recibidos >= g.esperados) return g;
  return { ...g, recibidos: g.recibidos + 1 };
}

export function estaAsentada(g: Generacion): boolean {
  return g.esperados > 0 && g.recibidos >= g.esperados;
}
