import { PAGINAS_LEGALES, TMDB } from "@/lib/legal";

// "Sobre Yump": la sección legal.
//
// Junta lo que una revisión de Google Play pide tener a la vista: las cuatro
// páginas públicas, la atribución de TMDB, la autoría de las ilustraciones y el
// aviso de que Yump no está afiliado a las plataformas.
//
// ⚠️ SE MONTA EN DOS LADOS, Y NO ES UNA DUPLICACIÓN POR DESCUIDO. Su lugar
// conceptual es Perfil, pero `/cuenta/perfil` **redirige a `/cuenta` cuando no
// hay sesión**: montada sólo ahí, nadie sin cuenta podría leer la información
// legal, que es justo lo que Play exige que se pueda consultar. Por eso va
// también en la pestaña **Cuenta**, que sin sesión muestra el login — y ahí el
// `OnboardingGate` no interviene, porque sale temprano cuando no hay usuario.
//
// LAS CUATRO PÁGINAS VIVEN EN `yump.ar`, no dentro de la app: las prepara el
// dueño. Por eso son enlaces externos y no rutas de Next. Los datos y su
// contrato están en `lib/legal.ts`.

const externo = { target: "_blank", rel: "noopener noreferrer" } as const;

export default function SobreYump() {
  return (
    <section className="sy" aria-labelledby="sy-tit">
      <h2 className="sy-tit" id="sy-tit">Sobre Yump</h2>

      <ul className="sy-links">
        {PAGINAS_LEGALES.map((p) => (
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
        <a href={TMDB.SITIO} {...externo} aria-label="The Movie Database (TMDB)">
          <img src={TMDB.LOGO} alt="The Movie Database (TMDB)" width={92} height={12} />
        </a>
        {/* El texto obligatorio, LITERAL y legible. Estuvo en 11.5px y en el
            color más tenue de la paleta, que además no cumple contraste AA (ver
            issue #2): una atribución que hay que buscar con lupa no cumple el
            requisito de ser prominente. Ahora va en 13.5px y en el color de
            texto normal. */}
        <p className="sy-tmdb-req" lang="en">{TMDB.TEXTO}</p>
        {/* Sólo de dónde salen los datos. La segunda oración que había acá —"el
            texto de arriba es el que TMDB exige mostrar"— le hablaba a quien
            audita la app, no a quien la usa: era una nota interna en pantalla, y
            TMDB no la pide. */}
        <p className="sy-tmdb-txt">Los datos de películas y series salen de TMDB.</p>
      </div>
    </section>
  );
}
