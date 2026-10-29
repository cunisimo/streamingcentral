#!/usr/bin/env node
// A1 de la auditoría de E6 (sobre 8cbe0cd): recuperar un cambio de nombre
// tras una respuesta perdida NO puede volver a aplicarlo, pisar un nombre
// posterior ni consumir cupo dos veces. FUNCIONES REALES contra
// `supabase start`. SÓLO LOCAL.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-nombre-intento.mjs
//   RAIZ=<carpeta con otra copia de lib/> … (para correrla contra la versión
//   anterior —núcleo y adaptador de 8cbe0cd, con su 019 aplicada— y verla fallar)
//
// Qué es real: el núcleo de la ruta (`cambiarNombre`), su adaptador
// (`dependenciasNombre`), las reglas de E1 y `comunidad_cambiar_nombre`,
// con sus transacciones. Qué es simulado: la PÉRDIDA de respuesta. Un `fetch`
// envuelve al cliente del adaptador: hace el pedido real a PostgREST (la base
// confirma) y descarta la respuesta, como una caída de red después del commit.
// La intercalación de otra sesión corre en ese momento, con el núcleo real y
// otro cliente, antes de que el núcleo reintente.
//
// Cuentas ficticias `@comunidad.test`; al final se borran ellas y lo que
// crearon. Configuración e interruptores vuelven a como estaban.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { arnes, contenedor, sqlOk, urlLocal } from "./local.mjs";
import { operacionesComunidad } from "../../lib/comunidad/escritura-deps.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";

