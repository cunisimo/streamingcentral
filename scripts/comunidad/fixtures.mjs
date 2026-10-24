// Fixtures del esquema `comunidad` para las baterías locales. Las inserta el
// DUEÑO de la base (postgres) dentro de una transacción que la prueba revierte:
// nunca quedan filas, y ningún rol de la API recibe permisos para crearlas.
//
// Ids fijos para que las pruebas puedan apuntar a cada fila. `overriding system
// value` sólo lo puede usar el dueño: es el mismo motivo por el que el cliente
// nunca elige ids.

export const FX = {
  usuarioA: "00000000-0000-4000-8000-0000000000a1",
  usuarioB: "00000000-0000-4000-8000-0000000000b1",
  autor: "00000000-0000-4000-8000-00000000c0a1",
  lector: "00000000-0000-4000-8000-00000000c0b1",
  resena: 900001,
  version: 900001,
};

/** Un texto válido: 80–600 puntos de código, NFC, sin controles. */
export const TEXTO_OK =
  "La vi el fin de semana y me sorprendió para bien: buen ritmo, actuaciones creíbles y un final que no regala nada.";

/** SQL que crea una reseña publicada con su voto, tramo, denuncia y demás. */
export function fixturesSql({ conAuth = true } = {}) {
  return `
${conAuth ? `insert into auth.users (id, email, aud, role)
  values ('${FX.usuarioA}', 'fx-a@comunidad.test', 'authenticated', 'authenticated'),
         ('${FX.usuarioB}', 'fx-b@comunidad.test', 'authenticated', 'authenticated');` : ""}
insert into comunidad.participantes (id, user_id, nombre_comunitario)
  values ('${FX.autor}', ${conAuth ? `'${FX.usuarioA}'` : "null"}, 'Autora'),
         ('${FX.lector}', ${conAuth ? `'${FX.usuarioB}'` : "null"}, 'Lector');
insert into comunidad.resenas (id, autor_participante, tipo, tmdb_id, version_vigente_id, primera_publicacion_en)
  overriding system value
  values (${FX.resena}, '${FX.autor}', 'movie', 603, ${FX.version}, now());
insert into comunidad.versiones (id, resena_id, autor_participante, texto, estado, version_reglas, id_intento)
  overriding system value
  values (${FX.version}, ${FX.resena}, '${FX.autor}', '${TEXTO_OK}', 'publicada', '2026-10-24.2', gen_random_uuid());
insert into comunidad.evaluaciones (version_id, autor_participante, evaluador_participante, util)
  values (${FX.version}, '${FX.autor}', '${FX.lector}', true);
insert into comunidad.tramos (evaluador_participante, autor_participante, version_id, mes_primera_positiva, vigente_desde)
  values ('${FX.lector}', '${FX.autor}', ${FX.version}, '2026-10-01', now());
insert into comunidad.suspensiones (participante_id, desde) values ('${FX.lector}', now());
insert into comunidad.denuncias (version_id, autor_participante, denunciante_participante, categoria)
  values (${FX.version}, '${FX.autor}', '${FX.lector}', 'spam');
insert into comunidad.bloqueos (bloqueador_participante, bloqueado_participante) values ('${FX.lector}', '${FX.autor}');
insert into comunidad.contadores (participante_id, accion, dia, cantidad) values ('${FX.lector}', 'evaluacion', '2026-10-24', 1);
${conAuth ? `insert into comunidad.bajas_en_curso (user_id) values ('${FX.usuarioB}');` : ""}
`;
}
