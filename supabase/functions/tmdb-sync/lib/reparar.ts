// Reparación de idioma para el sync, montada sobre el núcleo compartido.
//
// El PREDICADO y la FUSIÓN no se reimplementan acá: salen de
// `_shared/idioma-nucleo.ts`, el mismo archivo que usa la app. Lo propio de este
// módulo es la POLÍTICA: qué se escribe y qué queda afuera cuando el respaldo no
// alcanza.
//
// ============================================================================
// POR QUÉ LA POLÍTICA NO PUEDE SER LA DE LA APP
// ============================================================================
// En la app, un respaldo caído se resuelve sirviendo la base sin reparar y NO
// cacheándola: el próximo request reintenta y lo peor que pasa es que alguien
// vea un título raro unos segundos.
//
// Acá no hay cache. Lo que se escribe queda en la base hasta que otro sync
// alcance ese título, y el descubrimiento mira 3 páginas por popularidad, así
// que puede no llegar nunca. Escribir un título ilegible en `upcoming_content`
// es persistirlo, no mostrarlo un rato.
//
// ============================================================================
// LA DECISIÓN ES POR CAMPO, Y SOBRE EL RESULTADO YA FUSIONADO
// ============================================================================
// Dos versiones anteriores se equivocaron en direcciones opuestas:
//
//   1. La primera descartaba todo lo que el respaldo no mejorara. En la primera
//      corrida real eso tiró 79 títulos de 120, casi todos SIN SINOPSIS EN
//      NINGÚN IDIOMA: títulos a los que el cambio de idioma no les hizo nada y
//      que el sync viejo escribía sin problema. El descubrimiento bajó a un
//      tercio.
//   2. La segunda escribía todo lo que el respaldo no mejorara, y con eso
//      también habría escrito un título coreano que es-ES tenía en español.
//
// Las dos miraban lo mismo —si la fusión cambió la referencia del objeto— y esa
// es la pregunta equivocada. La correcta es QUÉ SIGUE ROTO DESPUÉS DE FUSIONAR:
//
//   - Sinopsis vacía en los dos idiomas -> SE ESCRIBE. Ese título no tiene
//     sinopsis en español y nunca la tuvo; no es un daño del cambio de idioma.
//   - Título todavía roto después de fusionar -> NO SE ESCRIBE. Ahí el es-ES
//     tenía algo mejor, o el dato es inservible; persistirlo es peor que dejar
//     la fila anterior donde estaba.
//
// Y "el respaldo respondió y no sirvió" NO es "el respaldo se cayó". Lo primero
// es un dato sobre el catálogo; lo segundo es una falla de transporte, y es la
// única que justifica reintentar. Se cuentan por separado.
import {
  fusionarPorCampo, type Localizable, necesitaReparacion, NO_LATINO, queReparar,
} from "../../_shared/idioma-nucleo.ts";

/**
 * Métricas de idioma de UNA corrida.
 *
 * Se crean con `nuevasMetricas()` y se pasan por parámetro. NO son estado de
 * módulo: dos invocaciones de `syncUpcoming` que se solapen —dos pedidos al
 * endpoint, un reintento del cron encima de la corrida anterior— compartirían el
 * acumulador y mezclarían sus números, o peor, uno reiniciaría los del otro a
 * mitad de camino. Es el mismo motivo por el que `lib/cache.ts` y
 * `lib/idioma.ts` de la app usan AsyncLocalStorage en vez de un contador global.
 */
export interface MetricasIdioma {
  /** Requests de respaldo que de verdad salieron a la red. */
  llamadas: number;
  /** Títulos o episodios donde la reparación mejoró algo. */
  reparados: number;

  // --- Lo que el respaldo no pudo mejorar, separado POR CONSECUENCIA -------
  /** Sinopsis vacía en los dos idiomas. Se ESCRIBE igual: no es un daño. */
  sinopsisSinMejora: number;
  /** El título sigue roto después de fusionar. NO se escribe. */
  tituloSinReparar: number;
  /** Episodio sin nombre en los dos idiomas. Se conserva vacío. */
  episodioSinNombre: number;
  /** Episodio ilegible que el respaldo no arregla. Se descarta el candidato. */
  episodioNoReparado: number;

