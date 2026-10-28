// Decisiones puras de la limpieza del recorrido E9a (auditoría E9a, A1).
// Sin base: recorrido-e9a.mjs les pasa lo que leyó y ejecuta lo que devuelven.
//
// La limpieza borra SÓLO objetivos con propiedad registrada (cuentas,
// participantes y versiones del registro `recorrido_e9a`, más los que una
// limpieza anterior ya había guardado) y las filas que los referencian. Nunca
// filtra por fecha, por participante sin cuenta ni por mes creado después de
// preparar.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ENTERO = /^\d+$/;
const MES = /^\d{4}-\d{2}-01$/;

function validar(xs, re, que) {
  for (const x of xs) if (!re.test(String(x))) throw new Error(`${que} inválido: ${x}`);
  return [...new Set(xs.map(String))].sort();
}

/** Objetivos = lo ya guardado ∪ el registro. Nunca otra cosa. */
export function unirObjetivos(guardados, registro) {
  const g = guardados ?? { cuentas: [], participantes: [], versiones: [] };
  return {
    cuentas: validar([...g.cuentas, ...registro.cuentas], UUID, "cuenta"),
    participantes: validar([...g.participantes, ...registro.participantes], UUID, "participante"),
    versiones: validar([...g.versiones, ...registro.versiones], ENTERO, "versión"),
  };
}

/**
 * Qué rankings son del recorrido. Cada mes llega con:
 *   { mes, consolidado, consolidadoAlPreparar, tramosAjenos, resultadosAjenos }
 * (tramos del mes con evaluador o autor fuera de los participantes propios;
 * resultados del mes con un participante no nulo fuera de ellos). Un mes
 * consolidado es propio sólo si TODO lo que lo forma es propio y no estaba
 * consolidado al preparar. Lo demás se conserva y es una discrepancia.
 */
export function decidirMeses(meses, mesesAlPreparar = []) {
  const borrar = [], conservar = [], discrepancias = [];
  for (const m of meses) {
    if (!MES.test(m.mes)) throw new Error(`mes inválido: ${m.mes}`);
    if (!m.consolidado) continue;
    let motivo = null;
    if (mesesAlPreparar.includes(m.mes)) motivo = "ya estaba consolidado al preparar y tiene datos propios";
    else if (m.tramosAjenos > 0 || m.resultadosAjenos > 0) motivo = `ranking con ${m.tramosAjenos} tramo(s) y ${m.resultadosAjenos} resultado(s) ajenos`;
    if (motivo) { conservar.push(m.mes); discrepancias.push(`${m.mes}: ${motivo}; no se toca`); } else borrar.push(m.mes);
  }
  return { borrar: borrar.sort(), conservar: conservar.sort(), discrepancias };
}

/**
 * Actividad AJENA que el borrado de lo propio arrastraría, en cualquier mes,
 * consolidado o no (auditoría E9a A1/A2, residual): votos (evaluaciones y
 * tramos) y denuncias de participantes ajenos sobre reseñas propias,
 * bloqueos ajenos a participantes propios y decisiones de un admin ajeno
 * sobre objetos propios. Cualquiera detiene la limpieza antes de borrar.
 * No mira `decidirMeses`: en un mes sin consolidar, los tramos entre ajenos
 * no se borran y no tienen por qué frenar nada.
 */
export function decidirActividadAjena(c) {
  const nombres = { evaluaciones: "voto(s)", tramos: "tramo(s) de votos", denuncias: "denuncia(s)", bloqueos: "bloqueo(s)", decisiones: "decisión(es) de un admin ajeno" };
  return Object.entries(nombres).filter(([k]) => Number(c[k] ?? 0) > 0)
    .map(([k, txt]) => `actividad ajena sobre lo propio: ${c[k]} ${txt}; borrar lo propio la eliminaría`);
}

export function sqlActividadAjena(o) {
  const { P, U, V } = listas(o);
  return `select json_build_object(
    'evaluaciones', (select count(*) from comunidad.evaluaciones where autor_participante = any(${P}) and not (evaluador_participante = any(${P}))),
    'tramos', (select count(*) from comunidad.tramos where autor_participante = any(${P}) and not (evaluador_participante = any(${P}))),
    'denuncias', (select count(*) from comunidad.denuncias where autor_participante = any(${P}) and not (denunciante_participante = any(${P}))),
    'bloqueos', (select count(*) from comunidad.bloqueos where bloqueado_participante = any(${P}) and not (bloqueador_participante = any(${P}))),
    'decisiones', (select count(*) from comunidad.decisiones where admin_id is not null and not (admin_id = any(${U}))
       and (participante_id = any(${P}) or version_id = any(${V}) or cuenta_id = any(${U}))))::text`;
}

