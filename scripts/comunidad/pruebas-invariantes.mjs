#!/usr/bin/env node
// Invariantes del esquema `comunidad` (reseñas, E2a), contra la base LOCAL.
// Plan: docs/superpowers/plans/2026-10-22-resenas-comunidad.md, E2a; diseño:
// revisión §2.1.3 y §2.2.
//
// Uso:
//   node scripts/sala/db-local.mjs
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-invariantes.mjs
//   (con DETALLE=1 imprime el SQLSTATE y el mensaje de cada caso)
//
// Las prueba el DUEÑO de la base (postgres) insertando directo, en una suite
// aparte de la matriz de permisos: no se le da ningún permiso de tabla a
// service_role para esto (plan, E2a). Cada caso corre en su propia
// transacción con las fixtures, ejecuta `set constraints all immediate` (así
// disparan los triggers diferidos, como al confirmar) y se REVIERTE: no queda
// ninguna fila.
//
// El resultado esperado de cada caso está escrito antes: `ok` o el SQLSTATE
// (23514 check/trigger, 23503 FK, 23505 único, 23502 no nulo).
// `ok` exige además que pasen los `assert` del caso.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { FX, TEXTO_OK, fixturesSql } from "./fixtures.mjs";
import { arnes, contenedor, psql, sqlOk, urlLocal } from "./local.mjs";

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SRV) { console.error("Falta SUPABASE_SERVICE_ROLE_KEY (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
console.log(`base: ${contenedor()} · API: ${URL_API}\n`);

const { prueba, cerrar } = arnes();

/** Corre el caso y devuelve 'ok' o el SQLSTATE del primer error. */
function correr(cuerpo) {
  const r = psql(`\\set VERBOSITY verbose
begin;
${fixturesSql()}
${cuerpo}
set constraints all immediate;
rollback;
`);
  if (r.status === 0) return "ok";
  const m = r.stderr.match(/ERROR:\s+([0-9A-Z]{5}):\s*([^\n]*)/);
  if (!m) throw new Error(`psql falló sin SQLSTATE: ${r.stderr}`);
  return `${m[1]} ${m[2]}`;
}

const caso = (nombre, esperado, cuerpo) => prueba(`${nombre} → ${esperado}`, () => {
  const obtenido = correr(cuerpo);
  if (process.env.DETALLE) console.log("   ", obtenido);
  assert.equal(obtenido.split(" ")[0], esperado, obtenido);
});

const A = `'${FX.autor}'`, L = `'${FX.lector}'`, V = FX.version, R = FX.resena;
const lit = (s) => `'${s.replace(/'/g, "''")}'`;
const asegurar = (cond, msg) => `do $$ begin assert ${cond}, ${lit(msg)}; end $$;`;
/** Una reseña nueva del lector (otro título) con una versión del texto dado. */
const resenaDelLector = (textoSql, { tmdb = 604, estado = "publicada", intento = "gen_random_uuid()" } = {}) => `
do $$ declare r bigint; v bigint; begin
  insert into comunidad.resenas (autor_participante, tipo, tmdb_id) values (${L}, 'movie', ${tmdb}) returning id into r;
  insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento)
    values (r, ${L}, ${textoSql}, '${estado}', '2026-10-24.2', ${intento}) returning id into v;
  update comunidad.resenas set version_vigente_id = v where id = r;
end $$;`;
const texto = (n) => `repeat('a', ${n})`;

// ---------------------------------------------------------------------------
console.log("— Control positivo —");
await caso("las fixtures completas (las once tablas) confirman", "ok",
  asegurar(`(select count(*) from comunidad.versiones where id = ${V} and estado = 'publicada') = 1`, "falta la versión"));
await caso("config: una sola fila, todo apagado por defecto y límites de §2.1.2", "ok",
  asegurar(`(select count(*) = 1 and bool_and(not modulo_activo and not publicacion_activa and not top_yumpers_activo)
             and bool_and(limite_resenas = 5 and limite_ediciones = 10 and limite_evaluaciones = 100
                          and limite_denuncias = 10 and limite_nombres = 3 and limite_bloqueos = 50)
             from comunidad.config)`, "config inesperada"));

// ---------------------------------------------------------------------------
console.log("\n— Autoría: FK compuesta y CHECK de la misma fila —");
await caso("autoevaluación (evaluador = autor de la versión)", "23514",
  `insert into comunidad.evaluaciones (version_id, autor_participante, evaluador_participante, util) values (${V}, ${A}, ${A}, true);`);
await caso("evaluación que declara otro autor que el de la versión", "23503",
  `insert into comunidad.evaluaciones (version_id, autor_participante, evaluador_participante, util) values (${V}, ${L}, ${A}, true);`);
await caso("denuncia de la propia reseña", "23514",
  `insert into comunidad.denuncias (version_id, autor_participante, denunciante_participante, categoria) values (${V}, ${A}, ${A}, 'spam');`);
await caso("denuncia que declara otro autor", "23503",
  `insert into comunidad.denuncias (version_id, autor_participante, denunciante_participante, categoria) values (${V}, ${L}, ${A}, 'spam');`);
await caso("tramo propio (evaluador = autor)", "23514",
  `insert into comunidad.tramos (evaluador_participante, autor_participante, version_id, mes_primera_positiva, vigente_desde) values (${A}, ${A}, ${V}, '2026-10-01', now());`);
await caso("tramo con un autor que no es el de la versión (trigger)", "23503",
  `insert into comunidad.participantes (id) values ('00000000-0000-4000-8000-00000000c0c1');
   insert into comunidad.tramos (evaluador_participante, autor_participante, version_id, mes_primera_positiva, vigente_desde) values ('00000000-0000-4000-8000-00000000c0c1', ${L}, ${V}, '2026-10-01', now());`);
await caso("tramo con una versión inexistente", "23503",
  `insert into comunidad.tramos (evaluador_participante, autor_participante, version_id, mes_primera_positiva, vigente_desde) values (${L}, ${A}, 999999999, '2026-10-01', now());`);
await caso("bloquearse a sí mismo", "23514",
  `insert into comunidad.bloqueos values (${A}, ${A});`);
await caso("una versión de una reseña con otro autor declarado", "23503",
  `insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento) values (${R}, ${L}, ${lit(TEXTO_OK)}, 'retenida', 'x', gen_random_uuid());`);

// ---------------------------------------------------------------------------
console.log("\n— Texto de la versión: largo, NFC y controles —");
await caso("79 caracteres", "23514", resenaDelLector(texto(79)));
await caso("80 caracteres", "ok", resenaDelLector(texto(80)));
await caso("600 caracteres", "ok", resenaDelLector(texto(600)));
await caso("601 caracteres", "23514", resenaDelLector(texto(601)));
await caso("600 letras astrales (600 puntos de código, 1200 unidades UTF-16)", "ok", resenaDelLector(`repeat(U&'\\+01D400', 600)`));
await caso("texto en NFD (e + acento combinante)", "23514", resenaDelLector(`repeat(U&'e\\0301', 80)`));
await caso("el mismo texto en NFC", "ok", resenaDelLector(`repeat(U&'\\00E9', 80)`));
await caso("con salto de línea (fin de oración)", "ok", resenaDelLector(`repeat('a', 40) || E'\\n' || repeat('b', 40)`));
await caso("con tabulación", "23514", resenaDelLector(`repeat('a', 40) || E'\\t' || repeat('b', 40)`));
await caso("con U+202E (inversión bidireccional)", "23514", resenaDelLector(`repeat('a', 40) || U&'\\202E' || repeat('b', 40)`));
await caso("con U+200B (espacio de ancho cero)", "23514", resenaDelLector(`repeat('a', 40) || U&'\\200B' || repeat('b', 40)`));
await caso("con U+0085 (control C1)", "23514", resenaDelLector(`repeat('a', 40) || U&'\\0085' || repeat('b', 40)`));

// ---------------------------------------------------------------------------
console.log("\n— Unicidad —");
await caso("segunda reseña viva del mismo autor y título", "23505",
  `insert into comunidad.resenas (autor_participante, tipo, tmdb_id) values (${A}, 'movie', 603);`);
await caso("mismo autor, otro tipo (tv 603) sí", "ok", `
  do $$ declare r bigint; v bigint; begin
    insert into comunidad.resenas (autor_participante, tipo, tmdb_id) values (${A}, 'tv', 603) returning id into r;
    insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento)
      values (r, ${A}, ${lit(TEXTO_OK)}, 'retenida', 'x', gen_random_uuid()) returning id into v;
    update comunidad.resenas set version_vigente_id = v where id = r;
  end $$;`);
await caso("después de borrar la suya (borrada_en), puede volver a reseñar el título", "ok", `
  update comunidad.resenas set borrada_en = now() where id = ${R};
  do $$ declare r bigint; v bigint; begin
    insert into comunidad.resenas (autor_participante, tipo, tmdb_id) values (${A}, 'movie', 603) returning id into r;
    insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento)
      values (r, ${A}, ${lit(TEXTO_OK)}, 'retenida', 'x', gen_random_uuid()) returning id into v;
    update comunidad.resenas set version_vigente_id = v where id = r;
  end $$;`);
await caso("segundo voto vigente del mismo evaluador a la misma versión", "23505",
  `insert into comunidad.evaluaciones (version_id, autor_participante, evaluador_participante, util) values (${V}, ${A}, ${L}, false);`);
await caso("retirado el voto, puede votar de nuevo", "ok",
  `update comunidad.evaluaciones set retirada_en = now() where evaluador_participante = ${L};
   insert into comunidad.evaluaciones (version_id, autor_participante, evaluador_participante, util) values (${V}, ${A}, ${L}, false);`);
await caso("segunda denuncia del mismo denunciante a la misma versión", "23505",
  `insert into comunidad.denuncias (version_id, autor_participante, denunciante_participante, categoria) values (${V}, ${A}, ${L}, 'odio');`);
await caso("segundo tramo abierto del mismo evaluador y versión", "23505",
  `insert into comunidad.tramos (evaluador_participante, autor_participante, version_id, mes_primera_positiva, vigente_desde) values (${L}, ${A}, ${V}, '2026-10-01', now());`);
await caso("segunda suspensión abierta del mismo participante", "23505",
  `insert into comunidad.suspensiones (participante_id, desde) values (${L}, now());`);
await caso("el mismo id_intento dos veces en la misma reseña (reintento)", "23505", `
  insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento)
    select ${R}, ${A}, ${lit(TEXTO_OK)}, 'retenida', 'x', id_intento from comunidad.versiones where id = ${V};`);
await caso("dos participantes con el mismo user_id", "23505",
  `insert into comunidad.participantes (user_id) values ('${FX.usuarioA}');`);
await caso("segunda fila de config", "23505", `insert into comunidad.config (id) values (true);`);
await caso("config con id = false", "23514", `insert into comunidad.config (id) values (false);`);

// ---------------------------------------------------------------------------
console.log("\n— Estados de versión y vigencia —");
const editar = (estadoNueva, estadoVieja = "reemplazada") => `
  do $$ declare v bigint; begin
    update comunidad.versiones set estado = '${estadoVieja}' where id = ${V};
    insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento)
      values (${R}, ${A}, ${lit(TEXTO_OK + " Editada.")}, '${estadoNueva}', '2026-10-24.2', gen_random_uuid()) returning id into v;
    update comunidad.resenas set version_vigente_id = v where id = ${R};
  end $$;`;
await caso("edición publicada: la vieja pasa a reemplazada y la vigente se mueve", "ok",
  editar("publicada") + asegurar(`(select estado from comunidad.versiones where id = ${V}) = 'reemplazada'`, "no quedó reemplazada"));
await caso("edición retenida: la vieja deja de verse (reemplazada)", "ok", editar("retenida"));
await caso("reemplazada → publicada", "23514",
  editar("publicada") + `update comunidad.versiones set estado = 'publicada' where id = ${V};`);
await caso("rechazada → publicada", "23514", `
  update comunidad.versiones set estado = 'retenida' where id = ${V};
  update comunidad.versiones set estado = 'rechazada' where id = ${V};
  update comunidad.versiones set estado = 'publicada' where id = ${V};`);
await caso("publicada → oculta → publicada (restauración del admin)", "ok", `
  update comunidad.versiones set estado = 'oculta' where id = ${V};
  update comunidad.versiones set estado = 'publicada' where id = ${V};`);
await caso("revision_solicitada → publicada (el admin aprueba)", "ok",
  resenaDelLector(`${lit(TEXTO_OK)}`, { estado: "revision_solicitada" }) + `
  update comunidad.versiones set estado = 'publicada' where autor_participante = ${L};`);
await caso("una versión no nace reemplazada", "23514",
  resenaDelLector(`${lit(TEXTO_OK)}`, { estado: "reemplazada" }));
await caso("una versión no nace oculta", "23514",
  resenaDelLector(`${lit(TEXTO_OK)}`, { estado: "oculta" }));
await caso("el texto de una versión no cambia", "23514",
  `update comunidad.versiones set texto = texto || ' x' where id = ${V};`);
await caso("una reseña no cambia de título", "23514",
  `update comunidad.resenas set tmdb_id = 604 where id = ${R};`);
await caso("dos versiones publicadas: la nueva no es la vigente (al confirmar)", "23514", `
  insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento)
    values (${R}, ${A}, ${lit(TEXTO_OK + " Otra.")}, 'publicada', 'x', gen_random_uuid());`);
await caso("mover la vigente sin reemplazar la publicada anterior (al confirmar)", "23514", `
  do $$ declare v bigint; begin
    insert into comunidad.versiones (resena_id, autor_participante, texto, estado, version_reglas, id_intento)
      values (${R}, ${A}, ${lit(TEXTO_OK + " Otra.")}, 'retenida', 'x', gen_random_uuid()) returning id into v;
    update comunidad.resenas set version_vigente_id = v where id = ${R};
  end $$;`);
await caso("la vigente marcada reemplazada sin moverla (al confirmar)", "23514",
  `update comunidad.versiones set estado = 'reemplazada' where id = ${V};`);
await caso("reseña sin versión vigente (al confirmar)", "23514",
  `insert into comunidad.resenas (autor_participante, tipo, tmdb_id) values (${L}, 'movie', 605);`);
await caso("vigente que apunta a una versión de OTRA reseña (al confirmar)", "23503",
  resenaDelLector(`${lit(TEXTO_OK)}`, { estado: "retenida" }) + `update comunidad.resenas set version_vigente_id = ${V} where autor_participante = ${L};`);

// ---------------------------------------------------------------------------
console.log("\n— Tramos y suspensiones: intervalos que sólo se cierran —");
await caso("cerrar un tramo", "ok", `update comunidad.tramos set vigente_hasta = now() + interval '1 second' where version_id = ${V};`);
await caso("cerrar un tramo dos veces", "23514", `
  update comunidad.tramos set vigente_hasta = now() + interval '1 second' where version_id = ${V};
  update comunidad.tramos set vigente_hasta = now() + interval '2 second' where version_id = ${V};`);
await caso("reabrir un tramo cerrado", "23514", `
  update comunidad.tramos set vigente_hasta = now() + interval '1 second' where version_id = ${V};
  update comunidad.tramos set vigente_hasta = null where version_id = ${V};`);
await caso("cerrar un tramo antes de que empiece (intervalo vacío)", "23514",
  `update comunidad.tramos set vigente_hasta = vigente_desde where version_id = ${V};`);
await caso("un tramo no nace cerrado", "23514",
  `insert into comunidad.tramos (evaluador_participante, autor_participante, version_id, mes_primera_positiva, vigente_desde, vigente_hasta)
     values (${L}, ${A}, ${V}, '2026-09-01', now() - interval '1 day', now());`);
await caso("mes de primera positiva que no es día 1", "23514",
  `update comunidad.tramos set vigente_hasta = now() + interval '1 second' where version_id = ${V};
   insert into comunidad.tramos (evaluador_participante, autor_participante, version_id, mes_primera_positiva, vigente_desde) values (${L}, ${A}, ${V}, '2026-10-15', now());`);
await caso("un tramo sobrevive al borrado de su reseña (versión sin FK)", "ok", `
  delete from comunidad.resenas where id = ${R};
  ${asegurar(`(select count(*) from comunidad.tramos where version_id = ${V}) = 1`, "el tramo no sobrevivió")}
  ${asegurar(`(select count(*) from comunidad.evaluaciones where version_id = ${V}) = 0`, "el voto no cayó con la versión")}`);
await caso("cerrar una suspensión y volver a cerrarla", "23514", `
  update comunidad.suspensiones set hasta = now() + interval '1 second' where participante_id = ${L};
  update comunidad.suspensiones set hasta = now() + interval '2 second' where participante_id = ${L};`);
await caso("cerrada la suspensión, puede abrirse otra", "ok", `
  update comunidad.suspensiones set hasta = now() + interval '1 second' where participante_id = ${L};
  insert into comunidad.suspensiones (participante_id, desde) values (${L}, now() + interval '1 hour');`);

// ---------------------------------------------------------------------------
console.log("\n— Nombre comunitario —");
const nombre = (expr) => `update comunidad.participantes set nombre_comunitario = ${expr} where id = ${L};`;
await caso("1 carácter", "23514", nombre(`'a'`));
await caso("2 caracteres", "ok", nombre(`'ab'`));
await caso("24 caracteres", "ok", nombre(`repeat('b', 24)`));
await caso("25 caracteres", "23514", nombre(`repeat('b', 25)`));
await caso("con un control (U+0007)", "23514", nombre(`'ab' || U&'\\0007' || 'cd'`));
await caso("con salto de línea", "23514", nombre(`'ab' || E'\\n' || 'cd'`));
await caso("con U+202E", "23514", nombre(`'ab' || U&'\\202E' || 'cd'`));
await caso("con espacio inicial", "23514", nombre(`' abc'`));
await caso("en NFD", "23514", nombre(`U&'Jose\\0301'`));
await caso("en NFC, con espacio interior", "ok", nombre(`U&'Jos\\00E9 Luis'`));

// ---------------------------------------------------------------------------
console.log("\n— Denuncias, contadores, bloqueos —");
await caso("categoría fuera de la lista", "23514",
  `insert into comunidad.denuncias (version_id, autor_participante, denunciante_participante, categoria) values (${V}, ${A}, '00000000-0000-4000-8000-00000000c0b1', 'insulto');`);
await caso("comentario de 301 caracteres", "23514", `update comunidad.denuncias set comentario = repeat('c', 301);`);
await caso("comentario de 300 caracteres", "ok", `update comunidad.denuncias set comentario = repeat('c', 300);`);
await caso("cerrar una denuncia sin fecha de cierre", "23514", `update comunidad.denuncias set estado = 'descartada';`);
await caso("cerrar una denuncia con fecha", "ok", `update comunidad.denuncias set estado = 'descartada', cerrada_en = now();`);
await caso("contador negativo", "23514", `update comunidad.contadores set cantidad = -1;`);
await caso("acción de contador desconocida", "23514",
  `insert into comunidad.contadores (participante_id, accion, dia) values (${L}, 'voto', '2026-10-24');`);
await caso("tipo de reseña desconocido", "23514",
  `insert into comunidad.resenas (autor_participante, tipo, tmdb_id) values (${L}, 'serie', 1);`);

// ---------------------------------------------------------------------------
console.log("\n— Auth: borrado de la cuenta —");
await caso("borrar auth.users (SQL): participante queda con user_id nulo y conserva su reseña; el marcador de baja cae", "ok", `
  delete from auth.users where id in ('${FX.usuarioA}', '${FX.usuarioB}');
  ${asegurar(`(select user_id is null from comunidad.participantes where id = ${A})`, "user_id no quedó nulo")}
  ${asegurar(`(select count(*) from comunidad.resenas where autor_participante = ${A}) = 1`, "la reseña no sobrevivió")}
  ${asegurar(`(select count(*) from comunidad.bajas_en_curso) = 0`, "el marcador no cayó")}`);
await caso("borrar un participante con reseñas está prohibido (no hay cascada desde participantes)", "23503",
  `delete from comunidad.participantes where id = ${A};`);

await prueba("borrar con la API real de Auth (admin.deleteUser): user_id → null, marcador → borrado", async () => {
  const admin = createClient(URL_API, SRV, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `baja-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: randomBytes(18).toString("base64url"), email_confirm: true });
  assert.ifError(error);
  const uid = data.user.id;
  const pid = sqlOk(`insert into comunidad.participantes (user_id, nombre_comunitario) values ('${uid}', 'Baja') returning id;
    insert into comunidad.bajas_en_curso (user_id) values ('${uid}');`).split("\n")[0];
  const { error: e2 } = await admin.auth.admin.deleteUser(uid);
  assert.ifError(e2);
  assert.equal(sqlOk(`select coalesce(user_id::text, 'null') || '|' || nombre_comunitario from comunidad.participantes where id = '${pid}'`), "null|Baja");
  assert.equal(sqlOk(`select count(*) from comunidad.bajas_en_curso where user_id = '${uid}'`), "0");
  // Fixture local: se borra (el dueño puede, la API no).
  sqlOk(`delete from comunidad.participantes where id = '${pid}'`);
});

await prueba("ninguna fixture de los casos quedó en la base", () => {
  assert.equal(sqlOk(`select count(*) from comunidad.resenas where id = ${R}`), "0");
  assert.equal(sqlOk(`select count(*) from auth.users where id in ('${FX.usuarioA}', '${FX.usuarioB}')`), "0");
});

cerrar();
