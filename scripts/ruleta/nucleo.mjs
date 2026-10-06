// Lógica PURA del mantenimiento incremental de la ruleta: sin red, sin disco.
// La comparten el plan (que no consulta TMDB) y la ejecución.

// --- Qué se descubre --------------------------------------------------------
//
// Las mismas dos familias que el pipeline anterior (build-roulette-pool y
// build-shorts-pool), con los mismos pisos. Cambia CÓMO se recorre:
//
//   antes: 4 (o 3) ordenamientos × 8 páginas por ventana, porque 8 páginas no
//          alcanzaban a cubrir una ventana y se compensaba con varios órdenes.
//          Resultado: hasta 312 páginas, muchas repetidas entre órdenes, y aun
//          así una cobertura truncada (no hay garantía de ver todo).
//   ahora: UN orden estable por ventana y TODAS sus páginas (`total_pages`).
//          Cobertura completa de la ventana con el mínimo de páginas.
//
// El orden es `original_title.asc` porque no cambia de un día a otro: con
// `popularity.desc` el ranking se mueve entre la página 3 y la 4 y un título
// puede saltearse. Los ventanas son chicas (el tope de TMDB es la página 500).
export const FAMILIAS = {
  principal: {
    filtros: { "vote_count.gte": 300, "vote_average.gte": 6.0 },
    ventanas: [
      ["1920-01-01", "1979-12-31"], ["1980-01-01", "1989-12-31"], ["1990-01-01", "1999-12-31"],
      ["2000-01-01", "2009-12-31"], ["2010-01-01", "2019-12-31"], ["2020-01-01", "2029-12-31"],
    ],
    // Proceso anterior: 4 órdenes × hasta 8 páginas por ventana.
    anterior: { ordenes: 4, paginas: 8 },
  },
  cortas: {
    filtros: {
      "vote_count.gte": 50, "vote_average.gte": 6.0,
      "with_runtime.gte": 60, "with_runtime.lte": 100,
    },
    ventanas: [
      ["1920-01-01", "1969-12-31"], ["1970-01-01", "1989-12-31"], ["1990-01-01", "2004-12-31"],
      ["2005-01-01", "2014-12-31"], ["2015-01-01", "2029-12-31"],
    ],
    anterior: { ordenes: 3, paginas: 8 },
    runtime: [60, 100],
  },
};

export const ORDEN_ESTABLE = "original_title.asc";
export const IDIOMA = "es-ES";
export const REGION = "AR";

export function paramsDescubrir(familia, [desde, hasta], pagina) {
  return {
    watch_region: REGION,
    with_watch_monetization_types: "flatrate",
    ...FAMILIAS[familia].filtros,
    "primary_release_date.gte": desde,
    "primary_release_date.lte": hasta,
    sort_by: ORDEN_ESTABLE,
    include_adult: false,
    language: IDIOMA,
    page: pagina,
  };
}

export const claveDescubrir = (fam, v, pagina) => `descubrir:${fam}:${v[0].slice(0, 4)}-${v[1].slice(0, 4)}:${pagina}`;
export const claveDetalle = (id) => `detalle:${id}`;
export const claveDisp = (id) => `disp:${id}`;
export const claveColeccion = (id) => `coleccion:${id}`;

// --- Del detalle de TMDB a una fila del pool ----------------------------------
// Misma forma que generaban los scripts anteriores, más `release_date` y la
// saga, que vienen en la MISMA respuesta y antes se tiraban (y después se
// pagaba otro detalle completo sólo para leer `belongs_to_collection`).

function normalizarCert(raw) {
  if (!raw) return "desconocido";
  const c = raw.trim().toUpperCase();
  if (["ATP", "G", "AA"].includes(c)) return "todos";
  if (["PG", "+7", "7"].includes(c)) return "guia";
  if (["PG-13", "+13", "13", "12", "+12"].includes(c)) return "adolescentes";
  if (["R", "NC-17", "+16", "16", "+18", "18", "X"].includes(c)) return "adultos";
  return "desconocido";
}

function certificacion(detail) {
  const listas = detail.release_dates?.results ?? [];
  for (const pais of [REGION, "US"]) {
    const entrada = listas.find((r) => r.iso_3166_1 === pais);
    const cert = entrada?.release_dates?.find((d) => d.certification)?.certification;
    if (cert) return { cert, cert_pais: pais, edad: normalizarCert(cert) };
  }
  return { cert: null, cert_pais: null, edad: "desconocido" };
}

