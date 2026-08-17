"use client";
import Shelf from "./Shelf";
import ShelfSkeleton from "./ShelfSkeleton";
import IndecisoHero from "./IndecisoHero";
import DesempateBanner from "./desempate/DesempateBanner";
import RuletaBanner from "./ruleta/RuletaBanner";
import UpcomingSection from "./upcoming/UpcomingSection";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { useApi } from "./useApi";
import { usePlatforms } from "./PlatformsContext";
import { useHomeTypes } from "@/hooks/useHomeTypes";
import type { HomePayload } from "@/lib/home";

// El Home se arma entero en el server (lib/home.ts): un solo fetch a /api/home
// devuelve el hero y todos los rieles ya deduplicados y en orden. Los rieles son
// presentacionales (Shelf en modo controlado). "Próximamente" y "Desempatá"
// quedan fuera del composer a propósito: no reservan ni se filtran.
// Cuántos rieles devuelve el composer (lib/home.ts): últimos lanzamientos, los
// dos de votos, los 6 de género y los 2 de audiencia. Solo se usa para saber
// cuántos placeholders pintar mientras llega el payload.
const RIELES = 11;

export default function CatalogView() {
  const online = useOnline();
  const { platforms } = usePlatforms();
  const { types, setType, param, ready } = useHomeTypes();

  const { data, loading, offline, error, retry } = useApi<HomePayload>(
    // `fresh=1` SOLO en el primer reintento manual, no en todos. El payload
    // degradado ahora se guarda unos minutos (para que una caída de TMDB no
    // dispare un rearmado completo por request), así que sin esto "Reintentar"
    // devolvería la misma foto rota que el usuario ya está mirando.
    //
    // De un solo uso, como REFUERZO: la defensa de verdad está en el server,
    // que solo concede el rearmado si lo guardado está degradado y hay turno
    // (ver lib/home-refresco.ts). Nada impide pedir la URL a mano, así que esto
    // no es lo que protege la cuota — solo evita que insistir con el botón se
    // convierta en una ráfaga desde nuestra propia interfaz.
    (reintentos) => (ready
      ? `/api/home?providers=${platforms.join(",")}&t=${param}${reintentos === 1 ? "&fresh=1" : ""}`
      : ""),
    [param, ready],
    // Único consumidor que necesita conservar los rieles ya visibles cuando
    // un refetch (toggle Películas/Series) falla — ver comentario en useApi.
    { keepPrevious: true },
  );

  const rails = data?.rails ?? [];
  // Contenido = TARJETAS, no rieles. `rails.length > 0` era siempre true: el
  // composer devuelve los 11 rieles siempre, vacíos incluidos (cada fuente que
  // se cae se degrada a []). Con ese criterio el aviso de fallo era inalcanzable
  // y una caída total de TMDB se veía como un Home legítimamente vacío.
  const hayContenido = rails.some((r) => r.items.length > 0) || (data?.hero?.length ?? 0) > 0;
  // El server distingue "no elegiste plataformas" (payload vacío legítimo, 200)
  // de "se cayó la carga". Sin esto, el Home sin plataformas mostraba "No pudimos
  // cargar el inicio" con un botón de reintentar que nunca podía arreglarlo.
  const sinPlataformas = !!data?.sinPlataformas;
  // 200 pero con fuentes caídas: el Home llegó incompleto. No es "no hay nada en
  // tus plataformas" — es un fallo de carga y reintentar SÍ puede arreglarlo.
  const degradado = !!data?.degradado;
  // `error` = el server respondió 500 (composeHome se cayó). `offline` = no hubo
  // respuesta. `degradado` = respondió 200 pero le faltan fuentes. Los tres
  // ameritan el mismo aviso con reintento, así que se tratan juntos.
  const fallo = !online || offline || error || degradado;
  // Tres condiciones y ninguna sobra:
  //  - `!ready`: useHomeTypes todavía no leyó los toggles, así que no hay URL
  //    que pedir. La espera por las PLATAFORMAS ya no se chequea acá: la cubre
  //    `loading`, que useApi mantiene en true hasta que PlatformsContext leyó
  //    localStorage.
  //  - `loading`: el fetch en vuelo.
  //  - `!data && !fallo`: useApi enciende `loading` dentro de un efecto, así que
  //    existe un render con todo listo, `loading` todavía en false y `data` sin
  //    llegar. Es el mismo criterio que usa el hero con `heroPendiente`.
  //
  // Sin el tercero el Home pintaba por un frame "No pudimos cargar el inicio"
  // con la app perfectamente sana. Con el bloque de carga de 24px pasaba
  // desapercibido; con los rieles reservados el documento colapsaba de 6730px a
  // 1708px y se llevaba puesto el scroll recién restaurado.
  const cargando = !ready || loading || (!data && !fallo);

  // Pantalla completa SOLO cuando no hay nada que mostrar todavía. Si ya hay
  // rieles, un fallo de refetch no borra el Home: se avisa arriba y se ofrece
  // reintentar (abajo).
  if (!hayContenido && !cargando && (!online || offline)) {
    return <div className="wrap"><OfflineState onRetry={retry} /></div>;
  }

  return (
    <>
      <IndecisoHero
        initialItems={data?.hero}
        heroPendiente={!data && !fallo}
        // Con el hero caído, "Nada en tus plataformas" es mentira: el usuario
        // TIENE plataformas y lo que falló fue la carga.
        cargaDegradada={degradado}
      />
      <div className="wrap">
        <RuletaBanner />
        <DesempateBanner />
        <UpcomingSection />

        {fallo && hayContenido && (
          <p className="empty-note home-retry" role="status">
            {degradado && online && !offline && !error
              ? "No pudimos cargar todo el inicio."
              : "No pudimos actualizar el inicio."}{" "}
            <button className="up-retry" onClick={retry}>Reintentar</button>
          </p>
        )}

        {!hayContenido ? (
          cargando ? (
            // Un riel de placeholder por cada uno que va a llegar: el composer
            // devuelve siempre 11. Con el "Cargando…" suelto el documento medía
            // 1688px en vez de 6275, y eso no era solo CLS — rompía la
            // restauración de scroll al volver de una ficha (ver ShelfSkeleton).
            // Los 3 sin toggle son "Últimos lanzamientos" y los dos de audiencia.
            <div className="home-rails">
              {Array.from({ length: RIELES }).map((_, i) => (
                <ShelfSkeleton key={i} conToggle={i !== 0 && i < RIELES - 2} />
              ))}
            </div>
          ) : sinPlataformas ? (
            // No es un fallo de carga y reintentar no lo arregla: el Home está
            // vacío porque no hay ninguna plataforma elegida. Este es el ÚNICO
            // caso en el que corresponde pedirle al usuario que active algo, y
            // por eso el texto está gateado por `sinPlataformas` — IndecisoHero
            // aplica la misma regla con `MotivoVacio` (ver lib/types.ts).
            <p className="empty-note" role="status">
              Nada en tus plataformas. Activá alguna en el botón de arriba.
            </p>
          ) : (
            // El payload llegó (o falló) y no hay un solo riel: antes esto era una
            // pantalla vacía y muda.
            <p className="empty-note home-retry" role="status">
              No pudimos cargar el inicio.{" "}
              <button className="up-retry" onClick={retry}>Reintentar</button>
            </p>
          )
        ) : (
          // Durante un refetch con contenido en pantalla, los rieles se atenúan y
          // no aceptan clicks: el toggle tarda lo que tarde composeHome y sin esto
          // no pasaba nada visible.
          <div className={`home-rails${cargando ? " is-refreshing" : ""}`} aria-busy={cargando}>
            {/* Con carga degradada, un riel vacío no es "no hay nada de acción
                en tus plataformas": es una fuente que se cayó. Se ocultan y el
                aviso de arriba explica lo que pasó. */}
            {(degradado ? rails.filter((r) => r.items.length > 0) : rails).map((r) => {
              const sk = r.shelfKey;
              return (
                <Shelf
                  key={r.key}
                  items={r.items}
                  title={r.title}
                  genre={r.genre}
                  seeAllHref={r.seeAllHref}
                  typeToggle={r.typeToggle}
                  shelfKey={sk}
                  // El tipo del cliente gana mientras vuelve el payload nuevo, así
                  // el toggle se ve aplicado de inmediato y no rebota al valor viejo.
                  initialType={(sk && types[sk]) || r.activeType}
                  // Solo los rieles "refetch" rearman el Home. Los "filter" filtran
                  // en cliente: pedir /api/home de nuevo devolvería lo mismo.
                  onTypeChange={
                    r.typeToggle === "refetch" && sk ? (t) => setType(sk, t) : undefined
                  }
                  // Los rieles de votos se muestran con un solo título. En los
                  // demás el tope lo pone el algoritmo de relleno, así que menos
                  // de 2 significa que algo falló; en estos lo pone cuánta gente
                  // votó, y esconder el único votado es peor que mostrarlo solo.
                  minItems={r.key === "mas-votados" || r.key === "hacete-cargo" ? 1 : undefined}
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
