// Reconciliación del estado local con lo que REALMENTE quedó en Producción.
//
// La carga a Producción la hace el dueño a mano (SQL Editor) y puede no ser
// exactamente lo que el estado anotó como pendiente: el 2026-10-08 se cargaron
// 500 elegidos de 545 traídos (los otros 145 no tenían texto, "pero" o pedían
// contexto) y 100 de los 500 salieron de la reserva. Este paso NO consulta
// TMDB ni escribe en Supabase: recibe una foto de sólo lectura de
// roulette_titles y title_availability (snapshot-produccion.mjs) y deja el
// estado igual a esa foto.
//
//   - titulos   = exactamente las filas de roulette_titles (Producción).
//   - reserva   = enriquecidos que NO están en Producción (incluye los que se
//                 trajeron y no se cargaron, con su motivo).
//   - cargas    = historial de cargas confirmadas (los ids de cada una).
//   - carga_pendiente se vacía de lo confirmado; lo que no se cargó vuelve a
//                 reserva y deja de estar pendiente.
//
// Lo que no se puede explicar (un id de Producción que el estado no conoce, o
// uno marcado como descartado/excluido) es un CONFLICTO: se aborta sin escribir.

export class ConflictoReconciliacion extends Error {
  constructor(motivo, ids) {
    super(`${motivo}: ${ids.slice(0, 20).join(", ")}${ids.length > 20 ? ` (+${ids.length - 20})` : ""}`);
    this.name = "ConflictoReconciliacion";
    this.motivo = motivo;
    this.ids = ids;
  }
}

const porId = (a, b) => a - b;

/**
 * @param estado  ruleta-estado.json
 * @param foto    { at, rt: [{ id, mt, excl }], ta: [{ id, mt }] } (sólo región AR)
 * @param opts    { ahoraIso, motivoDe?: (id) => string }  motivo para lo que vuelve a reserva
 */
