// La selección editorial de "Próximamente".
//
// Función PURA sobre `UIUpcoming[]`: sin Supabase, sin TMDB, sin fecha del
// sistema. Todo lo que decide sale de los datos que recibe, y por eso se puede
// probar entera sin red (`lib/proximamente.test.ts`).
//
// EL PROBLEMA QUE RESUELVE. La agenda ordenada por fecha con un tope de 100 no
// mostraba una agenda: mostraba los primeros cinco días. Medido el 2026-09-04
// sobre las 238 filas vigentes, `limit=100` devolvía 100 series de 5 días
// distintos —de 50 que tenían contenido—, 99 de ellas episodios semanales y el
// 51% anime. Los primeros seis días concentran 141 de los 238 elementos, así que
// cualquier corte por fecha se los come enteros.
//
// 🔴 LA SELECCIÓN VA ANTES DE PAGINAR, y es lo único que arregla eso. Cortar en
// el navegador no alcanza: lo que hay que evitar es que los primeros días
// consuman el cupo, y para eso hay que ver la agenda completa antes de decidir
// qué entra. Traerla entera no cuesta más — medido, 246 filas con el join de
// proveedores tardan lo mismo que 100 (~490 ms), porque el costo es la latencia
// del round-trip y no el tamaño.
import type { UIUpcoming } from "./types";

/**
 * Series por fecha, como MÁXIMO. Las películas no consumen este cupo.
 *
 * ⚠️ Son 3 series TOTALES, no "3 episodios más las premieres que haya". Esa fue
 * la primera versión y cambiaba un ruido por otro: dejaba entrar las 81
 * premieres de la agenda, que son el 34% de las filas y llegan a 5 en un mismo
 * día. Con el cupo total, el día que tiene cinco premieres muestra tres.
 */
export const SERIES_POR_FECHA = 3;

/** Tope de anime sobre el acumulado, en cada tanda. Ver `seleccionar`. */
export const TOPE_ANIME = 0.20;

/** Género "Animación" de TMDB. */
const GENERO_ANIMACION = "animacion";

/** Idioma original del anime japonés. */
const IDIOMA_ANIME = "ja";

/**
 * ¿Es anime?
 *
 * 🔴 ANIMACIÓN Y ANIME NO SON LO MISMO, y confundirlos es el bug que esta
 * función existe para no cometer. Medido sobre la agenda del 2026-09-04: de los
 * 100 títulos con género Animación, 19 no son anime — *Los Simpson*, *South
 * Park*, *Futurama*, *American Dad*, *Teen Titans Go!*, *Masha y el Oso*
 * (rusa), *Super Wings* (coreana), *Tres Espías Sin Límite* (francesa). Topear
 * "animación" al 20% habría estado sacando a los Simpson para dejar entrar anime.
 *
 * Dos señales, cualquiera alcanza:
 *
 *  - **Crunchyroll.** Su catálogo es anime puro y se verificó: de los 67
 *    títulos de Crunchyroll en la agenda, los 67 tienen género Animación. Cero
 *    excepciones, así que es señal de precisión perfecta.
 *  - **Animación + idioma original japonés.** Recupera los 33 que están en otras
 *    plataformas, incluidos los tres de título romanizado que una heurística
 *    sobre el título original no puede ver: `BLEACH`, `BEYBLADE X` y `MAO`.
 *
 * Juntas marcan 81 de 81 en esa medición.
 *
 * ⚠️ `origin_country` NO participa, y no es un olvido: se midió y agrega
 * exactamente CERO títulos. La animación con `origin_country` que incluye JP son
 * 76, y los que tienen `original_language = "ja"` son los mismos 76. Agregar la
 * columna habría sido un campo sin consumidor.
 *
 * ⚠️ Con `originalLanguage` en `null` —la ventana entre la migración y la
 * primera corrida del sync— sólo queda la señal de Crunchyroll. Eso degrada el
 * recall a 67/81 (83%) y NO rompe nada: el tope se sigue aplicando, sobre menos
 * títulos. Es la razón por la que la migración no necesita backfill.
 */
export function esAnime(i: UIUpcoming): boolean {
  if (i.platforms.includes("cr")) return true;
  return i.genres.includes(GENERO_ANIMACION) && i.originalLanguage === IDIOMA_ANIME;
}

/**
 * Prioridad editorial. Más bajo es más importante.
 *
 * ⚠️ El nivel 2 está VACÍO en los datos de hoy, y conviene saberlo antes de
 * esperar que se llene: de los 81 estrenos de temporada de la agenda del
 * 2026-09-04, **ninguno es temporada 1**. Son T57 de *Rodando por América*, T29
 * de *South Park*, T30 de *La voz de América*. El nivel se declara igual porque
 * la regla lo pide y porque el día que TMDB traiga una serie nueva tiene que
 * ganarle al resto sin tocar nada.
 */
