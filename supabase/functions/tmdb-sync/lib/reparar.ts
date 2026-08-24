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
//   - Título final LEGIBLE -> SE ESCRIBE, aunque coincida con el original y no
//     exista traducción en ninguno de los dos idiomas. "Le bruit des
//     souvenirs", "Yandakiler" o "The Povera" SON el nombre de esas obras.
//   - Título final VACÍO o en escritura no latina -> NO SE ESCRIBE.
//
// Ese último corte es un PISO DE CALIDAD, no una protección de idioma, y
// conviene tenerlo claro: la fusión ya repara todo lo que es-ES pueda mejorar,
// así que un título que sigue ilegible después de fusionar es un título que
// tampoco existía legible antes. Lo que se decide acá es si `헤라클레스` puede
// aparecer en Próximamente, y la respuesta es que no.
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
  /** Título sin traducción en ningún idioma pero LEGIBLE. Se ESCRIBE. */
  titulosOriginalesLegibles: number;
  /** Título final vacío o en escritura no latina. NO se escribe. */
  titulosIlegiblesDescartados: number;
  /** Episodio sin nombre en los dos idiomas. Se conserva vacío. */
  episodioSinNombre: number;
  /** Episodio ilegible que el respaldo no arregla. Se descarta el candidato. */
  episodioNoReparado: number;

  /** Fallas de TRANSPORTE: excepción o timeout pidiendo el respaldo. */
  fallos: number;
}

export const nuevasMetricas = (): MetricasIdioma => ({
  llamadas: 0, reparados: 0,
  sinopsisSinMejora: 0,
  titulosOriginalesLegibles: 0, titulosIlegiblesDescartados: 0,
  episodioSinNombre: 0, episodioNoReparado: 0,
  fallos: 0,
});

export interface ResultadoReparacion<T> {
  /** Lo que se puede escribir. */
  items: T[];
  /** Sin traducción en ningún idioma, pero legibles: se escriben. */
  titulosOriginalesLegibles: number;
  /** Título final vacío o ilegible: quedaron fuera. */
  titulosIlegiblesDescartados: number;
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
  m.titulosOriginalesLegibles += r.titulosOriginalesLegibles;
  m.titulosIlegiblesDescartados += r.titulosIlegiblesDescartados;
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
  if (!activo) {
    return {
      items: base, titulosOriginalesLegibles: 0, titulosIlegiblesDescartados: 0,
      sinopsisSinMejora: 0, reparados: 0, llamadas: 0, fallo: false,
    };
  }

  const rotos = new Set<number>();
  for (const t of base) if (necesitaReparacion(t)) rotos.add(t.id);

  if (!rotos.size) {
    // Nada que reparar, pero el PISO DE CALIDAD corre igual: un título VACÍO con
    // una sinopsis buena no dispara ninguna de las tres señales —`cayoAlOriginal`
    // exige que el original exista, y no existe— así que salía por acá y se
    // escribía el vacío. Lo encontró el test, no la lectura del código.
    const legibles = base.filter((t) => !tituloIlegible(t));
    return {
      items: legibles,
      titulosOriginalesLegibles: 0,
      titulosIlegiblesDescartados: base.length - legibles.length,
      sinopsisSinMejora: 0, reparados: 0, llamadas: 0, fallo: false,
    };
  }

  let respaldo: Localizable[];
  try {
    respaldo = await pedirRespaldo();
  } catch (e) {
    // TRANSPORTE: no se pudo mirar, así que no se escribe nada dudoso. La fila
    // anterior de cada uno queda intacta y mañana se reintenta.
    console.error(`[idioma] respaldo falló en ${etiqueta}: ${rotos.size} título(s) fuera de esta corrida —`, e);
    // Los sanos siguen su camino, pero pasando igual por el piso de calidad.
    const sanos = base.filter((t) => !rotos.has(t.id) && !tituloIlegible(t));
    return {
      items: sanos,
      titulosOriginalesLegibles: 0,
      titulosIlegiblesDescartados: base.filter((t) => !rotos.has(t.id)).length - sanos.length,
      sinopsisSinMejora: 0, reparados: 0, llamadas: 1, fallo: true,
    };
  }

  const porId = new Map<number, Localizable>();
  for (const r of respaldo) {
    const id = (r as { id?: number }).id;
    if (id !== undefined) porId.set(id, r);
  }

  const items: T[] = [];
  let originalesLegibles = 0, ilegibles = 0, sinopsisSinMejora = 0, reparados = 0;
  for (const t of base) {
    // El PISO DE CALIDAD se aplica a TODOS, no solo a los que entraron al camino
    // de reparación. Un título VACÍO con una sinopsis buena no dispara ninguna
    // de las tres señales —`cayoAlOriginal` exige que exista el original, y no
    // existe— así que nunca pasaba por acá y se escribía el vacío. Lo encontró
    // el test, no la lectura del código.
    const arreglado = rotos.has(t.id) ? fusionarPorCampo(t, porId.get(t.id)) : t;

    // Se decide sobre el RESULTADO FUSIONADO, no sobre si la fusión cambió algo.
    if (tituloIlegible(arreglado)) {
      ilegibles++;
      continue;                            // no se escribe: sobrevive la fila anterior
    }
    if (!rotos.has(t.id)) { items.push(t); continue; }
    // Legible pero sin traducción: es el nombre real de la obra. Se escribe y se
    // cuenta aparte, para que quede claro que NO es lo mismo que descartarlo.
    if (queReparar(arreglado).titulo) originalesLegibles++;
    if (queReparar(arreglado).sinopsis) sinopsisSinMejora++;
    if (arreglado !== t) reparados++;
    items.push(arreglado);
  }

  if (ilegibles) {
    console.warn(`[idioma] ${etiqueta}: ${ilegibles} título(s) ilegibles después del respaldo; fuera de esta corrida`);
  }
  if (originalesLegibles) {
    console.log(`[idioma] ${etiqueta}: ${originalesLegibles} título(s) sin traducción pero legibles; se escriben tal cual`);
  }
  if (sinopsisSinMejora) {
    console.log(`[idioma] ${etiqueta}: ${sinopsisSinMejora} título(s) sin sinopsis en ningún idioma; se escriben igual`);
  }
  return {
    items, titulosOriginalesLegibles: originalesLegibles,
    titulosIlegiblesDescartados: ilegibles,
    sinopsisSinMejora, reparados, llamadas: 1, fallo: false,
  };
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

/**
 * EL CORTE. Un título es inaceptable si queda vacío o si no se puede leer en
 * alfabeto latino. Nada más: que coincida con el original NO lo hace
 * inaceptable, porque para miles de obras ese ES su nombre.
 */
export function tituloIlegible(t: Localizable): boolean {
  const n = (t.title ?? t.name ?? "").trim();
  return !n || NO_LATINO.test(n);
}

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
