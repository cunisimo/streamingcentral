// El núcleo de "cambié de filtro, ¿tengo que pedir de nuevo?".
//
// ⚠️ ESTO ES UN MÓDULO PURO A PROPÓSITO. La lógica vivía suelta dentro de dos
// efectos de `UpcomingAllView` y ahí no se podía probar: este proyecto no tiene
// arnés de DOM (misma nota que `lib/legal.test.ts` y `lib/cors-inventario.test.ts`),
// así que un bug de coordinación entre efectos sólo se descubría usando la app.
// Y hubo uno, con síntoma visible en producción — ver `decidirCambioDeFiltro`.
//
// La otra razón es que lo que decide si hay refetch es un dato, no un render: el
// mismo criterio por el que `hooks/home-types-nucleo.ts` es puro.

/** Qué hacer cuando el filtro activo cambió (o cuando arranca la vista). */
export type AccionFiltro =
  /** No pedir nada: el filtro no cambió, o los datos ya vinieron del snapshot. */
  | { tipo: "nada" }
  /** Pedir la página 1 del filtro nuevo, tirando lo que había. */
  | { tipo: "recargar"; filtro: string };

export interface EstadoFiltro {
  /**
   * El filtro cuya lista está EN PANTALLA. `null` significa "todavía ninguna":
   * no hay lista, así que cualquier filtro que llegue necesita una carga.
   *
   * 🔴 ESTE ES EL CAMPO DEL BUG. Antes esto era un `useRef(null)` que se
   * inicializaba dentro del efecto que lo leía, y en el render donde ocurría la
   * carga inicial ese efecto NO corría —sus dependencias no habían cambiado—, así
   * que quedaba en `null`. El primer clic del usuario se consumía como "la
   * inicialización" y volvía sin pedir nada.
   *
   * El síntoma: tocar Películas y seguir viendo Series. No era una respuesta
   * fuera de orden ni una carrera —no se emitía NINGUNA petición—, y por eso
   * mirar `reqId` no llevaba a nada. Determinístico: fallaba siempre que se
   * llegaba a la página con el filtro en `Todos`, y andaba al volver de una ficha
   * con Películas o Series ya elegido, porque ahí la restauración cambiaba el
   * filtro y el efecto sí corría. Eso explicaba el "a veces" del reporte.
   *
   * Acá se arregla por construcción: `aplicado` sólo pasa de `null` a un valor
   * en la misma decisión que ordena la carga (`recargar`) o que declara que los
   * datos ya están (`restaurar`). No existe un estado "ya cargué pero `aplicado`
   * sigue en null".
   */
  aplicado: string | null;
}

export const estadoFiltroInicial: EstadoFiltro = { aplicado: null };

/**
 * Arranque de la vista, una vez que el mecanismo de restauración ya decidió.
 *
 * `restaurado` es true cuando volvimos de una ficha y los items vinieron del
 * snapshot: no hay que pedir nada, pero SÍ hay que registrar cuál es el filtro
 * en pantalla — es justamente lo que el bug no hacía.
 */
export function iniciar(
  filtro: string, restaurado: boolean,
): { estado: EstadoFiltro; accion: AccionFiltro } {
  return {
    estado: { aplicado: filtro },
    accion: restaurado ? { tipo: "nada" } : { tipo: "recargar", filtro },
  };
}

/**
 * Cambio de filtro. Devuelve el estado nuevo y qué hacer.
 *
 * Con `aplicado` en `null` esto NO se traga el cambio: pide la carga igual. Es
 * la red de seguridad por si el arranque no llegó a correr.
 */
export function decidirCambioDeFiltro(
  estado: EstadoFiltro, filtro: string,
): { estado: EstadoFiltro; accion: AccionFiltro } {
  if (estado.aplicado === filtro) return { estado, accion: { tipo: "nada" } };
  return { estado: { aplicado: filtro }, accion: { tipo: "recargar", filtro } };
}