  /** Fallas de TRANSPORTE: excepción o timeout pidiendo el respaldo. */
  fallos: number;
}

export const nuevasMetricas = (): MetricasIdioma => ({
  llamadas: 0, reparados: 0,
  sinopsisSinMejora: 0, tituloSinReparar: 0,
  episodioSinNombre: 0, episodioNoReparado: 0,
  fallos: 0,
});

export interface ResultadoReparacion<T> {
  /** Lo que se puede escribir. */
  items: T[];
  /** Quedaron fuera porque su TÍTULO sigue roto. */
  tituloSinReparar: number;
  /** Se escriben con la sinopsis vacía, porque tampoco la hay en es-ES. */
  sinopsisSinMejora: number;
  /** La fusión mejoró algo. */
  reparados: number;
  llamadas: number;
  /** La llamada de respaldo se cayó. */
  fallo: boolean;
}

export function sumarLote<T>(m: MetricasIdioma, r: ResultadoReparacion<T>): void {
  m.llamadas += r.llamadas;
  m.reparados += r.reparados;
  m.tituloSinReparar += r.tituloSinReparar;
  m.sinopsisSinMejora += r.sinopsisSinMejora;
  if (r.fallo) m.fallos++;
}

/**
 * Repara un LOTE con UNA sola llamada de respaldo, no una por título.
 *
 * `pedirRespaldo` solo se invoca si hay al menos un roto: una página sana no
 * cuesta nada.
 */
export async function repararLista<T extends Localizable & { id: number }>(
  base: T[],
  pedirRespaldo: () => Promise<Localizable[]>,
  etiqueta: string,
  activo: boolean,
): Promise<ResultadoReparacion<T>> {
  const intacto: ResultadoReparacion<T> = {
    items: base, tituloSinReparar: 0, sinopsisSinMejora: 0,
    reparados: 0, llamadas: 0, fallo: false,
  };
  if (!activo) return intacto;

  const rotos = new Set<number>();
  for (const t of base) if (necesitaReparacion(t)) rotos.add(t.id);
  if (!rotos.size) return intacto;

  let respaldo: Localizable[];
  try {
    respaldo = await pedirRespaldo();
  } catch (e) {
    // TRANSPORTE: no se pudo mirar, así que no se escribe nada dudoso. La fila
    // anterior de cada uno queda intacta y mañana se reintenta.
    console.error(`[idioma] respaldo falló en ${etiqueta}: ${rotos.size} título(s) fuera de esta corrida —`, e);
    return {
      items: base.filter((t) => !rotos.has(t.id)),
      tituloSinReparar: 0, sinopsisSinMejora: 0,
      reparados: 0, llamadas: 1, fallo: true,
    };
  }

  const porId = new Map<number, Localizable>();
  for (const r of respaldo) {
    const id = (r as { id?: number }).id;
    if (id !== undefined) porId.set(id, r);
  }

  const items: T[] = [];
  let tituloSinReparar = 0, sinopsisSinMejora = 0, reparados = 0;
  for (const t of base) {
    if (!rotos.has(t.id)) { items.push(t); continue; }

    const arreglado = fusionarPorCampo(t, porId.get(t.id));
    // LA PREGUNTA CORRECTA. Mirar si cambió la referencia no distingue "le falta
    // la sinopsis" de "el título es ilegible", y son decisiones opuestas.
    const queda = queReparar(arreglado);

    if (queda.titulo) {
      tituloSinReparar++;
      continue;                            // no se escribe: sobrevive la fila anterior
    }
    if (queda.sinopsis) sinopsisSinMejora++;   // se escribe igual
    if (arreglado !== t) reparados++;
    items.push(arreglado);
  }

  if (tituloSinReparar) {
    console.warn(`[idioma] ${etiqueta}: ${tituloSinReparar} título(s) siguen rotos después del respaldo; fuera de esta corrida`);
  }
  if (sinopsisSinMejora) {
    console.log(`[idioma] ${etiqueta}: ${sinopsisSinMejora} título(s) sin sinopsis en ningún idioma; se escriben igual`);
  }
  return { items, tituloSinReparar, sinopsisSinMejora, reparados, llamadas: 1, fallo: false };
}

