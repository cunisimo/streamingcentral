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
insert into comunidad.intentos (participante_id, accion, id_intento, hash_peticion, resultado)
  values ('${FX.lector}', 'publicar', '00000000-0000-4000-8000-00000000f0f0', repeat('a', 64), '{"resultado": "publicada"}'::jsonb);
${conAuth ? `insert into comunidad.bajas_en_curso (user_id) values ('${FX.usuarioB}');` : ""}
-- E3b (015): una fila por tabla nueva, sólo si la migración está aplicada.
do $$
begin
  if to_regclass('comunidad.huellas') is not null then
    insert into comunidad.huellas (version_id, resena_id, autor_participante, hash_texto, shingles, creada_en)
      values (${FX.version}, ${FX.resena}, '${FX.autor}', repeat('b', 64), array['0123456789abcdef'], now());
    insert into comunidad.denuncias_excedentes (version_id, autor_participante, hora, cantidad, graves)
      values (${FX.version}, '${FX.autor}', date_trunc('hour', now()), 1, 0);
    insert into comunidad.corroboraciones (version_id, autor_participante, version_reglas, reglas, creada_en)
      values (${FX.version}, '${FX.autor}', '2026-10-24.2', 'prueba', now());
  end if;
  -- E4 (016): el registro de decisiones y el historial mínimo de denuncias.
  if to_regclass('comunidad.decisiones') is not null then
    insert into comunidad.decisiones (id_intento, accion, version_id, participante_id, motivo, creada_en)
      values ('00000000-0000-4000-8000-00000000e4e4', 'retirar', ${FX.version}, '${FX.autor}', 'fixture de prueba', now());
    insert into comunidad.denuncias_cerradas (denunciante_participante, categoria, estado, creada_en, cerrada_en)
      values ('${FX.lector}', 'spam', 'descartada', now(), now());
  end if;
  -- E5b (018): un orden congelado de "Más útiles" (ids, sin datos del lector).
  if to_regclass('comunidad.ordenes_utiles') is not null then
    insert into comunidad.ordenes_utiles (id, tipo, tmdb_id, creado_en, vence_en, total)
      overriding system value values (900001, 'movie', 1, now(), now() + interval '2 hours', 1);
    insert into comunidad.ordenes_utiles_tramos (orden_id, tramo_no, ids) values (900001, 0, array[${FX.resena}]::bigint[]);
  end if;
  -- E7 (020): un mes consolidado del Top Yumpers (un mes que no usa nadie).
  if to_regclass('comunidad.top_meses') is not null then
    insert into comunidad.top_meses (mes, corte, consolidado_en, autores) values ('2025-01-01', '2025-02-01 03:00:00+00', now(), 1);
    insert into comunidad.top_resultados (mes, posicion, puntos, participante_id) values ('2025-01-01', 1, 1, '${FX.autor}');
  end if;
  -- E8 (021): una ejecución de la purga (la configuración ya tiene su fila).
  if to_regclass('comunidad.purga_ejecuciones') is not null then
    insert into comunidad.purga_ejecuciones (alcance, ahora, iniciada_en, estado) values ('dia', now(), now(), 'en_curso');
  end if;
  if to_regclass('comunidad.meses_sin_historial') is not null then
    insert into comunidad.meses_sin_historial (mes) values ('2025-01-01');
  end if;
end;
$$;
`;
}
