// Cómo se ordenan los candidatos de "Elegidas para vos", y qué anime puede
// aparecer.
//
// Puro y sin dependencias de red: todo lo que necesita ya viajó en la respuesta
// de TMDB o ya se pidió para armar el riel. Puntuar NO cuesta una llamada más.
//
// EL PROBLEMA QUE RESUELVE. Hasta ahora el orden dentro de cada origen era
// `b.apoyos - a.apoyos` y nada más. Como casi todos los candidatos tienen un
// solo apoyo, el empate conservaba el orden de llegada —el de TMDB— y el primero
// de cada origen iba a las primeras tarjetas del riel. Así entró Bleach: primero
// en el cruce de Matrix, sin ningún respaldo más que ser lo más popular que
// TMDB encontró para "espadas + acción" en televisión.
import type { MediaType } from "./types";

// --- Anime -------------------------------------------------------------------

// Anime = animación (16) + idioma original japonés. Es la definición que se
// puede sostener con los datos que YA vienen en el crudo de TMDB, sin pedir
// nada. No es perfecta —deja afuera co-producciones y mete alguna animación
// japonesa que nadie llamaría anime— pero no requiere una fuente nueva.
//
// OJO CON LO QUE NO ES: tener Crunchyroll elegida no habilita nada acá. En el
// resto de la app sí destapa el filtro de animación (ver `tieneAnimePlatform`),
// porque su catálogo es anime casi puro y con el filtro puesto los rieles se
// vacían. Pero elegir una plataforma no dice que te GUSTE el anime, y este riel
// es el único que se arma con lo que a vos te gustó.
export const GENERO_ANIMACION = 16;
export const IDIOMA_ANIME = "ja";

export function esAnime(x: { generos: number[]; idioma: string }): boolean {
  return x.generos.includes(GENERO_ANIMACION) && x.idioma === IDIOMA_ANIME;
}

// ¿Puede aparecer anime en este armado?
//
// Solo si alguno de los SEIS ORÍGENES ELEGIDOS es anime. Los seis salen de
// señales positivas —Petacular, Ta buena o Mi lista—, así que "Ya la vi" y
// "Malaso" no habilitan nada: ninguna de las dos dice que te haya gustado.
//
// Se mira contra los orígenes y no contra las señales enteras porque el detalle
// de los seis YA está pedido (`perfilDe` los trae para armar el cruce) y el de
// las otras 234 costaría una llamada cada una. La consecuencia hay que decirla:
// si tu único anime positivo no entró al top 6, ese armado no muestra anime.
// Es un falso negativo, y es la dirección segura — el error es no mostrar anime
// a quien le gusta, no mostrárselo a quien no.
export function permiteAnime(origenes: { generos: number[]; idioma: string }[]): boolean {
  return origenes.some(esAnime);
}

// --- Coincidencia temática ---------------------------------------------------

// Cuánto de lo que se esperaba del origen cumple el candidato, de 0 a 1.
//
// NO resuelve el caso Bleach y conviene dejarlo escrito para no confundirse:
// Bleach comparte con Matrix los DOS géneros mapeados a televisión (10759
// acción/aventura y 10765 scifi/fantasía), o sea coincidencia 2/2 = 1. El tema
// lo habría SUBIDO. De Bleach se encarga el guard de anime, que es
// independiente; esto sirve para los otros casos, donde un candidato entra por
// una keyword suelta sin compartir nada de género.
export function coincidencia(generosCandidato: number[], generosEsperados: number[]): number {
  if (!generosEsperados.length) return 0;
  const set = new Set(generosCandidato);
  const n = generosEsperados.filter((g) => set.has(g)).length;
  return n / generosEsperados.length;
}

// --- Respaldos ---------------------------------------------------------------

export interface Respaldo {
  origenId: number;
  origenTipo: MediaType;
  origenTitulo: string;
  fuerza: number;              // 3 Petacular · 2 Ta buena · 1 Mi lista
  camino: "mismo" | "cruce";
  tema: number;                // 0..1
  pos: number;                 // posición dentro de la respuesta de TMDB, 1-based
}

