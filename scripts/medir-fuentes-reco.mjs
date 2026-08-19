#!/usr/bin/env node
// ¿De qué fuente puede salir una recomendación, según el título de origen?
//
//   node --env-file=.env.local scripts/medir-fuentes-reco.mjs
//
// El riel "Elegidas para vos" se arma desde dos fuentes: `/recommendations` del
// título que al usuario le gustó, y `discover` por las keywords de ese título.
// Este script mide CUÁNDO existe cada una, por país y por tramo de votos.
//
// LO QUE MIDIÓ EL 2026-08-17, y que invierte la intuición:
//
//   país             tramo          sin keywords   /recommendations vacías
//   Argentina        pocos votos        9/12              0/12
//   Argentina        muchos votos       1/12              0/12
//   España           pocos votos        7/12              0/12
//   España           muchos votos       0/12              0/12
//   Estados Unidos   pocos votos        4/12              0/12
//   Estados Unidos   muchos votos       0/12              0/12
//
//   1. `/recommendations` NUNCA vino vacío: 0 de 72 títulos, ni siquiera con 5
//      votos. La preocupación de que el cine chico no tuviera datos de
//      comportamiento NO se confirma.
//   2. Las KEYWORDS son las que faltan, y faltan justo donde importa: 9 de cada
//      12 títulos argentinos de pocos votos no tienen ninguna.
//
// O sea que keywords NO es el camino de rescate para el cine regional — es el
// que no existe ahí. `/recommendations` va de columna vertebral y las keywords
// son el complemento para títulos bien documentados.
//
// La otra cara, y hay que tenerla presente al leer los resultados: en un título
// de 5 votos `/recommendations` no puede ser comportamiento (nadie lo vio), es
// el respaldo por contenido de TMDB. Coherente de género, pero genérico.
//
// CORRECCIÓN, porque acá decía otra cosa y estaba mal: `vote_count` se registra
// como CONTEXTO y nada más. NO se usa para excluir, ni para bajarle peso a nada,
// ni para afirmar que una recomendación es fuerte o débil. Esa lectura es el
// mismo error que ya está prohibido como principio del proyecto — popularidad
// usada como proxy de calidad — y castiga justo al cine regional, que es lo que
// esta app quiere mostrar. Ver CLAUDE.md y el issue #12.
const T = process.env.TMDB_READ_TOKEN;
const api = async (p, q = {}) => {
  const u = new URL("https://api.themoviedb.org/3" + p);
  u.searchParams.set("language", "es-ES");
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { Authorization: `Bearer ${T}`, accept: "application/json" } });
  return r.json();
};

for (const [cc, nombre] of [["AR", "Argentina"], ["ES", "España"], ["US", "Estados Unidos"]]) {
  for (const [orden, tramo] of [["vote_count.asc", "pocos votos"], ["vote_count.desc", "muchos votos"]]) {
    const d = await api("/discover/movie", {
      with_origin_country: cc, sort_by: orden, "vote_count.gte": "5",
      watch_region: "AR", with_watch_monetization_types: "flatrate", page: "1",
    });
    const m = (d.results ?? []).slice(0, 12);
    let sinKw = 0, recVacias = 0, votos = 0;
    for (const x of m) {
      const [kw, rec] = await Promise.all([
        api(`/movie/${x.id}/keywords`),
        api(`/movie/${x.id}/recommendations`),
      ]);
      if (!(kw.keywords ?? []).length) sinKw++;
      if (!(rec.results ?? []).length) recVacias++;
      votos += x.vote_count;
    }
    console.log(
      `${nombre.padEnd(15)} ${tramo.padEnd(13)} n=${m.length}  votos medios ${String(Math.round(votos / m.length)).padStart(6)}  ` +
      `SIN keywords: ${sinKw}/${m.length}   /recommendations vacías: ${recVacias}/${m.length}`,
    );
  }
}