/**
 * ¿Esta respuesta sigue siendo la que la vista está esperando?
 *
 * Dos condiciones, y las dos hacen falta:
 *
 *  - **El número de pedido.** Protege contra respuestas fuera de orden: si el
 *    usuario tocó Series y después Películas, la de Series puede llegar segunda.
 *  - **El filtro.** Protege contra el caso que el número no cubre: una respuesta
 *    con el `reqId` vigente pero disparada para otro filtro. Con `nada` en el
 *    medio (el filtro volvió a su valor anterior sin recargar) el contador no se
 *    mueve y sólo el filtro distingue.
 */
export function respuestaVigente(opts: {
  reqDeLaRespuesta: number;
  reqActual: number;
  filtroDeLaRespuesta: string;
  filtroActual: string;
}): boolean {
  return opts.reqDeLaRespuesta === opts.reqActual
    && opts.filtroDeLaRespuesta === opts.filtroActual;
}

// ============================================================================
// "Cargar más": la página confirmada NO avanza hasta que la respuesta llegó bien
// ============================================================================

/**
 * Estado de la paginación por tandas.
 *
 * 🔴 `confirmada` ES LA PÁGINA QUE YA LLEGÓ BIEN, no la que se pidió, y ésa es
 * toda la corrección. La versión anterior hacía
 *
 *     const more = () => { const next = page + 1; setPage(next); load(f, next); }
 *
 * o sea que adelantaba la página ANTES de saber el resultado. Si la tanda 2
 * fallaba, `page` ya valía 2, así que el siguiente toque pedía la 3: la tanda 2
 * quedaba salteada para siempre y la lista tenía un hueco invisible. Y el
 * snapshot que se guardaba decía "voy en la página 2" con los items de la 1, así
 * que volver de una ficha heredaba el hueco.
 *
 * Con la página confirmada, reintentar no necesita recordar qué falló: pedir
 * `confirmada + 1` **es** volver a pedir exactamente la misma página.
 */
export interface EstadoTanda {
  /** Última página que llegó completa. 0 = todavía ninguna. */
  confirmada: number;
  /**
   * Falló una tanda ADICIONAL. Se separa del fallo de la primera carga porque el
   * remedio es distinto: sin nada en pantalla corresponde el estado de error a
   * pantalla completa, y con la lista ya puesta corresponde un aviso discreto al
   * pie que no tape lo que el usuario está mirando.
   */
  falloTanda: boolean;
}

export const estadoTandaInicial: EstadoTanda = { confirmada: 0, falloTanda: false };

/** La página que hay que pedir ahora. Reintentar y avanzar son lo mismo acá. */
export function paginaAPedir(e: EstadoTanda): number {
  return e.confirmada + 1;
}

/**
 * Llegó una tanda completa.
 *
 * `Math.max` y no una asignación: si una respuesta vieja se colara —el guard de
 * `respuestaVigente` ya las descarta, esto es el cinturón— no puede hacer
 * retroceder la página confirmada y provocar que se vuelva a pedir algo que ya
 * está en pantalla.
 */
export function alLlegarLaTanda(e: EstadoTanda, pagina: number): EstadoTanda {
  return { confirmada: Math.max(e.confirmada, pagina), falloTanda: false };
}

/**
 * Falló una tanda. **`confirmada` no se toca**: es lo que hace que el reintento
 * pida la misma página y que no quede ningún hueco.
 */
export function alFallarLaTanda(e: EstadoTanda, pagina: number): EstadoTanda {
  return { confirmada: e.confirmada, falloTanda: pagina > 1 };
}

/** Volver a empezar: cambio de filtro, o entrada limpia por link. */
export function reiniciarTanda(): EstadoTanda {
  return estadoTandaInicial;
}

/**
 * Concatena una tanda nueva sin repetir nada.
 *
 * Hace falta por tres caminos distintos y ninguno es hipotético: un reintento
 * puede devolver la misma tanda que ya se pintó, la selección se reconstruye en
 * cada pedido y el sync de las 6am puede cambiar la tabla entre dos páginas.
 * También deduplica DENTRO de `nuevos`, no sólo contra `previos`.
 */
export function unir<T>(previos: T[], nuevos: T[], clave: (x: T) => string): T[] {
  const vistos = new Set(previos.map(clave));
  const salida = [...previos];
  for (const n of nuevos) {
    const k = clave(n);
    if (vistos.has(k)) continue;
    vistos.add(k);
    salida.push(n);
  }
  return salida;
}