const arr = (xs, tipo) => `'{${xs.join(",")}}'::${tipo}[]`;

/** Listas SQL de los objetivos (validadas). */
export function listas(o, meses = []) {
  return {
    P: arr(validar(o.participantes, UUID, "participante"), "uuid"),
    U: arr(validar(o.cuentas, UUID, "cuenta"), "uuid"),
    V: arr(validar(o.versiones, ENTERO, "versión"), "bigint"),
    M: arr(validar(meses, MES, "mes"), "date"),
  };
}

/** Los meses a evaluar: los de tramos o resultados que tocan participantes propios. */
export function sqlMeses(o) {
  const { P } = listas(o);
  return `select coalesce(json_agg(x order by x.mes), '[]')::text from (
    select m.mes::text as mes,
      exists (select 1 from comunidad.top_meses t where t.mes = m.mes) as consolidado,
      (select count(*) from comunidad.tramos t where t.mes_primera_positiva = m.mes
        and not (t.evaluador_participante = any(${P}) and t.autor_participante = any(${P}))) as "tramosAjenos",
      (select count(*) from comunidad.top_resultados r where r.mes = m.mes
        and r.participante_id is not null and not (r.participante_id = any(${P}))) as "resultadosAjenos"
    from (select distinct mes_primera_positiva as mes from comunidad.tramos
           where evaluador_participante = any(${P}) or autor_participante = any(${P})
          union select distinct mes from comunidad.top_resultados where participante_id = any(${P})) m) x`;
}

/**
 * Una transacción con todos los borrados de comunidad. Sólo listas de ids:
 * con objetivos vacíos no borra nada.
 */
export function sqlBorrarComunidad(o, mesesPropios) {
  const { P, U, V, M } = listas(o, mesesPropios);
  return `begin;
    delete from comunidad.top_resultados where mes = any(${M});
    delete from comunidad.top_meses where mes = any(${M});
    delete from comunidad.ordenes_utiles o
     where exists (select 1 from comunidad.ordenes_utiles_tramos t where t.orden_id = o.id and t.ids && ${V})
       and not exists (select 1 from comunidad.ordenes_utiles_tramos t, unnest(t.ids) x where t.orden_id = o.id and not (x = any(${V})));
    delete from comunidad.decisiones where participante_id = any(${P}) or version_id = any(${V}) or admin_id = any(${U}) or cuenta_id = any(${U});
    delete from comunidad.denuncias where autor_participante = any(${P}) or denunciante_participante = any(${P});
    delete from comunidad.denuncias_cerradas where denunciante_participante = any(${P});
    delete from comunidad.denuncias_excedentes where autor_participante = any(${P});
    delete from comunidad.corroboraciones where autor_participante = any(${P});
    delete from comunidad.tramos where evaluador_participante = any(${P}) or autor_participante = any(${P});
    delete from comunidad.evaluaciones where evaluador_participante = any(${P}) or autor_participante = any(${P});
    delete from comunidad.huellas where autor_participante = any(${P});
    delete from comunidad.intentos where participante_id = any(${P});
    delete from comunidad.bloqueos where bloqueador_participante = any(${P}) or bloqueado_participante = any(${P});
    delete from comunidad.suspensiones where participante_id = any(${P});
    delete from comunidad.contadores where participante_id = any(${P});
    delete from comunidad.bajas_en_curso where user_id = any(${U});
    update comunidad.resenas set version_vigente_id = null where autor_participante = any(${P});
    delete from comunidad.versiones where autor_participante = any(${P});
    delete from comunidad.resenas where autor_participante = any(${P});
    commit;`;
}

/** Los participantes propios, después de borrar las cuentas (la baja los desvincula). */
export function sqlBorrarParticipantes(o) {
  return `delete from comunidad.participantes where id = any(${listas(o).P})`;
}

/**
 * Lo que queda de los objetivos. Todo tiene que dar 0 salvo las filas de los
 * meses conservados por discrepancia, que se informan aparte.
 */