export function reconciliarConProduccion(estado, foto, { ahoraIso, motivoDe = () => "no-cargado" }) {
  const otros = [...foto.rt, ...foto.ta].filter((r) => r.mt !== "movie").map((r) => r.id);
  if (otros.length) throw new ConflictoReconciliacion("la ruleta sólo maneja películas y Producción tiene otro media_type", otros);

  const prod = new Set(foto.rt.map((r) => r.id));
  const conDisp = new Set(foto.ta.map((r) => r.id));
  const sig = structuredClone(estado);
  sig.reserva ??= {};

  const desconocidos = [...prod].filter((id) => !sig.titulos[id] && !sig.reserva[id]).sort(porId);
  if (desconocidos.length) throw new ConflictoReconciliacion("hay títulos en Producción que el estado no conoce (no se pueden inventar sus datos)", desconocidos);
  const vetados = [...prod].filter((id) => sig.excluidos_editoriales?.[id] || sig.descartados?.[id]).sort(porId);
  if (vetados.length) throw new ConflictoReconciliacion("hay títulos en Producción que el estado tiene como excluidos o descartados", vetados);

  const pend = sig.carga_pendiente ?? { nuevos: [], disponibilidad: [] };
  const pendNuevos = new Set(pend.nuevos ?? []);

  // 1. Del estado a la reserva: lo que el estado cree cargado y no está.
  const aReserva = {};
  for (const [idTxt, t] of Object.entries(sig.titulos)) {
    const id = Number(idTxt);
    if (prod.has(id)) continue;
    if (!pendNuevos.has(id)) {
      // Un título "viejo" que desapareció de Producción no es algo que esta
      // reconciliación deba decidir: lo borró alguien a mano.
      throw new ConflictoReconciliacion("hay títulos ya cargados antes que no están en Producción", [id]);
    }
    const motivo = motivoDe(id);
    sig.reserva[id] = { ...t, reserva_motivo: motivo, reserva_pos: Infinity };
    delete sig.titulos[id];
    aReserva[motivo] = (aReserva[motivo] ?? 0) + 1;
  }

  // 2. De la reserva al estado: lo que se promovió y sí se cargó.
  const desdeReserva = [];
  for (const id of Object.keys(sig.reserva).map(Number)) {
    if (!prod.has(id)) continue;
    const { reserva_motivo, reserva_pos, ...t } = sig.reserva[id];
    sig.titulos[id] = t;
    delete sig.reserva[id];
    desdeReserva.push(id);
  }

  // 3. Carga confirmada = lo pendiente o promovido que ahora está en Producción.
  const confirmados = [...new Set([...pendNuevos, ...desdeReserva])].filter((id) => prod.has(id)).sort(porId);
  const sinDisponibilidad = confirmados.filter((id) => !conDisp.has(id));
  const dispPend = [...new Set([...(pend.disponibilidad ?? []), ...desdeReserva])]
    .filter((id) => prod.has(id) && !conDisp.has(id)).sort(porId);
  if (dispPend.length) {
    sig.carga_pendiente = { nuevos: [], disponibilidad: dispPend, desde: pend.desde ?? ahoraIso };
  } else delete sig.carga_pendiente;

  if (confirmados.length) {
    sig.cargas = [...(sig.cargas ?? []), {
      confirmada_at: ahoraIso, foto_at: foto.at, pendiente_desde: pend.desde ?? null,
      total: confirmados.length, desde_reserva: desdeReserva.length, ids: confirmados,
    }];
  }

  // 4. Metadatos pendientes: sólo de títulos que están en Producción.
  const antesMeta = (sig.metadatos_pendientes_sql ?? []).length;
  sig.metadatos_pendientes_sql = (sig.metadatos_pendientes_sql ?? []).filter((id) => prod.has(id));

  // 5. Exclusiones aplicadas en Producción (010): se registran para el plan.
  sig.excluidos_produccion = Object.fromEntries(foto.rt.filter((r) => r.excl).map((r) => [r.id, r.excl]));
  sig.produccion_verificada = { at: ahoraIso, foto_at: foto.at, roulette_titles: prod.size, disponibilidad_ar: conDisp.size };

  const resumen = {
    produccion: prod.size,
    titulosAntes: Object.keys(estado.titulos).length,
    titulosDespues: Object.keys(sig.titulos).length,
    aReserva, desdeReserva: desdeReserva.length,
    cargaConfirmada: confirmados.length, sinDisponibilidad: sinDisponibilidad.length,
    cargaPendienteRestante: sig.carga_pendiente ?? null,
    metadatosQuitados: antesMeta - sig.metadatos_pendientes_sql.length,
    metadatosPendientes: sig.metadatos_pendientes_sql.length,
    excluidosProduccion: Object.keys(sig.excluidos_produccion).length,
    reserva: Object.keys(sig.reserva).length,
  };
  return { estado: sig, resumen };
}

/** La cola deja afuera lo que ya está en el pool, en la reserva o excluido. */
export function colaVigente(cola, estado) {
  const fuera = (id) => !!estado.titulos[id] || !!estado.reserva?.[id] || !!estado.excluidos_editoriales?.[id];
  const vigente = cola.filter((c) => !fuera(c.id));
  return { cola: vigente, quitados: cola.length - vigente.length };
}

/** Las cuatro poblaciones que el plan tiene que distinguir, para el informe. */
export function resumenEstado(estado) {
  const contar = (o, f) => Object.values(o ?? {}).reduce((acc, x) => { const k = f(x); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
  const ultima = estado.cargas?.at(-1) ?? null;
  return {
    produccionVerificada: estado.produccion_verificada ?? null,
    titulos: Object.keys(estado.titulos).length,
    excluidosEnProduccion: Object.keys(estado.excluidos_produccion ?? {}).length,
    ultimaCarga: ultima ? { confirmada_at: ultima.confirmada_at, total: ultima.total, desde_reserva: ultima.desde_reserva } : null,
    reserva: Object.keys(estado.reserva ?? {}).length,
    reservaPorMotivo: contar(estado.reserva, (t) => t.reserva_motivo ?? "?"),
    excluidosEditoriales: contar(estado.excluidos_editoriales, (x) => x.motivo),
    descartados: contar(estado.descartados, (x) => x.motivo),
    cargaPendiente: estado.carga_pendiente ? { nuevos: estado.carga_pendiente.nuevos?.length ?? 0, disponibilidad: estado.carga_pendiente.disponibilidad?.length ?? 0 } : null,
    metadatosPendientesSql: (estado.metadatos_pendientes_sql ?? []).length,
  };
}