export function nivelEditorial(i: UIUpcoming): 1 | 2 | 3 | 4 {
  if (i.type === "movie") return 1;
  if (i.isSeasonPremiere) return i.seasonNumber === 1 ? 2 : 3;
  return 4;
}

const pop = (i: UIUpcoming) => i.popularity ?? 0;
const clave = (i: UIUpcoming) => `${i.type}:${i.id}`;

/** Popularidad desc, y el id como desempate para que el orden sea TOTAL. */
const porRelevancia = (a: UIUpcoming, b: UIUpcoming) => pop(b) - pop(a) || a.id - b.id;

/**
 * Orden de presentación: cronológico, que es lo que el usuario espera de una
 * agenda.
 *
 * Dentro de un mismo día decide la POPULARIDAD, no el nivel editorial. Los dos
 * órdenes se midieron y seleccionan exactamente lo mismo —es puro orden de
 * pantalla—, pero por nivel el riel del Home abría el 07/09 con *The Real
 * Housewives of London* (popularidad 3, único estreno de temporada de ese día)
 * por delante de *WWE Raw* (107). El lugar reservado del premiere es una regla de
 * SELECCIÓN; usarla también para ordenar hacía ver la sección rota.
 *
 * Las películas sí van primero en su día: son el nivel 1 y lo escaso de la
 * agenda.
 */
export function ordenCronologico(a: UIUpcoming, b: UIUpcoming): number {
  if (a.releaseDate !== b.releaseDate) return a.releaseDate < b.releaseDate ? -1 : 1;
  const na = nivelEditorial(a), nb = nivelEditorial(b);
  if (na === 1 || nb === 1) return na - nb;
  return porRelevancia(a, b);
}

/**
 * Paso 1: el cupo por fecha.
 *
 *  1. Las películas con plataforma argentina confirmada entran TODAS y no
 *     consumen cupo. Son el bien escaso: en la agenda del 2026-09-04 hay UNA en
 *     238 filas, y de 120 películas futuras verificadas una por una contra
 *     `watch/providers`, CERO tenían proveedor argentino. Hacerlas competir con
 *     las series por tres lugares las borraba del todo.
 *  2. Un lugar RESERVADO para el estreno de temporada más relevante del día.
 *  3. Si hay una temporada 1, ese lugar es suyo — aunque su popularidad sea más
 *     baja que la de otra premiere. Una serie nueva es la noticia del día.
 *  4. Los lugares que sobran van a las series más populares de la fecha, sin
 *     mirar si son premiere o episodio normal.
 *  5. Sin premieres, los tres lugares son de las tres series más populares.
 *
 * ⚠️ NO hay piso absoluto de popularidad, y es una decisión explícita del dueño:
 * la popularidad ORDENA dentro de cada fecha y nunca decide que un título deja
 * de existir. Un día con una sola serie muestra esa serie, tenga la popularidad
 * que tenga.
 */
function cupoPorFecha(items: UIUpcoming[]): UIUpcoming[] {
  const porFecha = new Map<string, UIUpcoming[]>();
  for (const i of items) {
    const dia = porFecha.get(i.releaseDate);
    if (dia) dia.push(i); else porFecha.set(i.releaseDate, [i]);
  }

  const elegidos: UIUpcoming[] = [];
  for (const fecha of [...porFecha.keys()].sort()) {
    const dia = porFecha.get(fecha)!;
    for (const p of dia.filter((i) => i.type === "movie")) elegidos.push(p);

    const series = dia.filter((i) => i.type === "tv").sort(porRelevancia);
    const premieres = series.filter((i) => i.isSeasonPremiere);
    const temporada1 = premieres.filter((i) => i.seasonNumber === 1);
    // Ya vienen ordenadas por relevancia, así que el primero es el más relevante.
    const reservado = (temporada1.length ? temporada1 : premieres)[0];

    const puestos = reservado ? [reservado] : [];
    for (const s of series) {
      if (puestos.length >= SERIES_POR_FECHA) break;
      if (reservado && clave(s) === clave(reservado)) continue;
      puestos.push(s);
    }
    elegidos.push(...puestos);
  }
  return elegidos;
}