const sinAcentos = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Proveedores de la región: suscripción + gratis + con publicidad (como antes). */
export function proveedoresDe(watchProviders) {
  const r = watchProviders?.results?.[REGION] ?? null;
  return [...new Set([...(r?.flatrate ?? []), ...(r?.free ?? []), ...(r?.ads ?? [])].map((p) => p.provider_name))];
}

/**
 * Detalle → fila, o `{ descartado: motivo }`. Los motivos son los mismos
 * filtros de siempre: sin plataforma, sin sinopsis, o (cortas) fuera de rango.
 */
export function construirTitulo(detail, familia, ahoraIso) {
  if (!detail) return { descartado: "no-existe" };
  const providers = proveedoresDe(detail["watch/providers"]);
  if (!providers.length) return { descartado: "sin-plataforma" };
  const overview = (detail.overview ?? "").trim();
  if (!overview) return { descartado: "sin-sinopsis" };
  const rango = FAMILIAS[familia]?.runtime;
  if (rango && (!detail.runtime || detail.runtime < rango[0] || detail.runtime > rango[1])) {
    return { descartado: "duracion-fuera-de-rango" };
  }
  const { cert, cert_pais, edad } = certificacion(detail);
  const generos = (detail.genres ?? []).map((g) => g.name);
  const infantil = generos.some((g) => ["animacion", "familia"].includes(sinAcentos(g)));
  const col = detail.belongs_to_collection ?? null;
  return {
    titulo: {
      tmdb_id: detail.id,
      media_type: "movie",
      title: detail.title,
      original_title: detail.original_title,
      year: detail.release_date ? Number(detail.release_date.slice(0, 4)) : null,
      release_date: detail.release_date || null,
      overview,
      genres: generos,
      runtime: detail.runtime ?? null,
      original_language: detail.original_language ?? null,
      en_espanol: (detail.original_language ?? "") === "es",
      certificacion: cert,
      certificacion_pais: cert_pais,
      edad,
      apto_chicos: infantil && ["todos", "guia"].includes(edad),
      vote_count: detail.vote_count ?? 0,
      vote_average: detail.vote_average ?? null,
      popularity: detail.popularity ?? null,
      providers,
      con_texto: false,
      familia,
      meta_at: ahoraIso,
      disp_at: ahoraIso,
      coleccion: col ? { id: col.id, name: col.name } : null,
      es_secuela: col ? null : false,
      coleccion_at: col ? null : ahoraIso,
    },
  };
}

// --- Sagas ------------------------------------------------------------------

/**
 * ¿Es secuela un título NUEVO de una saga ya procesada? Sin consultar TMDB
 * cuando alcanza con lo que ya se sabe. Devuelve `true`/`false`, o `null` si
 * hace falta pedir la colección.
 *
 * Con las partes completas (saga pedida por este pipeline) la respuesta es
 * exacta. Con una saga heredada del pipeline anterior sólo se conoce cuál
 * miembro del pool era la primera de TODA la colección; alcanza para cualquier
 * título posterior. Un empate de año es ambiguo y se consulta.
 */
export function esSecuelaInferida(saga, titulo) {
  if (!saga) return null;
  if (saga.partes?.length) {
    const partes = [...saga.partes];
    if (!partes.some((p) => p.id === titulo.tmdb_id)) partes.push({ id: titulo.tmdb_id, fecha: titulo.release_date ?? `${titulo.year}-12-31` });
    const conFecha = partes.filter((p) => p.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha));
    return conFecha.length ? conFecha[0].id !== titulo.tmdb_id : null;
  }
  if (titulo.year == null) return null;
  if (saga.primera?.year != null && titulo.year > saga.primera.year) return true;
  // Sin primera en el pool: la primera es anterior a todos los miembros
  // conocidos, que son secuelas. Un título posterior a alguno también lo es.
  const masViejo = Math.min(...(saga.miembros ?? []).filter((m) => m.year != null).map((m) => m.year));
  if (!saga.primera && Number.isFinite(masViejo) && titulo.year > masViejo) return true;
  return null;
}

/** De la respuesta de `/collection/{id}` a la saga que se guarda. */
export function sagaDeColeccion(col, ahoraIso) {
  return {
    name: col?.name ?? null,
    partes: (col?.parts ?? []).filter((p) => p.release_date).map((p) => ({ id: p.id, fecha: p.release_date })),
    at: ahoraIso,
  };
}

