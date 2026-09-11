// Qué pasa cuando el caché no puede GUARDAR lo que ya calculamos bien.
//
// ============================================================================
// EL BUG QUE ESTE MÓDULO VIENE A CERRAR
// ============================================================================
// El camino de LECTURA de Redis estaba cuidado desde siempre: `getSuelto` y
// `flush` (lib/cache.ts) capturan el error, lo registran y devuelven `null`, o
// sea "no estaba". El contrato es explícito: *seguí sin caché*.
//
// El de ESCRITURA no. `guardar` era `try { await redis.set(...) } finally {…}`
// —sin `catch`— y `resolverConCache` espera esa escritura antes de devolver, así
// que un rechazo de `redis.set` subía hasta el `catch` del handler y salía como
// **500 con el Home vacío**.
//
// 🔴 Y el control es lo que lo vuelve indefendible: un payload DEGRADADO se
// servía sin problema —porque nunca intenta escribir— y uno COMPLETO Y CORRECTO
// se perdía. El sistema se portaba peor cuanto mejor le había salido el trabajo.
//
// La decisión la tomó el dueño el 2026-09-10, y es la que ya cumplía la lectura:
//
//   > Si el payload se produjo correctamente y sólo falla la escritura en Redis,
//   > se entrega al usuario y se registra el error.
//
// Esto NO inventa una política nueva: cierra la asimetría entre los dos caminos.
//
// ============================================================================
// POR QUÉ ES UN MÓDULO APARTE, Y NO CINCO LÍNEAS ADENTRO DE `guardar`
// ============================================================================
// Misma razón que `lib/reparar-y-cachear.ts` y `lib/single-flight.ts`:
// `lib/cache.ts` arrastra el cliente de Upstash y **no se puede importar desde
// `node --test`**. Una política que vive allá adentro sólo se puede vigilar
// leyendo el fuente; acá se puede EJECUTAR, que es lo que hace falta cuando lo
// que se prueba es justamente el comportamiento ante un fallo.
//
// `lib/cache-delega.test.ts` ya fija ese mismo principio para `cachedIf`, y por
// el mismo motivo: un test que corre sobre código que producción no ejecuta no
// prueba nada. Ver el comentario de ese archivo.

/** Por qué se avisa: son dos fallos distintos y no significan lo mismo. */
export interface FalloDeEscritura {
  clave: string;
  error: unknown;
}

export interface OpcionesGuardado {
  /** La escritura real. Puede rechazar: es justamente el caso que se cubre. */
  escribir: () => Promise<void>;
  clave: string;
  /**
   * Se llama SÓLO si la escritura falló.
   *
   * Es obligatorio y no tiene default a propósito: un fallo silencioso acá es
   * peor que el 500 que se vino a sacar. El 500 al menos se veía; una escritura
   * que falla sin dejar rastro significa que **cada request siguiente va a
   * rearmar** y nadie se entera nunca de por qué.
   */
  avisar: (f: FalloDeEscritura) => void;
}

/**
 * Guarda, y si no puede, **no rompe**.
 *
 * Devuelve `true` si se guardó y `false` si no. El valor de retorno existe para
 * que el llamador pueda contar, no para que decida: la decisión —entregar el
 * payload igual— ya está tomada y es incondicional.
 *
 * ⚠️ **Sólo absorbe el fallo de la ESCRITURA.** Si `escribir` lanza de forma
 * síncrona antes de devolver la promesa, también se captura; cualquier otra cosa
 * que ocurra fuera de esta función sigue su camino normal. Este módulo no es un
 * `try/catch` de propósito general y no hay que usarlo como tal.
 */
export async function guardarSinRomper(opts: OpcionesGuardado): Promise<boolean> {
  try {
    await opts.escribir();
    return true;
  } catch (error) {
    // No se re-lanza: ese `throw` ES el bug. Ver el encabezado.
    opts.avisar({ clave: opts.clave, error });
    return false;
  }
}