/**
 * La selección completa, lista para paginar.
 *
 * DETERMINÍSTICA: con la misma entrada devuelve exactamente la misma salida, en
 * el mismo orden. Eso es lo que hace que paginar sea `slice(desde, hasta)` y que
 * dos páginas no puedan repetir ni saltear un título. Nada acá mira el reloj ni
 * usa `Math.random()`.
 *
 * El tope de anime tiene DOS mitades, y hacen falta las dos:
 *
 *  - **El cupo global** decide CUÁLES entran. Si el tope es el 20% del acumulado
 *    y hay `M` títulos que no son anime, entonces la cantidad `a` de anime
 *    cumple `a ≤ 0,20·(M + a)`, o sea `a ≤ M·0,20/0,80`. Con ese cupo se
 *    conservan los más populares, que es lo pedido.
 *  - **El recorrido** garantiza el tope en CADA tanda acumulada, no sólo al
 *    final. Un anime entra si además `(anime + 1) ≤ 0,20·(total + 1)`. Sin esto
 *    el total cerraría en 20% pero la primera página podía ser mitad anime.
 *
 * Un anime rechazado se DESCARTA, no se posterga: postergarlo lo movería a otra
 * fecha y rompería el orden cronológico, y reintentarlo más adelante lo haría
 * aparecer en dos páginas distintas. La lista queda más corta, que es lo que
 * corresponde — rellenar con más anime violaría el tope en silencio.
 *
 * ⚠️ LAS DOS MITADES PUEDEN TIRAR PARA LADOS DISTINTOS, y el resultado es que el
 * anime MÁS popular de todos puede quedar afuera. El cupo global mira
 * popularidad; el recorrido mira el orden cronológico y se va gastando. Si los
 * anime buenos están al final de la agenda, los del medio consumen el tope
 * primero. Trazado con 10 fechas de un anime cada una y el cupo en 5: entran los
 * de los días 6 a 9 y el del día 10 —el más popular— se rechaza, porque para
 * cuando llega ya hay 4 anime y `5 ≤ 0,20·23` es falso.
 *
 * Lo que SÍ queda garantizado, y es lo que importa: sólo los del cupo son
 * elegibles, así que **ningún anime de baja popularidad entra nunca**. En el
 * trazado, los días 1 a 5 no tienen ninguna chance.
 *
 * Se evaluó corregirlo con un intercambio —al rechazar uno, sacar a un admitido
 * menos popular de más atrás— y es correcto (quitar un anime temprano relaja
 * todos los prefijos, así que el tope se sigue cumpliendo). **No se implementó**
 * porque los datos reales no lo ejercitan: en la agenda del 2026-09-04 entran 6
 * anime en 97 elementos, un 6,2% contra el 20% permitido, así que el tope de
 * prefijo casi nunca aprieta. Sería complejidad para un caso que no ocurre.
 *
 * ⚠️ El tope del 20% NO es lo que baja el ruido, y conviene no atribuirle una
 * mejora ajena. Medido sobre la agenda del 2026-09-04: el cupo por fecha SOLO,
 * sin ningún tope de anime, ya deja la lista en 10,5% de anime; con el tope
 * queda en 6,2%. El tope saca unos pocos títulos y su valor real es ser una
 * GARANTÍA: el día que TMDB publique una tanda grande de estrenos de anime, la
 * sección no se convierte en un catálogo de Crunchyroll.
 */
export function seleccionarProximamente(items: UIUpcoming[]): UIUpcoming[] {
  // Dedup por `tipo:id` antes que nada. Hoy la tabla no trae repetidos (el sync
  // guarda sólo el próximo episodio de cada serie), así que esto es una guarda:
  // si algún día los trae, el cupo por fecha no puede gastar dos lugares en el
  // mismo título.
  const vistos = new Set<string>();
  const unicos: UIUpcoming[] = [];
  for (const i of items) {
    const c = clave(i);
    if (vistos.has(c)) continue;
    vistos.add(c);
    unicos.push(i);
  }

  const elegidos = cupoPorFecha(unicos);

  const noAnime = elegidos.filter((i) => !esAnime(i)).length;
  const cupoAnime = Math.floor(noAnime * TOPE_ANIME / (1 - TOPE_ANIME));
  const permitidos = new Set(
    elegidos.filter(esAnime).sort(porRelevancia).slice(0, cupoAnime).map(clave),
  );

  const salida: UIUpcoming[] = [];
  let anime = 0;
  for (const i of [...elegidos].sort(ordenCronologico)) {
    if (!esAnime(i)) { salida.push(i); continue; }
    if (!permitidos.has(clave(i))) continue;
    if (anime + 1 > TOPE_ANIME * (salida.length + 1)) continue;
    salida.push(i);
    anime++;
  }
  return salida;
}

/**
 * Una página de la selección.
 *
 * `hayMas` sale de la longitud de la selección, no de si la página vino llena.
 * Es la misma lección que dejó `/lista/miniseries`: cortar por "vinieron menos
 * de 20" es un bug silencioso en cuanto algo pueda achicar una página.
 */
export function paginarProximamente(
  seleccion: UIUpcoming[],
  pagina: number,
  porPagina: number,
): { items: UIUpcoming[]; hayMas: boolean; total: number } {
  const p = Number.isFinite(pagina) && pagina >= 1 ? Math.floor(pagina) : 1;
  const desde = (p - 1) * porPagina;
  return {
    items: seleccion.slice(desde, desde + porPagina),
    hayMas: desde + porPagina < seleccion.length,
    total: seleccion.length,
  };
}
