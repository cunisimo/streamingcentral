// La resolución CENTRALIZADA de disponibilidad.
//
// Un solo lugar decide en qué plataformas está un título. Antes cada superficie
// decidía sola, y por eso el arreglo de Moria —correcto— quedó atado a la ficha:
// la card del Home, la búsqueda y los relacionados seguían mostrando gris.
//
// PRIORIDAD DE EVIDENCIA, de más fuerte a más débil:
//
//   1. `watch/providers` de TMDB para AR, `flatrate`.   → "tmdb-ar"
//   2. Top oficial reciente de Netflix.                 → "top-oficial"
//   3. Evidencia oficial de alta probabilidad.          → "oficial-probable"
//   4. Registro manual versionado.                      → "manual"
//
// 🔴 LOS RESPALDOS SÓLO AGREGAN CUANDO TMDB NO SABE NADA. Nunca contradicen a
// TMDB ni lo reemplazan. Si TMDB ubica el título en otras plataformas, el dato
// en conflicto es el nuestro: lo más probable es un error de matcheo, y
// "corregirlo" convertiría un error propio en una afirmación falsa.
//
// 🔴 UN FALLO NUNCA ES UNA AUSENCIA. Si Supabase o TMDB se caen, se devuelve lo
// que TMDB haya dicho y se marca `fallo: true` para que el llamador NO lo
// cachee. Congelar un "no está en ningún lado" por un hipo de la base deja la
// ficha rota justo después de haberla arreglado.
//
// Sin `server-only`: lógica pura, probable con `node --test`.
import { evidenciaOficialDe, type DatosTitulo } from "./enlace-oficial.ts";
import { EXCEPCIONES, type ExcepcionManual } from "./excepciones-disponibilidad.ts";
import { claveTitulo } from "./top-plataformas.ts";
import type { MediaType, PlatformCode } from "./types";

export type { ExcepcionManual };

/** De dónde salió la decisión. Se registra internamente, no se muestra. */
/**
 * De dónde salió la decisión. Se registra internamente, no se muestra.
 *
 * `oficial-probable` reemplaza al viejo `enlace-oficial`, y el nombre importa:
 * la regla ya no busca certeza sino **alta probabilidad**. Medida contra verdad
 * de campo dio 0 falsos positivos en 194 casos, pero sigue siendo una
 * inferencia, no una confirmación de la plataforma.
 */
export type Procedencia =
  | "tmdb-ar" | "top-oficial" | "top-manual" | "oficial-probable" | "manual";

export interface Disponibilidad {
  plataformas: PlatformCode[];
  /** `null` cuando no se pudo afirmar nada. */
  procedencia: Procedencia | null;
  /** Alguna fuente de respaldo falló. El llamador NO debe cachear este resultado. */
  fallo: boolean;
}

/** ¿La excepción sigue vigente hoy? El día de vencimiento todavía cuenta. */
export function vigente(e: ExcepcionManual, hoy: string): boolean {
  return e.vence >= hoy;
}

/**
 * Resuelve la disponibilidad de un título.
 *
 * `deTmdb` es el array que quedó guardado en el cache de `providersOf`. **Se
 * devuelve tal cual (la MISMA referencia) cuando no hay nada que agregar**, y
 * nunca se muta: mutarlo le metería una plataforma a todas las superficies que
 * compartan esa entrada de cache.
 *
 * Los lectores se inyectan en vez de importarse para que esto sea probable sin
 * red ni base, y para que el orden de los chequeos sea verificable: si TMDB
 * trajo algo, **ninguno se llama**.
 */
