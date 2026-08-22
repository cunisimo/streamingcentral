"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { estaAsentada, nuevaGeneracion, registrarListo } from "@/hooks/categoria-generaciones";
import { consumirVuelta, guardarVista, leerVista, olvidarLista } from "@/hooks/lista-paginada-store";
import Shelf from "./Shelf";
import OfflineState from "./pwa/OfflineState";
import { useOnline } from "@/hooks/useOnline";
import { CATEGORIES, resolveCategory, CROSS_PHRASE } from "@/lib/categories";
import type { MediaType } from "@/lib/types";

export default function CategoryView({
  slug, label, initialTipo,
}: {
  slug: string; label: string; initialTipo: MediaType;
}) {
  // EL TIPO VIVE EN LA URL, no solo en el estado. La página ya lo leía de
  // `?tipo=` para el render del servidor, pero el toggle nunca la tocaba: al
  // volver de una ficha la ruta no tenía `?tipo=tv` y la vista se rearmaba en
  // Películas, cambiando de contenido sin que nadie lo pidiera.
  //
  // `replaceState` y no `push`: tocar el toggle no puede agregar un paso al
  // botón Atrás. Volver de una ficha tiene que llevar a la categoría, no a la
  // misma categoría con el otro tipo.
  const [tipo, setTipo] = useState<MediaType>(initialTipo);
  const ruta = usePathname();
  const clave = `categoria:${slug}`;

  const cambiarTipo = useCallback((t: MediaType) => {
    if (t === tipo) return;
    setTipo(t);
    const url = t === "tv" ? `${window.location.pathname}?tipo=tv` : window.location.pathname;
    window.history.replaceState(window.history.state, "", url);
    // Cambio deliberado: lista nueva, snapshot viejo a la basura y arriba de todo.
    olvidarLista(clave);
    window.scrollTo(0, 0);
  }, [tipo, clave]);

  const online = useOnline();
  const [fetchFailed, setFetchFailed] = useState(false);
  const reportOffline = useCallback(() => setFetchFailed(true), []);
  const sinDatos = !online || fetchFailed;

  // id-set de un rule (géneros y keywords en namespaces separados).
  const idSet = (r: { genres?: number[]; keywords?: number[] }) =>
    new Set([...(r.genres ?? []).map((g) => `g${g}`), ...(r.keywords ?? []).map((k) => `k${k}`)]);

  // Cruces: el principal × cada otra categoría (salvo el propio y documental).
  // Para el TIPO ACTUAL se excluye todo cruce cuyo set combinado (principal ∪ cruce)
  // (a) no aporte ningún id nuevo respecto del principal —daría el mismo pool que
  // "Populares"— o (b) ya haya salido en otro cruce. Ej. en TV: Aventura colapsa a
  // Acción (10759), y Drama/Romance colapsan entre sí (18); se deja solo el primero.
  const primaryIds = idSet(resolveCategory(slug, tipo));
  const seenCombos = new Set<string>();
  const crosses = CATEGORIES.filter((c) => {
    if (c.slug === slug || c.slug === "documental") return false;
    const combined = new Set(primaryIds);
    for (const id of idSet(resolveCategory(c.slug, tipo))) combined.add(id);
    if (combined.size === primaryIds.size) return false; // no aporta id nuevo
    const key = [...combined].sort().join(",");
    if (seenCombos.has(key)) return false;               // cruce duplicado de otro
    seenCombos.add(key);
    return true;
  });

  // --- Cuándo devolver el scroll -------------------------------------------
  // Recién cuando TODOS los rieles de la generación actual se asentaron. Con el
  // primero no alcanza: los que faltan siguen cambiando la altura y el scroll
  // aterriza en un documento que todavía va a crecer. Medido el 22/08 sin esto:
  // volver a /categoria/accion con 1400 de scroll dejaba la página en 2488,
  // sobre el otro tipo y con 5151 px de alto en vez de 4277.
  const esperados = 1 + crosses.length;   // el riel "Populares" + los cruces
  const genRef = useRef(0);
  const [gen, setGen] = useState(() => nuevaGeneracion(0, esperados));
  const pendiente = useRef<number | null>(null);
  const decidido = useRef(false);

  // Al cambiar de tipo arranca una generación nueva y los avisos de la anterior
  // dejan de contar (`registrarListo` los descarta por número).
  //
  // SALTEA EL PRIMER MONTAJE. Los efectos de los hijos corren ANTES que los del
  // padre, así que los rieles ya avisaron cuando este efecto se ejecuta: crear
  // una generación acá borraría esos avisos y, como cada riel avisa una sola
  // vez, la generación nueva no se completaría nunca. La página quedaba sin
  // restaurar y `scrollRestoration` en "manual" para siempre.
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    genRef.current += 1;
    setGen(nuevaGeneracion(genRef.current, esperados));
  }, [tipo, esperados]);

  const avisarListo = useCallback((g: number) => {
    setGen((prev) => registrarListo(prev, g));
  }, []);

  // La decisión de restaurar, una sola vez al montar.
  //
  // EL TIPO SALE DEL SNAPSHOT, NO DE LA URL, y eso no es redundancia con el
  // `?tipo=tv`. Al volver atrás, Next NO vuelve a ejecutar el componente de
  // servidor: sirve el RSC que tiene cacheado, que es el de la URL con la que se
  // entró —sin `?tipo=`—. Medido: la barra decía `?tipo=tv` y la vista se
  // rendereaba en Películas igual. El `replaceState` sigue valiendo para que la
  // URL sea compartible y para que una entrada NUEVA abra en el tipo correcto;
  // lo que devuelve el tipo al volver es esto.
  //
  // Y `history.scrollRestoration` pasa a "manual" mientras tengamos una
  // restauración pendiente: si no, el navegador también restaura —a su propia
  // memoria, medida en 3032 cuando lo guardado eran 1400— y como corre después,
  // gana él.
  useEffect(() => {
    if (decidido.current) return;
    decidido.current = true;
    if (consumirVuelta(ruta)) {
      const e = leerVista<{ tipo: MediaType }>(clave, "");
      if (e) {
        pendiente.current = e.scrollY;
        if (e.datos?.tipo) setTipo(e.datos.tipo);
        try { history.scrollRestoration = "manual"; } catch { /* no soportado */ }
      }
    } else {
      olvidarLista(clave);
    }
  }, [ruta, clave]);

  // Red de seguridad: si la vista se desmonta con la restauración todavía
  // pendiente —el usuario se fue antes de que se asentara—, `scrollRestoration`
  // tiene que volver a "auto". Si no, queda en "manual" para TODA la sesión y
  // el resto de la app pierde la restauración nativa del navegador.
  useEffect(() => () => {
    try { history.scrollRestoration = "auto"; } catch { /* no soportado */ }
  }, []);

  useEffect(() => {
    if (!estaAsentada(gen) || pendiente.current === null) return;
    const y = pendiente.current;
    pendiente.current = null;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo(0, y);
      // Devuelto el control al navegador: fuera de esta vuelta, su restauración
      // nativa sigue siendo la correcta para el resto de la app.
      try { history.scrollRestoration = "auto"; } catch { /* ídem */ }
    }));
  }, [gen]);

  // Guardar la posición. No hay items que guardar —los rieles se rearman solos y
  // el contenido lo fija la URL—, así que el snapshot es solo el scroll.
  useEffect(() => {
    let pend = false;
    // Se guarda YA, sin esperar un evento de scroll: si el usuario entra, no
    // scrollea y abre una ficha, igual tiene que volver con el tipo correcto.
    guardarVista<{ tipo: MediaType }>(clave, { firma: "", datos: { tipo }, scrollY: window.scrollY });
    const onScroll = () => {
      if (pend) return;
      pend = true;
      requestAnimationFrame(() => {
        pend = false;
        // `datos` lleva el tipo y NO es null a propósito: `leerVista` descarta
        // los snapshots sin datos, así que guardar `null` era guardar nada.
        guardarVista<{ tipo: MediaType }>(clave, { firma: "", datos: { tipo }, scrollY: window.scrollY });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [clave, tipo]);

  const genActual = gen.gen;

  return (
    <div className="wrap">
      <div className="compact-head">
        <h1>{label}</h1>
        <p className="sub">Explorá {label.toLowerCase()} en tus plataformas</p>
      </div>
      <div className="tipo-toggle" role="tablist">
        <button role="tab" aria-selected={tipo === "movie"} className={`tt ${tipo === "movie" ? "on" : ""}`} onClick={() => cambiarTipo("movie")}>Películas</button>
        <button role="tab" aria-selected={tipo === "tv"} className={`tt ${tipo === "tv" ? "on" : ""}`} onClick={() => cambiarTipo("tv")}>Series</button>
      </div>
      {sinDatos ? (
        <OfflineState onRetry={() => location.reload()} />
      ) : (
        <>
          <Shelf key={`pop-${tipo}`} tipo={tipo} genre={slug} title={`Populares en ${label}`} onOffline={reportOffline} onListo={() => avisarListo(genActual)} />
          {crosses.map((c) => (
            <Shelf
              key={`${tipo}-${slug}-${c.slug}`}
              title={`${label} ${CROSS_PHRASE[c.slug] ?? `+ ${c.label}`}`}
              url={`/api/discover?tipo=${tipo}&genre=${slug}&genre2=${c.slug}`}
              onListo={() => avisarListo(genActual)}
            />
          ))}
        </>
      )}
    </div>
  );
}