// --- Vencimientos ---------------------------------------------------------------

const DIA_MS = 86_400_000;

export function dispVencida(titulo, ahoraMs, ttlDias) {
  if (!titulo.disp_at) return true;
  return ahoraMs - Date.parse(titulo.disp_at) > ttlDias * DIA_MS;
}

/** Datos que faltan de verdad: los que el detalle traería y la fila no tiene. */
export function faltanDatos(t) {
  return t.runtime == null || !t.overview || t.year == null;
}

export function descarteVigente(d, ahoraMs, ttlDias) {
  return !!d?.at && ahoraMs - Date.parse(d.at) <= ttlDias * DIA_MS;
}

// --- Costo del proceso anterior -------------------------------------------------
//
// Modelo de lo que hacían los cinco scripts anteriores en UNA corrida completa
// sobre este mismo pool. Es un PISO: cuenta sólo los pedidos exitosos y supone
// que cada candidato se encontraba una vez (no cuenta los 429 que se
// reintentaban sin registrarlos).
export function costoProcesoAnterior(estado) {
  const titulos = Object.values(estado.titulos);
  const enVentana = (t, [d, h]) => t.year != null && t.year >= Number(d.slice(0, 4)) && t.year <= Number(h.slice(0, 4));
  const paginas = (n) => Math.max(1, Math.ceil(n / 20));

  const cumplePrincipal = (t) => t.vote_count >= 300 && t.vote_average >= 6.0;
  const cumpleCortas = (t) => t.vote_count >= 50 && t.vote_average >= 6.0 && t.runtime >= 60 && t.runtime <= 100;

  let descubrir = 0;
  let detallePrincipal = 0;
  for (const v of FAMILIAS.principal.ventanas) {
    const n = titulos.filter((t) => cumplePrincipal(t) && enVentana(t, v)).length;
    descubrir += FAMILIAS.principal.anterior.ordenes * Math.min(FAMILIAS.principal.anterior.paginas, paginas(n));
    // Cada candidato único recibía un detalle completo, existiera o no.
    detallePrincipal += Math.min(n, FAMILIAS.principal.anterior.ordenes * FAMILIAS.principal.anterior.paginas * 20);
  }
  let detalleCortas = 0;
  for (const v of FAMILIAS.cortas.ventanas) {
    const n = titulos.filter((t) => cumpleCortas(t) && enVentana(t, v)).length;
    descubrir += FAMILIAS.cortas.anterior.ordenes * Math.min(FAMILIAS.cortas.anterior.paginas, paginas(n));
    // Sólo las que no estaban en el pool principal.
    detalleCortas += titulos.filter((t) => cumpleCortas(t) && !cumplePrincipal(t) && enVentana(t, v)).length;
  }
  const conTexto = titulos.filter((t) => t.con_texto).length;
  const sagas = new Set(titulos.filter((t) => t.coleccion?.id).map((t) => t.coleccion.id)).size;
  const porOperacion = {
    descubrir,
    detalle: detallePrincipal + detalleCortas,
    "detalle-solo-para-saga": conTexto,
    coleccion: sagas,
  };
  return { porOperacion, total: Object.values(porOperacion).reduce((a, b) => a + b, 0) };
}

// --- Plan -------------------------------------------------------------------------

/**
 * Qué haría una corrida, sin consultar TMDB ni escribir nada.
 *
 * `diario` es lo ya hecho en una corrida anterior interrumpida: lo que está ahí
 * no se vuelve a pedir. Si el descubrimiento ya se hizo (en el diario), los
 * títulos nuevos son EXACTOS; si no, sólo se puede estimar cuántas páginas de
 * descubrimiento hacen falta, y los nuevos se conocen después de esa fase.
 */
