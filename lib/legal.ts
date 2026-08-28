// Los datos de la sección legal: las cuatro páginas públicas y la atribución de
// TMDB.
//
// Están acá y no dentro del componente porque los consume MÁS DE UNA pantalla
// —Perfil y la pestaña Cuenta, ésta última **sin sesión**— y porque son un
// contrato que conviene poder probar: que las URLs sean las cuatro acordadas y
// que el texto de TMDB esté palabra por palabra.

export interface PaginaLegal {
  readonly href: string;
  readonly texto: string;
}

/**
 * Las cuatro páginas públicas, en `yump.ar`. **Las prepara el dueño**: no son
 * rutas de esta app y por eso son enlaces externos.
 *
 * Van con la barra final: `yump.ar/acerca-de` responde 301 a
 * `yump.ar/acerca-de/`, así que la forma canónica ahorra un salto.
 */
export const PAGINAS_LEGALES: readonly PaginaLegal[] = Object.freeze([
  { href: "https://yump.ar/acerca-de/", texto: "Acerca de Yump" },
  { href: "https://yump.ar/privacidad/", texto: "Política de privacidad" },
  { href: "https://yump.ar/terminos/", texto: "Términos y condiciones" },
  { href: "https://yump.ar/eliminar-cuenta/", texto: "Eliminar mi cuenta" },
]);

/**
 * La atribución de TMDB.
 *
 * ⚠️ `TEXTO` ES LITERAL Y NO SE TOCA. Es el que exige la **sección 3
 * (Attribution)** de los términos de la API de TMDB, con el corchete resuelto
 * como "application". No se traduce, no se resume y no se reescribe: si se
 * modifica, deja de ser la atribución que piden.
 *
 * El logo se sirve **local**: es el oficial descargado de TMDB, no una petición
 * a un dominio de terceros en cada render.
 */
export const TMDB = Object.freeze({
  TEXTO: "This application uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.",
  LOGO: "/brand/tmdb.svg",
  SITIO: "https://www.themoviedb.org/",
});