const RAIZ = process.env.RAIZ ? pathToFileURL(resolve(process.env.RAIZ)).href + "/" : new URL("../../lib/", import.meta.url).href;
const { cambiarNombre } = await import(`${RAIZ}comunidad/nombre-nucleo.ts`);
const { dependenciasNombre } = await import(`${RAIZ}comunidad/escritura-deps.ts`);

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SRV) { console.error("Faltan claves (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
console.log(`base: ${contenedor()} · núcleo: ${process.env.RAIZ ?? "lib/"}\n`);

const opc = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const srv = createClient(URL_API, SRV, opc);
const ops = operacionesComunidad(srv);
const otraSesion = dependenciasNombre(createClient(URL_API, SRV, opc));

// El cliente de la ruta, con pérdida de respuesta e intercalación inyectables.
const red = { perder: 0, perdidas: 0, llamadas: 0, alPerder: null };
const cliRuta = createClient(URL_API, SRV, {
  ...opc,
  global: {
    fetch: async (input, init) => {
      const r = await fetch(input, init);
      if (/rpc\/comunidad_cambiar_nombre/.test(String(input?.url ?? input))) {
        red.llamadas++;
        if (red.perder > 0) {
          await r.arrayBuffer(); // la base YA respondió (commit hecho); la respuesta se pierde
          red.perder--;
          red.perdidas++;
          const f = red.alPerder;
          red.alPerder = null;
          if (f) await f();
          throw new TypeError("fetch failed (respuesta perdida, simulada)");
        }
      }
      return r;
    },
  },
});
const ruta = dependenciasNombre(cliRuta);

const { prueba, cerrar } = arnes();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (v) => { if (!UUID.test(v)) throw new Error(`uuid inesperado: ${v}`); return `'${v}'`; };
const cuentas = new Set(), participantes = new Set();
async function cuenta(et) {
  const email = `nint-${et}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
  const { data, error } = await srv.auth.admin.createUser({ email, password: `Pa-${randomBytes(15).toString("base64url")}`, email_confirm: true });
  if (error) throw error;
  cuentas.add(data.user.id);
  assert.equal((await ops.aceptarTerminos(data.user.id, TERMINOS_VERSION)).resultado, "terminos_aceptados");
  const part = sqlOk(`select id from comunidad.participantes where user_id = ${q(data.user.id)}`);
  participantes.add(part);
  return { uid: data.user.id, part };
}
const config = (cols) => sqlOk(`update comunidad.config set ${Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(", ")} where id`);
const configPrevia = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));
/** nombre|cupo|cambiado_en de la cuenta, leídos de la base. */
const enBase = (c) => sqlOk(`select coalesce(p.nombre_comunitario, '∅') || '|' ||
  coalesce((select sum(cantidad) from comunidad.contadores where participante_id = p.id and accion = 'nombre'), 0) || '|' ||
  coalesce(p.nombre_cambiado_en::text, '∅') from comunidad.participantes p where p.id = ${q(c.part)}`).split("|");
/** El envío de la ruta: el núcleo real con el adaptador de la ruta. */
const enviar = (c, nombre, idIntento, { perder = 0, alPerder = null } = {}) => {
  red.perder = perder;
  red.alPerder = alPerder;
  red.llamadas = 0;
  return cambiarNombre(ruta, { uid: c.uid, nombre, idIntento }).finally(() => { red.perder = 0; red.alPerder = null; });
};

config({ modulo_activo: true, publicacion_activa: true });
try {
  await prueba("1 · respuesta perdida SIN intervención: el reintento recupera nombre_cambiado; una escritura y un cupo", async () => {
    const c = await cuenta("uno");
    const r = await enviar(c, "Nombre Uno", randomUUID(), { perder: 1 });
    const [nombre, cupo, cambiado] = enBase(c);
    assert.equal(red.llamadas, 2, "el núcleo reintenta una vez");
    assert.deepEqual([nombre, cupo], ["Nombre Uno", "1"]);
    assert.notEqual(cambiado, "∅");
    assert.deepEqual([r.resultado, r.repetido], ["nombre_cambiado", true], "la confirmación recuperada es la del intento, no un sin_cambios");
  });

  await prueba("2 · primer nombre guardado, respuesta perdida, OTRA sesión confirma un segundo nombre, reintento del primero: queda el segundo", async () => {
    const c = await cuenta("dos");
    let intercalado;
    const r = await enviar(c, "Nombre Anterior", randomUUID(), {
      perder: 1,
      alPerder: async () => { intercalado = await cambiarNombre(otraSesion, { uid: c.uid, nombre: "Nombre Posterior", idIntento: randomUUID() }); },
    });
    assert.equal(intercalado?.resultado, "nombre_cambiado");
    const [nombre, cupo] = enBase(c);
    assert.equal(nombre, "Nombre Posterior", "el reintento no puede pisar el nombre posterior");
    assert.equal(cupo, "2", "dos intentos, dos cupos: el reintento no consume");
    assert.equal(r.resultado, "nombre_cambiado", "el intento original sí se había guardado");
  });

  await prueba("3 · rechazo de contenido con la respuesta perdida: un solo cupo para el envío; el nombre rechazado no se guarda en claro", async () => {
    const c = await cuenta("tres");
    const r = await enviar(c, "juan arroba gmail", randomUUID(), { perder: 1 });
    assert.equal(r.resultado, "rechazo_contenido");
    const [nombre, cupo] = enBase(c);
    assert.deepEqual([nombre, cupo], ["∅", "1"]);
    const guardado = sqlOk(`select coalesce(string_agg(hash_peticion || resultado::text, ','), '') from comunidad.intentos where participante_id = ${q(c.part)}`);
    assert.doesNotMatch(guardado, /juan|arroba|gmail/i);
    // El hash no es un SHA-256 adivinable del pedido: es un HMAC con el secreto del servidor.
    const { createHash } = await import("node:crypto");
    assert.ok(!guardado.includes(createHash("sha256").update(JSON.stringify(["nombre", "juan arroba gmail"])).digest("hex")));
  });

  await prueba("4 · reintentos sucesivos del mismo intento (dos pérdidas → sin_confirmar, y la persona reintenta dos veces): un efecto, un cupo, misma marca", async () => {
    const c = await cuenta("cuatro");
    const id = randomUUID();
    const a = await enviar(c, "Nombre Firme", id, { perder: 2 });
    assert.equal(a.resultado, "sin_confirmar", "sin confirmación: incertidumbre, nunca «no se guardó»");
    const [n1, c1, t1] = enBase(c);
    assert.deepEqual([n1, c1], ["Nombre Firme", "1"]);
    assert.doesNotMatch(sqlOk(`select string_agg(resultado::text, ',') from comunidad.intentos where participante_id = ${q(c.part)}`), /Nombre Firme/,
      "ni el nombre aceptado queda en el intento (la baja no borra intentos)");
    for (let i = 0; i < 2; i++) {
      const b = await enviar(c, "Nombre Firme", id);
      assert.deepEqual([b.resultado, b.repetido], ["nombre_cambiado", true], `reintento ${i + 1}`);
      assert.deepEqual(enBase(c), [n1, c1, t1], `reintento ${i + 1}: sin otra escritura ni cupo`);
    }
    // Lo mismo con un rechazo: reintentarlo no vuelve a consumir.
    const idR = randomUUID();
    for (let i = 0; i < 3; i++) assert.equal((await enviar(c, "wsp 11 5555 4444", idR)).resultado, "rechazo_contenido");
    assert.equal(enBase(c)[1], "2");
  });

  await prueba("5 · concurrencia (protocolo de locks): el MISMO intento dos veces a la vez → un efecto y un cupo; dos intentos distintos a la vez → dos cupos, sin deadlock", async () => {
    const c = await cuenta("cinco");
    const id = randomUUID();
    const [a, b] = await Promise.all([enviar(c, "Mismo Intento", id), cambiarNombre(otraSesion, { uid: c.uid, nombre: "Mismo Intento", idIntento: id })]);
    assert.deepEqual([a.resultado, b.resultado], ["nombre_cambiado", "nombre_cambiado"]);
    assert.equal([a, b].filter((x) => x.repetido === true).length, 1, "uno resolvió, el otro recuperó");
    assert.deepEqual(enBase(c).slice(0, 2), ["Mismo Intento", "1"]);
    const [x, y] = await Promise.all([
      cambiarNombre(otraSesion, { uid: c.uid, nombre: "Paralelo Uno", idIntento: randomUUID() }),
      enviar(c, "Paralelo Dos", randomUUID()),
    ]);
    assert.deepEqual([x.resultado, y.resultado], ["nombre_cambiado", "nombre_cambiado"]);
    const [nombre, cupo] = enBase(c);
    assert.ok(["Paralelo Uno", "Paralelo Dos"].includes(nombre));
    assert.equal(cupo, "3");
    assert.equal(sqlOk("select count(*) from pg_locks where locktype = 'advisory'"), "0");
  });
} finally {
  console.log("\n— Limpieza (base compartida): sólo lo de esta corrida —");
  try {
    const prev = configPrevia;
    config({ modulo_activo: prev.modulo_activo, publicacion_activa: prev.publicacion_activa, top_yumpers_activo: prev.top_yumpers_activo, muestreo_activo: prev.muestreo_activo ?? false });
    for (const u of cuentas) await srv.auth.admin.deleteUser(u, false);
    const todos = [...participantes].map(q).join(",");
    if (todos) sqlOk(`begin;
      delete from comunidad.intentos where participante_id in (${todos});
      delete from comunidad.contadores where participante_id in (${todos});
      delete from comunidad.participantes where id in (${todos});
      commit;`);
    const us = [...cuentas].map(q).join(",");
    console.log(`   cuentas: ${cuentas.size}; respuestas perdidas simuladas: ${red.perdidas}; restos (cuentas|participantes|interruptores): ${sqlOk(`select
      (select count(*) from auth.users where id in (${us || "null"})) || '|' ||
      (select count(*) from comunidad.participantes where id in (${todos || "null"})) || '|' ||
      (select (modulo_activo or publicacion_activa or top_yumpers_activo or muestreo_activo)::text from comunidad.config)`)}`);
  } catch (e) {
    console.error("   ⚠️ la limpieza falló:", e.message);
    process.exitCode = 1;
  }
  cerrar();
}