export async function resolverDisponibilidad(opts: {
  tipo: MediaType;
  id: number;
  deTmdb: PlatformCode[];
  /**
   * ¿TMDB informa **algún** `flatrate` en Argentina, aunque Yump no tenga código
   * para mostrarlo?
   *
   * 🔴 NO ES LO MISMO QUE `deTmdb.length`. `providersOf` descarta los
   * `provider_id` argentinos que no están en `providers-ar.ts`, así que un
   * título que TMDB ubica en una plataforma no soportada llega acá con `deTmdb`
   * vacío — indistinguible de "TMDB no sabe nada", que es el caso que los
   * respaldos existen para cubrir. Sin esta señal, la regla de enlace oficial
   * podía afirmar Disney+ sobre un título que TMDB ubica en otro lado: o sea
   * contradecir a TMDB, que es justo lo que no puede pasar.
   *
   * El resultado visible sigue siendo vacío (no hay código que mostrar), pero
   * **ningún respaldo se consulta ni se aplica**.
   */
  hayFlatrateAR?: boolean;
  /** Fecha argentina, YYYY-MM-DD. */
  hoy: string;
  /** Evidencia del top oficial de Netflix. Puede lanzar. */
  leerTopOficial: () => Promise<Set<string>>;
  /** Datos crudos del título para la regla oficial. Puede lanzar. */
  leerDatosTitulo: () => Promise<DatosTitulo | null>;
  /**
   * Evidencia del Top semanal cargado a mano: `tipo:id` → plataformas.
   *
   * Sale SÓLO de rankings publicados y vence a los 14 días (ver
   * `evidenciaDeRankings` en `top-manual-nucleo.ts`). Es opcional para que los
   * llamadores que no la tengan no cambien de comportamiento. Puede lanzar.
   */
  leerTopManual?: () => Promise<Map<string, PlatformCode[]>>;
  excepciones?: ExcepcionManual[];
}): Promise<Disponibilidad> {
  // --- 1. TMDB AR manda, y corta acá ---------------------------------------
  // El orden ES la optimización: con dato de TMDB no se lee Supabase, no se
  // pide nada más a TMDB y no se toca el cache. El costo extra queda sólo en
  // los títulos que vienen vacíos, que son pocos y son exactamente los rotos.
  //
  // `hayFlatrateAR` corta acá TAMBIÉN cuando no hay ningún código que mostrar:
  // TMDB dijo que el título está en algo argentino, y que nosotros no sepamos
  // pintarlo no nos habilita a inventar otra cosa. Devuelve el array vacío con
  // procedencia `tmdb-ar`, que es la verdad: la decisión fue de TMDB.
  if (opts.deTmdb.length || opts.hayFlatrateAR) {
    return { plataformas: opts.deTmdb, procedencia: "tmdb-ar", fallo: false };
  }

  const clave = claveTitulo(opts.tipo, opts.id);
  let fallo = false;

  // --- 2. Top oficial de Netflix -------------------------------------------
  // Intacto: mismas reglas de ventana y de `needs_review` que ya estaban.
  try {
    const evidencia = await opts.leerTopOficial();
    if (evidencia.has(clave)) {
      return { plataformas: ["n"], procedencia: "top-oficial", fallo };
    }
  } catch {
    // Una caída de nuestra base no puede producir NI negar disponibilidad.
    // Se sigue con las otras evidencias, marcando que esto no se cachea.
    fallo = true;
  }

  // --- 3. Top semanal cargado a mano ---------------------------------------
  // El dueño eligió cada título y confirmó su plataforma. Es un dato verificado
  // a mano, no una inferencia, y por eso va ANTES de la regla de enlace: cuando
  // los dos discrepan, gana el dato.
  //
  // Va DESPUÉS del top oficial de Netflix porque ése es una publicación de la
  // propia plataforma; entre dos hechos, el de la fuente primaria.
  if (opts.leerTopManual) {
    try {
      const manual = await opts.leerTopManual();
      const codes = manual.get(clave);
      if (codes?.length) {
        return { plataformas: [...codes], procedencia: "top-manual", fallo };
      }
    } catch {
      // Igual que arriba: una caída de nuestra base no niega disponibilidad, y
      // lo que se responda no se puede cachear.
      fallo = true;
    }
  }

  // --- 4. Evidencia oficial de alta probabilidad ---------------------------
  // Series y películas. Los `arIds` van vacíos a propósito: si AR tuviera datos,
  // la prioridad 1 ya habría cortado. Se pasan igual para que la regla pueda
  // aplicar su chequeo de contradicción sin depender de ese orden.
  try {
    const datos = await opts.leerDatosTitulo();
    if (datos) {
      const code = evidenciaOficialDe({ datos, arIds: [], hoy: opts.hoy });
      if (code) return { plataformas: [code], procedencia: "oficial-probable", fallo };
    }
  } catch {
    fallo = true;
  }

  // --- 5. Registro manual versionado ---------------------------------------
  const exc = (opts.excepciones ?? EXCEPCIONES).find(
    (e) => e.clave === clave && e.region === "AR" && vigente(e, opts.hoy),
  );
  if (exc) return { plataformas: [exc.plataforma], procedencia: "manual", fallo };

  // Nada que agregar: se devuelve el MISMO array de TMDB.
  return { plataformas: opts.deTmdb, procedencia: null, fallo };
}