export function sqlResiduos(o, mesesConservados = []) {
  const { P, U, V, M } = listas(o, mesesConservados);
  return `select json_build_object(
    'cuentas', (select count(*) from auth.users where id = any(${U})),
    'participantes', (select count(*) from comunidad.participantes where id = any(${P})),
    'resenas', (select count(*) from comunidad.resenas where autor_participante = any(${P})),
    'versiones', (select count(*) from comunidad.versiones where autor_participante = any(${P}) or id = any(${V})),
    'evaluaciones', (select count(*) from comunidad.evaluaciones where evaluador_participante = any(${P}) or autor_participante = any(${P})),
    'tramos', (select count(*) from comunidad.tramos where evaluador_participante = any(${P}) or autor_participante = any(${P})),
    'denuncias', (select count(*) from comunidad.denuncias where autor_participante = any(${P}) or denunciante_participante = any(${P})),
    'denuncias_cerradas', (select count(*) from comunidad.denuncias_cerradas where denunciante_participante = any(${P})),
    'denuncias_excedentes', (select count(*) from comunidad.denuncias_excedentes where autor_participante = any(${P})),
    'corroboraciones', (select count(*) from comunidad.corroboraciones where autor_participante = any(${P})),
    'decisiones', (select count(*) from comunidad.decisiones where participante_id = any(${P}) or version_id = any(${V}) or admin_id = any(${U}) or cuenta_id = any(${U})),
    'huellas', (select count(*) from comunidad.huellas where autor_participante = any(${P})),
    'intentos', (select count(*) from comunidad.intentos where participante_id = any(${P})),
    'bloqueos', (select count(*) from comunidad.bloqueos where bloqueador_participante = any(${P}) or bloqueado_participante = any(${P})),
    'suspensiones', (select count(*) from comunidad.suspensiones where participante_id = any(${P})),
    'contadores', (select count(*) from comunidad.contadores where participante_id = any(${P})),
    'bajas_en_curso', (select count(*) from comunidad.bajas_en_curso where user_id = any(${U})),
    'top_resultados', (select count(*) from comunidad.top_resultados where participante_id = any(${P}) and not (mes = any(${M}))),
    'ordenes_utiles_propias', (select count(*) from comunidad.ordenes_utiles o
       where exists (select 1 from comunidad.ordenes_utiles_tramos t where t.orden_id = o.id and t.ids && ${V})
         and not exists (select 1 from comunidad.ordenes_utiles_tramos t, unnest(t.ids) x where t.orden_id = o.id and not (x = any(${V})))))::text`;
}

/** Órdenes "Más útiles" que mezclan versiones propias y ajenas: se conservan (son caché con vencimiento) y se informan. */
export function sqlOrdenesMixtas(o) {
  const { V } = listas(o);
  return `select count(*) from comunidad.ordenes_utiles o
    where exists (select 1 from comunidad.ordenes_utiles_tramos t where t.orden_id = o.id and t.ids && ${V})
      and exists (select 1 from comunidad.ordenes_utiles_tramos t, unnest(t.ids) x where t.orden_id = o.id and not (x = any(${V})))`;
}

/** Lista de problemas de la verificación final; vacía = limpieza completa. */
export function evaluarVerificacion({ residuos, sinRegistrar, configIgual, purgaIgual, permisosPendientes, editorialRestante, relojPropio, discrepanciasMeses }) {
  const p = [];
  for (const [k, n] of Object.entries(residuos)) if (Number(n) !== 0) p.push(`quedan ${n} fila(s) propias en ${k}`);
  if (sinRegistrar.length) p.push(`hay ${sinRegistrar.length} cuenta(s) @recorrido.test SIN registrar: no se tocaron (${sinRegistrar.join(", ")})`);
  if (!configIgual) p.push("comunidad.config no volvió a los valores de antes de preparar");
  if (!purgaIgual) p.push("la purga no volvió a su valor de antes de preparar");
  if (permisosPendientes.length) p.push(`permisos temporales sin revocar: ${permisosPendientes.join("; ")}`);
  if (editorialRestante) p.push("la reseña editorial ficticia sigue publicada");
  if (relojPropio) p.push("el reloj solo_local que instaló preparar sigue instalado");
  p.push(...discrepanciasMeses);
  return p;
}