// Con qué origen se queda un candidato respaldado por varios.
//
// Antes se quedaba con EL PRIMERO QUE LLEGÓ, que es un accidente del orden en
// que resolvieron los `Promise.all`. Ahora gana el respaldo más fuerte y, a
// igual fuerza, el más coherente. Importa de verdad: `porque` es lo único que
// explica de dónde salió cada recomendación, y "porque te gustó X" tiene que
// apuntar al X que mejor lo justifica.
export function mejorRespaldo(a: Respaldo, b: Respaldo): Respaldo {
  if (a.fuerza !== b.fuerza) return a.fuerza > b.fuerza ? a : b;
  if (a.tema !== b.tema) return a.tema > b.tema ? a : b;
  if (a.camino !== b.camino) return a.camino === "mismo" ? a : b;
  if (a.pos !== b.pos) return a.pos < b.pos ? a : b;
  // Empate total: se decide por id para que el orden sea estable entre corridas.
  return a.origenId <= b.origenId ? a : b;
}

// --- Puntaje -----------------------------------------------------------------

export interface Candidato {
  tipo: MediaType;
  id: number;
  generos: number[];
  idioma: string;
  apoyos: number;
  respaldo: Respaldo;
}

export interface Pesos {
  fuerza: number;
  apoyos: number;
  tema: number;
  pos: number;
  camino: number;
}

// Los pesos NO se eligen a ojo: salen de comparar órdenes con
// `scripts/medir-puntaje-reco.mjs`. Los de acá son los que ganaron esa
// comparación; el script imprime los componentes de cada candidato para poder
// rehacerla.
//
// `camino` arranca en 0 A PROPÓSITO. Medimos que `/recommendations` no trajo
// anime (0 de 120) y el cruce sí (32%), pero eso dice que anduvo mejor en esa
// prueba, no cómo funciona: TMDB no documenta cómo produce ese ranking. Darle
// una bonificación fija sería premiar una hipótesis. Queda como componente
// disponible, con peso 0 hasta que una medición lo justifique.
export const PESOS: Pesos = { fuerza: 1, apoyos: 0.8, tema: 0.6, pos: 0.3, camino: 0 };

// Cuántos candidatos mira la posición antes de saturar. Una respuesta de TMDB
// trae 20; más allá de eso la posición ya no distingue nada.
const POS_MAX = 20;
// A partir de cuántos apoyos deja de sumar. Tres orígenes distintos que
// coinciden ya es una señal fuerte; el cuarto no cambia la historia.
const APOYOS_MAX = 3;

export interface Componentes {
  fuerza: number; apoyos: number; tema: number; pos: number; camino: number; total: number;
}

export function componentes(c: Candidato, p: Pesos = PESOS): Componentes {
  const fuerza = c.respaldo.fuerza / 3;
  const apoyos = (Math.min(c.apoyos, APOYOS_MAX) - 1) / (APOYOS_MAX - 1);
  const tema = c.respaldo.tema;
  const pos = Math.max(0, 1 - (c.respaldo.pos - 1) / POS_MAX);
  const camino = c.respaldo.camino === "mismo" ? 1 : 0;
  return {
    fuerza, apoyos, tema, pos, camino,
    total: p.fuerza * fuerza + p.apoyos * apoyos + p.tema * tema + p.pos * pos + p.camino * camino,
  };
}

export const puntaje = (c: Candidato, p: Pesos = PESOS): number => componentes(c, p).total;

// --- Orden con variedad ------------------------------------------------------

const claveOrigen = (r: Respaldo) => `${r.origenTipo}:${r.origenId}`;

