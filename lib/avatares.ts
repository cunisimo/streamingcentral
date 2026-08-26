// Los avatares de Yump: catálogo local y resolución.
//
// FUENTE ÚNICA DE VERDAD. Todo lo que muestre un avatar pasa por acá. No hay
// ninguna otra lista, ni en tests ni en componentes: `lib/avatares.test.ts`
// descubre los archivos de `public/avatars/` y los compara contra este catálogo,
// así que un archivo nuevo o borrado rompe el test en vez de aparecer o
// desaparecer en silencio.
//
// SON RECURSOS PROPIOS, en tres grupos. NUEVE personajes de la tira Pajaritos,
// creaciones originales de Juan Facundo Galíndez adaptadas en 3D para Yump;
// DON TITO, que es la mascota y personaje original de la app y NO es de
// Pajaritos; y el resto de las ilustraciones, también propias.
//
// No hay librería de terceros ni conexión saliente para generar o servir un
// avatar: los WebP salen del propio origen. Antes esto era una URL a
// `api.dicebear.com` construida con la semilla del perfil, o sea un
// identificador seudónimo viajando a un tercero en cada render.
//
// Precisión que importa para el formulario de Data Safety: la semilla SÍ se
// recopila y se guarda en Supabase, que actúa como proveedor de servicio —
// recopilado, NO compartido. Lo que desapareció es el envío a un tercero.
//

/**
 * FNV-1a sobre la cadena. El mismo algoritmo que `dailySeed` en `lib/fecha.ts`,
 * y por el mismo motivo: es determinístico y no depende de nada del entorno, así
 * que la misma semilla da el mismo número en el servidor, en el navegador y en
 * cualquier dispositivo. Se exporta para poder probarlo directo.
 */