// ============================================================================
// EL NOMBRE DEL EPISODIO
// ============================================================================
// No es un título de obra: no tiene `original_name` contra el cual comparar, así
// que de las tres señales solo aplican dos. Y NO se tratan igual:
//
//   - vacío en los dos idiomas -> se conserva vacío. Es lo que escribía el sync
//     viejo, y un episodio sin nombre no es un dato corrupto.
//   - ilegible que el respaldo no arregla -> se descarta el candidato.

export function nombreDeEpisodioRoto(nombre: string | undefined | null): boolean {
  const n = (nombre ?? "").trim();
  return !n || NO_LATINO.test(n);
}

export type MotivoEpisodio =
  | "ok"            // no hacía falta reparar
  | "reparado"      // el respaldo lo arregló
  | "sin-nombre"    // vacío en los dos idiomas: se conserva vacío
  | "no-reparado"   // ilegible y sin respaldo útil: se descarta
  | "fallo";        // el respaldo se cayó: se descarta

export interface ResultadoEpisodio {
  nombre: string | null;
  /** true = la serie se cae de ESTA corrida. */
  descartar: boolean;
  llamadas: number;
  reparado: boolean;
  motivo: MotivoEpisodio;
}

export function sumarEpisodio(m: MetricasIdioma, r: ResultadoEpisodio): void {
  m.llamadas += r.llamadas;
  if (r.reparado) m.reparados++;
  if (r.motivo === "sin-nombre") m.episodioSinNombre++;
  if (r.motivo === "no-reparado") m.episodioNoReparado++;
  if (r.motivo === "fallo") m.fallos++;
}

/**
 * `pedirRespaldo` DEBE pedir el episodio por las MISMAS coordenadas
 * (season/episode) que el episodio base, nunca "el próximo de hoy" en el otro
 * idioma: entre una llamada y la otra el próximo puede haber avanzado, y ahí se
 * mezclaría el nombre de otro episodio con esta fila.
 */
export async function repararNombreEpisodio(
  nombre: string | undefined | null,
  pedirRespaldo: () => Promise<string | null>,
  etiqueta: string,
  activo: boolean,
): Promise<ResultadoEpisodio> {
  const limpio = (nombre ?? "").trim() || null;
  if (!activo || !nombreDeEpisodioRoto(nombre)) {
    return { nombre: limpio, descartar: false, llamadas: 0, reparado: false, motivo: "ok" };
  }

  // QUÉ tipo de roto es: las dos ramas terminan distinto.
  const eraIlegible = NO_LATINO.test((nombre ?? "").trim());

  let respaldo: string | null;
  try {
    respaldo = await pedirRespaldo();
  } catch (e) {
    console.error(`[idioma] respaldo de episodio falló en ${etiqueta}; fuera de esta corrida —`, e);
    return { nombre: null, descartar: true, llamadas: 1, reparado: false, motivo: "fallo" };
  }

  if (!nombreDeEpisodioRoto(respaldo)) {
    return {
      nombre: (respaldo ?? "").trim(), descartar: false,
      llamadas: 1, reparado: true, motivo: "reparado",
    };
  }

  // El respaldo tampoco sirve: acá se bifurca según cómo estaba la base.
  if (eraIlegible) {
    console.warn(`[idioma] ${etiqueta}: nombre de episodio ilegible y sin respaldo; fuera de esta corrida`);
    return { nombre: null, descartar: true, llamadas: 1, reparado: false, motivo: "no-reparado" };
  }
  console.log(`[idioma] ${etiqueta}: el episodio no tiene nombre en ningún idioma; se conserva vacío`);
  return { nombre: null, descartar: false, llamadas: 1, reparado: false, motivo: "sin-nombre" };
}