// Orden global por puntaje, con un tope de cuántas puede aportar cada origen
// antes de dejar pasar a los demás.
//
// POR QUÉ NO ALCANZABA EL INTERCALADO ANTERIOR. `intercalarPorOrigen` le daba UN
// TURNO IDÉNTICO a cada origen por vuelta. Dentro de un grupo todos los
// candidatos comparten origen y por lo tanto la misma fuerza, así que la fuerza
// no ordenaba nada adentro; y entre grupos, el turno parejo la ignoraba. El
// resultado es que Petacular y Mi lista pesaban igual una vez elegidos los seis.
//
// Acá la fuerza sí mueve el resultado —el orden es global— y la variedad la
// sostiene el tope, no el turno. `tope` se mide, no se elige: ver el script.
export function ordenarGlobalConTope<T>(
  items: T[],
  como: (t: T) => Candidato,
  tope: number,
  p: Pesos = PESOS,
): T[] {
  const conPuntaje = items.map((t, i) => ({ t, c: como(t), i }));
  conPuntaje.sort((a, b) => {
    const d = puntaje(b.c, p) - puntaje(a.c, p);
    if (d !== 0) return d;
    // Desempate estable: nunca por el orden de llegada, que cambia entre
    // corridas según cómo resuelvan los Promise.all.
    if (a.c.tipo !== b.c.tipo) return a.c.tipo < b.c.tipo ? -1 : 1;
    return a.c.id - b.c.id;
  });

  const usados = new Map<string, number>();
  const dentro: typeof conPuntaje = [];
  const sobrantes: typeof conPuntaje = [];
  for (const x of conPuntaje) {
    const k = claveOrigen(x.c.respaldo);
    const n = usados.get(k) ?? 0;
    if (n < tope) { usados.set(k, n + 1); dentro.push(x); } else sobrantes.push(x);
  }
  // Los que pasaron el tope no se tiran: van después, en su orden de puntaje.
  // Sin esto, un usuario con un solo origen productivo se quedaría sin riel.
  return [...dentro, ...sobrantes].map((x) => x.t);
}

// La otra estrategia que se midió: intercalado PONDERADO. Mismo turno rotativo
// de antes, pero un origen Petacular recibe 3 turnos por vuelta, uno de Ta buena
// 2 y uno de Mi lista 1. Dentro de cada origen se ordena por puntaje.
//
// Se deja en el código porque es la alternativa real a `ordenarGlobalConTope` y
// la comparación entre las dos es lo que decide cuál usa el riel. Sin las dos
// implementadas, "elegimos la mejor" no significaría nada.
export function ordenarTurnosPonderados<T>(
  items: T[],
  como: (t: T) => Candidato,
  p: Pesos = PESOS,
): T[] {
  const grupos = new Map<string, { fuerza: number; xs: { t: T; c: Candidato }[] }>();
  for (const t of items) {
    const c = como(t);
    const k = claveOrigen(c.respaldo);
    const g = grupos.get(k) ?? { fuerza: c.respaldo.fuerza, xs: [] };
    g.xs.push({ t, c });
    grupos.set(k, g);
  }
  for (const g of grupos.values()) {
    g.xs.sort((a, b) => {
      const d = puntaje(b.c, p) - puntaje(a.c, p);
      if (d !== 0) return d;
      if (a.c.tipo !== b.c.tipo) return a.c.tipo < b.c.tipo ? -1 : 1;
      return a.c.id - b.c.id;
    });
  }
  // Orden estable de los grupos: primero los de señal más fuerte.
  const listas = [...grupos.entries()]
    .sort((a, b) => b[1].fuerza - a[1].fuerza || (a[0] < b[0] ? -1 : 1))
    .map(([, g]) => g);

  const out: T[] = [];
  const cursor = new Map<typeof listas[number], number>(listas.map((l) => [l, 0]));
  let quedan = items.length;
  while (quedan > 0) {
    let hubo = false;
    for (const l of listas) {
      const turnos = l.fuerza;            // 3 / 2 / 1 por vuelta
      for (let n = 0; n < turnos; n++) {
        const i = cursor.get(l)!;
        if (i >= l.xs.length) break;
        out.push(l.xs[i].t);
        cursor.set(l, i + 1);
        quedan--;
        hubo = true;
      }
    }
    if (!hubo) break;
  }
  return out;
}