export function hashCadena(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Agrupación por ORIGEN, y acá sí importa la autoría:
 *
 *  - `pajaritos` — los NUEVE personajes de la tira Pajaritos, creaciones
 *    originales de Juan Facundo Galíndez, adaptadas en 3D para Yump.
 *  - `yump` — **Don Tito**, mascota y personaje original de la app. NO es de
 *    Pajaritos: se creó específicamente para Yump, así que no le corresponde el
 *    enlace a @pajaritos.web.
 *  - `criaturas` y `objetos` — el resto de las ilustraciones propias.
 */
export type CategoriaAvatar = "pajaritos" | "yump" | "criaturas" | "objetos";

export interface Avatar {
  /** Identificador estable. Es lo que se guarda en `profiles.avatar_seed`. */
  readonly id: string;
  /** Ruta local. SIEMPRE sale de este archivo, nunca se arma con texto de la base. */
  readonly src: string;
  /** Nombre legible, apto para `aria-label`. */
  readonly nombre: string;
  readonly categoria: CategoriaAvatar;
}

/** El estilo que identifica a un avatar propio en `profiles.avatar_style`. */
export const ESTILO_YUMP = "yump";

const ruta = (id: string) => `/avatars/avatar-${id}.webp`;

const def = (id: string, nombre: string, categoria: CategoriaAvatar): Avatar =>
  ({ id, src: ruta(id), nombre, categoria });

/**
 * Los 31 avatares, en ORDEN EXPLÍCITO Y ESTABLE. El orden es el de la grilla:
 * primero los personajes con nombre, después las criaturas, después los objetos.
 *
 * Agregar uno nuevo va AL FINAL de su grupo. Lo que no se puede hacer es
 * reordenar ni renombrar un id existente: el id vive en la base de datos de cada
 * persona que ya eligió su avatar.
 */
export const AVATARES: readonly Avatar[] = Object.freeze([
  // --- Personajes con nombre propio -----------------------------------------
  // Nueve de Pajaritos y uno de Yump. El ORDEN no se toca: sacar a Don Tito de
  // acá le cambiaría la posición y con eso el orden de la grilla, aunque su
  // categoría sea otra.
  def("buitracio", "Buitracio", "pajaritos"),
  def("buitracia", "Buitracia", "pajaritos"),
  def("coco", "Coco", "pajaritos"),
  // Don Tito es la MASCOTA DE YUMP, no un personaje de Pajaritos. El id técnico
  // `dontito` se conserva porque vive en `profiles.avatar_seed` y en LEGADO_V1;
  // lo que cambia es el nombre visible y la categoría.
  def("dontito", "Don Tito", "yump"),
  def("fini", "Fini", "pajaritos"),
  def("jipi", "Jipi", "pajaritos"),
  def("juanpalomo", "Juan Palomo", "pajaritos"),
  def("lola", "Lola", "pajaritos"),
  def("pocho", "Pocho", "pajaritos"),
  def("rico", "Rico", "pajaritos"),
  // --- Criaturas ------------------------------------------------------------
  def("cat", "Gato", "criaturas"),
  def("monster", "Monstruo", "criaturas"),
  def("witch", "Bruja", "criaturas"),
  def("bot", "Robot", "criaturas"),
  def("astronauta", "Astronauta", "criaturas"),
  // --- Objetos --------------------------------------------------------------
  def("tv", "Televisor", "objetos"),
  def("reproductor", "Reproductor", "objetos"),
  def("control", "Control remoto", "objetos"),
  def("claqueta", "Claqueta", "objetos"),
  def("ticket", "Entrada de cine", "objetos"),
  def("popcorn", "Pochoclos", "objetos"),
  def("sillon", "Sillón", "objetos"),
  def("auriculares", "Auriculares", "objetos"),
  def("book", "Libro", "objetos"),
  def("lupa", "Lupa", "objetos"),
  def("brujula", "Brújula", "objetos"),
  def("crown", "Corona", "objetos"),
  def("pocion", "Poción", "objetos"),
  def("rocket", "Cohete", "objetos"),
  def("planet", "Planeta", "objetos"),
  def("moon", "Luna", "objetos"),
]);

/** Índice por id. Es la ÚNICA forma de convertir texto de la base en una ruta. */
const POR_ID: ReadonlyMap<string, Avatar> = new Map(AVATARES.map((a) => [a.id, a]));

/** El que se muestra cuando no hay absolutamente nada de donde agarrarse. */
export const AVATAR_POR_DEFECTO: Avatar = AVATARES[0];

/**
 * EL CONJUNTO CONGELADO DEL MAPEO LEGADO.
 *
 * Los perfiles viejos guardan una semilla de DiceBear (un uuid) y el estilo
 * `adventurer-neutral`. A cada uno se le asigna un avatar local de forma
 * determinística, para que la misma persona vea siempre el mismo dibujo en
 * todos sus dispositivos sin que haya que escribir nada en la base.
 *
 * ESTA LISTA NO SE TOCA NUNCA MÁS. Si mañana se agregan avatares al catálogo y
 * el mapeo usara `AVATARES`, cambiaría el módulo del hash y **todos los perfiles
 * viejos verían otro avatar de un día para el otro**. Por eso el conjunto del
 * mapeo está congelado y versionado aparte: `AVATARES` puede crecer libremente,
 * `LEGADO_V1` no.
 *
 * Si alguna vez hiciera falta cambiarlo, se agrega `LEGADO_V2` y se decide
 * explícitamente a quién se le aplica — no se edita esto.
 */
export const LEGADO_V1: readonly string[] = Object.freeze([
  "buitracio", "buitracia", "coco", "dontito", "fini", "jipi", "juanpalomo",
  "lola", "pocho", "rico", "cat", "monster", "witch", "bot", "astronauta",
  "tv", "reproductor", "control", "claqueta", "ticket", "popcorn", "sillon",
  "auriculares", "book", "lupa", "brujula", "crown", "pocion", "rocket",
  "planet", "moon",
]);

export interface PerfilAvatar {
  avatar_style?: string | null;
  avatar_seed?: string | null;
}

/**
 * Qué avatar le corresponde a un perfil. **Siempre devuelve uno del catálogo.**
 *
 * Tres caminos, en orden:
 *
 *  1. Estilo `yump` + un id que existe → ese avatar. Es la elección explícita.
 *  2. Cualquier otra cosa CON semilla → mapeo determinístico sobre `LEGADO_V1`.
 *     Acá caen los perfiles de DiceBear, los estilos desconocidos y las
 *     semillas que no son ids válidos.
 *  3. Sin semilla utilizable → `AVATAR_POR_DEFECTO`.
 *
 * NUNCA construye una ruta con texto de la base. La semilla sólo se usa para
 * buscar en un índice o para calcular un número: no se interpola en `src` bajo
 * ninguna circunstancia. Por eso `../`, `https://otro.com/x.png` o
 * `avatar-x.webp` no pueden salir de acá — salen convertidos en uno de los 31.
 *
 * Es una función PURA: no escribe en la base ni dispara efectos. La base se
 * actualiza sólo cuando la persona elige un avatar (ver `updateAvatar`).
 */
export function resolverAvatar(p: PerfilAvatar | null | undefined): Avatar {
  const seed = typeof p?.avatar_seed === "string" ? p.avatar_seed.trim() : "";
  const style = typeof p?.avatar_style === "string" ? p.avatar_style.trim() : "";

  if (style === ESTILO_YUMP) {
    const elegido = POR_ID.get(seed);
    if (elegido) return elegido;
  }

  if (!seed) return AVATAR_POR_DEFECTO;

  const i = hashCadena(seed) % LEGADO_V1.length;
  // El id sale de la lista congelada, así que POR_ID siempre lo tiene. El `??`
  // es la red por si alguien borra un avatar del catálogo sin tocar LEGADO_V1 —
  // que es justamente lo que el test de sincronía impide.
  return POR_ID.get(LEGADO_V1[i]) ?? AVATAR_POR_DEFECTO;
}

/** Atajo para la interfaz: la ruta que va en el `src` de un `<img>`. */
export const rutaAvatar = (p: PerfilAvatar | null | undefined): string =>
  resolverAvatar(p).src;