export function planificar(estado, diario, cfg) {
  const { ahoraMs, ttlDispDias, ttlDescartesDias, fases, maxDisponibilidad = Infinity } = cfg;
  const titulos = Object.values(estado.titulos);
  const enVentana = (t, [d, h]) => t.year != null && t.year >= Number(d.slice(0, 4)) && t.year <= Number(h.slice(0, 4));

  // 1. Descubrimiento: páginas ya hechas y páginas que faltan.
  const desc = { paginasHechas: 0, paginasPrevistas: 0, exacto: true, candidatos: new Map() };
  if (fases.descubrir) {
    for (const [fam, f] of Object.entries(FAMILIAS)) {
      for (const v of f.ventanas) {
        const p1 = diario.get(claveDescubrir(fam, v, 1));
        let total;
        if (p1) total = p1.total_pages;
        else {
          // Sin la página 1 no se sabe el total: se estima con lo que el pool
          // ya tiene en esa ventana, más un 10% y una página de margen.
          const cumple = fam === "principal"
            ? (t) => t.vote_count >= 300 && t.vote_average >= 6.0
            : (t) => t.vote_count >= 50 && t.vote_average >= 6.0 && t.runtime >= 60 && t.runtime <= 100;
          const n = titulos.filter((t) => cumple(t) && enVentana(t, v)).length;
          total = Math.ceil((n * 1.1) / 20) + 1;
          desc.exacto = false;
        }
        for (let p = 1; p <= total; p++) {
          const r = diario.get(claveDescubrir(fam, v, p));
          if (r) {
            desc.paginasHechas++;
            for (const it of r.items) if (!desc.candidatos.has(it.id)) desc.candidatos.set(it.id, fam);
          } else desc.paginasPrevistas++;
        }
      }
    }
  } else if (estado.descubrimiento?.candidatos) {
    for (const [id, [fam]] of Object.entries(estado.descubrimiento.candidatos)) desc.candidatos.set(Number(id), fam);
  } else desc.exacto = false;

  // 2. Nuevos: candidatos que no están en el pool ni descartados vigentes.
  const nuevos = [];
  let descartesReusados = 0;
  for (const [id, fam] of desc.candidatos) {
    if (estado.titulos[id]) continue;
    if (descarteVigente(estado.descartados[id], ahoraMs, ttlDescartesDias)) { descartesReusados++; continue; }
    nuevos.push({ id, fam });
  }
  const detalleHechos = nuevos.filter((n) => diario.has(claveDetalle(n.id))).length;
  const faltantes = titulos.filter(faltanDatos);

  // 3. Disponibilidad vencida de los que ya están.
  const vencidas = titulos.filter((t) => dispVencida(t, ahoraMs, ttlDispDias));
  const vigentes = titulos.length - vencidas.length;
  const dispObjetivo = fases.disponibilidad ? vencidas.slice(0, maxDisponibilidad) : [];
  const dispHechas = dispObjetivo.filter((t) => diario.has(claveDisp(t.tmdb_id))).length;

  // 4. Sagas: las de los nuevos se conocen recién con su detalle. Estimación
  // con la proporción que tiene hoy el pool.
  const conSaga = titulos.filter((t) => t.coleccion?.id);
  const sagasConocidas = Object.keys(estado.sagas).length;
  const tasaSaga = titulos.length ? conSaga.length / titulos.length : 0;
  const tasaSagaNueva = conSaga.length ? sagasConocidas / conSaga.length : 0;

  const llamadas = {
    descubrir: desc.paginasPrevistas,
    detalle: fases.enriquecer ? nuevos.length - detalleHechos + faltantes.length : 0,
    disponibilidad: dispObjetivo.length - dispHechas,
    coleccion: fases.enriquecer ? Math.ceil(nuevos.length * tasaSaga * tasaSagaNueva) : 0,
  };
  const total = Object.values(llamadas).reduce((a, b) => a + b, 0);
  const anterior = costoProcesoAnterior(estado);

  return {
    actuales: titulos.length,
    conTexto: titulos.filter((t) => t.con_texto).length,
    candidatos: { conocidos: desc.candidatos.size, descubrimientoCompleto: desc.exacto && desc.paginasPrevistas === 0 },
    nuevos: { cantidad: nuevos.length, exacto: desc.exacto && desc.paginasPrevistas === 0, yaEnriquecidos: detalleHechos },
    datosFaltantes: faltantes.length,
    disponibilidad: { vencidas: vencidas.length, vigentes, objetivo: dispObjetivo.length, yaHechas: dispHechas, ttlDias: ttlDispDias },
    reutilizados: {
      metadatos: titulos.length - faltantes.length,
      disponibilidadVigente: vigentes,
      sagasConocidas,
      titulosConSagaResuelta: titulos.filter((t) => t.coleccion !== undefined).length,
      descartesVigentes: descartesReusados,
      operacionesEnDiario: diario.size,
    },
    llamadas: { porOperacion: llamadas, total, coleccionEsEstimada: fases.enriquecer },
    anterior,
    evitadas: anterior.total - total,
  };
}
