// "Sobre Yump": la sección legal dentro de Perfil.
//
// Junta lo que una revisión de Google Play pide tener a la vista y que hasta
// ahora no estaba en ningún lado: las cuatro páginas públicas, la atribución de
// TMDB, la autoría de las ilustraciones y el aviso de que Yump no está afiliado
// a las plataformas.
//
// LAS CUATRO PÁGINAS VIVEN EN EL DOMINIO PRINCIPAL, no dentro de la app: las
// prepara el dueño en `yump.ar`. Por eso son enlaces externos y no rutas de
// Next. Si alguna todavía no responde, el enlace lleva a un 404 — hay que
// verificarlas antes de desplegar esto a Producción.
const PAGINAS = [
  { href: "https://yump.ar/acerca-de", texto: "Acerca de Yump" },
  { href: "https://yump.ar/privacidad", texto: "Política de privacidad" },
  { href: "https://yump.ar/terminos", texto: "Términos y condiciones" },
  { href: "https://yump.ar/eliminar-cuenta", texto: "Eliminar mi cuenta" },
];

const externo = { target: "_blank", rel: "noopener noreferrer" } as const;

export default function SobreYump() {
  return (
    <section className="sy" aria-labelledby="sy-tit">
      <h2 className="sy-tit" id="sy-tit">Sobre Yump</h2>

      <ul className="sy-links">
        {PAGINAS.map((p) => (
          <li key={p.href}>
            <a href={p.href} {...externo}>
              {p.texto}
              {/* El ícono de "se abre afuera" es decorativo: el nombre accesible
                  ya lo pone el texto del enlace. */}
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
              </svg>
            </a>
          </li>
        ))}
      </ul>

      {/* --- Independencia -------------------------------------------------- */}
      <p className="sy-p">
        <strong>Yump es un agregador independiente.</strong> No está afiliado, asociado ni
        respaldado por Netflix, Disney+, Max, Prime Video, Apple TV+, Crunchyroll ni ninguna
        otra plataforma. No reproduce sus contenidos: sólo indica dónde está disponible cada
        título y te lleva a la plataforma correspondiente. Los nombres de las plataformas se
        usan únicamente para identificarlas y pertenecen a sus titulares.
      </p>

      {/* --- Autoría de las ilustraciones ----------------------------------- */}
      <h3 className="sy-sub">Los avatares</h3>
      <p className="sy-p">
        Los avatares de <strong>Pajaritos</strong> están basados en personajes originales
        creados por Juan Facundo Galíndez y adaptados en 3D para Yump. Conocé la tira en{" "}
        <a href="https://www.instagram.com/pajaritos.web/" {...externo}>@pajaritos.web</a>.
      </p>
      <p className="sy-p">
        <strong>Don Tito</strong> es la mascota de Yump, un personaje original creado para la
        app.
      </p>
      <p className="sy-p">El resto de las ilustraciones también son propias de Yump.</p>
      <p className="sy-p sy-c">© Juan Facundo Galíndez. Todos los derechos reservados.</p>

      {/* --- Atribución de TMDB ---------------------------------------------
          Va ÚLTIMA y en tamaño menor a propósito: la atribución tiene que estar
          a la vista, pero con menos prominencia que la identidad de Yump. El
          logo se sirve LOCAL (`/brand/tmdb.svg`, el oficial descargado de TMDB),
          no desde un dominio de terceros.

          EL TEXTO ESTÁ EN INGLÉS Y NO SE TRADUCE NI SE PARAFRASEA: es el que
          exige la sección 3 de los términos de la API de TMDB, palabra por
          palabra. Debajo va una aclaración en castellano, separada, que no lo
          reemplaza. -------------------------------------------------------- */}
      <div className="sy-tmdb">
        <a href="https://www.themoviedb.org/" {...externo} aria-label="The Movie Database (TMDB)">
          <img src="/brand/tmdb.svg" alt="The Movie Database (TMDB)" width={92} height={12} />
        </a>
        <p className="sy-tmdb-txt" lang="en">
          This application uses TMDB and the TMDB APIs but is not endorsed, certified, or
          otherwise approved by TMDB.
        </p>
        <p className="sy-tmdb-txt">
          Los datos de películas y series salen de TMDB. El texto de arriba es el que TMDB
          exige mostrar, tal cual.
        </p>
      </div>
    </section>
  );
}
