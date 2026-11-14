// Qué superficie hace un pedido a /api/discover, sólo con los parámetros que
// YA manda cada cliente (incluidos los bundles Android publicados, que no se
// pueden cambiar sin un AAB nuevo). PURO: sin Next ni TMDB, para poder probarlo
// con las URLs exactas que arman los bundles.
//
// Inventario de quién llama a /api/discover, verificado sobre el JS de los AAB
// vc3, vc4 y vc5 (base/assets/public/_next/static/chunks) y sobre el fuente:
//
//   «Ver todas» (/categoria/<slug>), riel Populares — Shelf en modo auto:
//     /api/discover?tipo=T&genre=G&providers=P[&country=C]          SIN page
//   «Ver todas», rieles de cruce:
//     /api/discover?tipo=T&genre=G&genre2=G2&providers=P            SIN page
//   Buscador por género (SearchView):
//     /api/discover?tipo=T&genre=G&page=N&providers=P[&country][&age][&decade]
//                                                                   CON page
//   Buscador, exploración por país:
//     /api/discover?tipo=movie&country=C&providers=P                sin genre
//
// El chip «Drama intenso» del hero NO pasa por acá: usa /api/recomendaciones.
//
// Por eso «sin `page`» identifica a «Ver todas» también en los bundles viejos.
// Los clientes nuevos mandan además `riel=1`, que es lo explícito; la inferencia
// existe sólo para el Android ya publicado.
export function pideRielCategoria(sp: URLSearchParams): boolean {
  if (sp.get("riel") === "1") return true;
  return !!sp.get("genre") && !sp.has("page");
}
