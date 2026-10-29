#!/usr/bin/env node
// A1 de la auditoría de E5a (sobre b7ba962): el voto confirmado por una
// reconciliación (`sin_cambios` / `sin_efecto`) tiene que verse en la lista,
// sin reiniciarla a cinco y sin contar dos veces. FUNCIONES REALES contra
// `supabase start`. SÓLO LOCAL.
//
// Uso:
//   node --env-file=.env.comunidad-local scripts/comunidad/pruebas-voto-lista.mjs
//   NUCLEO=<ruta a otra lista-nucleo.ts> … (para correrla contra la versión
//   anterior y verla fallar)
//
// Qué es real: la lista se arma con `comunidad_resenas` leída con la sesión
// REAL del lector (lib/comunidad/lectura.ts, como la ruta), dos páginas; cada
// toque hace lo mismo que el componente: `accionVoto` sobre lo que se ve →
// el adaptador REAL de la ruta de votos (`operacionesComunidad(...).votar` /
// `.retirarVoto`, con su reconciliación) → `trasVoto`. La verdad se lee
// después con la función real como el lector.
// Qué es simulado: la PÉRDIDA de respuesta. Un `fetch` envuelve al cliente de
// la ruta: hace el pedido real a PostgREST (la base confirma) y descarta la
// respuesta, igual que una caída de red después del commit.
//
// Cuentas ficticias `@comunidad.test`; al final se borran ellas y lo que
// crearon. Configuración e interruptores vuelven a como estaban.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { arnes, contenedor, leerComo, sqlOk, urlLocal } from "./local.mjs";
import { operacionesComunidad, dependenciasEscritura, sha256 } from "../../lib/comunidad/escritura-deps.ts";
import { normalizarTexto } from "../../lib/comunidad/texto.ts";
import { huella, secretoDuplicados } from "../../lib/comunidad/duplicados.ts";
import { TERMINOS_VERSION } from "../../lib/comunidad/terminos.ts";
import { leerResenas, pedidoLectura } from "../../lib/comunidad/lectura.ts";
import { accionVoto, mensajeVoto } from "../../lib/comunidad/evaluacion-nucleo.ts";

const NUCLEO = process.env.NUCLEO ? pathToFileURL(resolve(process.env.NUCLEO)).href : "../../lib/comunidad/lista-nucleo.ts";
const { claveLista, conPrimeraPagina, listaVacia, pedirMas, alLlegarMas, tandaValida, trasVoto } = await import(NUCLEO);

const URL_API = urlLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ANON || !SRV) { console.error("Faltan claves (¿--env-file=.env.comunidad-local?)"); process.exit(2); }
const SECRETO = secretoDuplicados();
if (!SECRETO?.startsWith("local-prueba-")) { console.error("Falta el secreto HMAC LOCAL de prueba"); process.exit(2); }
console.log(`base: ${contenedor()} · API ${URL_API} · núcleo: ${process.env.NUCLEO ?? "lib/comunidad/lista-nucleo.ts"}\n`);

const opc = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const srv = createClient(URL_API, SRV, opc);
const deps = dependenciasEscritura(srv);
const ops = operacionesComunidad(srv);

// El cliente de la ruta de votos, con pérdida de respuesta inyectable.
const perdida = { restantes: 0, perdidas: 0 };
const srvRuta = createClient(URL_API, SRV, {
  ...opc,
  global: {
    fetch: async (input, init) => {
      const r = await fetch(input, init);
      const u = String(input?.url ?? input);
      if (perdida.restantes > 0 && /rpc\/comunidad_(votar|retirar_voto)/.test(u)) {
        await r.arrayBuffer(); // la base YA respondió (commit hecho); la respuesta se pierde
        perdida.restantes--;
        perdida.perdidas++;
        throw new TypeError("fetch failed (respuesta perdida, simulada)");
      }
      return r;
    },
  },
});
const opsRuta = operacionesComunidad(srvRuta);

const { prueba, cerrar } = arnes();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (v) => { if (!UUID.test(v)) throw new Error(`uuid inesperado: ${v}`); return `'${v}'`; };
const cuentas = new Set(), participantes = new Set();
async function cuenta(et) {
  const email = `vlis-${et}-${Date.now()}-${randomBytes(3).toString("hex")}@comunidad.test`;
  const password = `Pa-${randomBytes(15).toString("base64url")}`;
  const { data, error } = await srv.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  cuentas.add(data.user.id);
  assert.equal((await ops.aceptarTerminos(data.user.id, TERMINOS_VERSION)).resultado, "terminos_aceptados");
  const part = sqlOk(`select id from comunidad.participantes where user_id = ${q(data.user.id)}`);
  participantes.add(part);
  return { uid: data.user.id, email, password, part };
}
const ORD = ["primera", "segunda", "tercera", "cuarta", "quinta", "sexta", "séptima"];
let n = 0;
async function publicar(c, tmdbId) {
  const t = `Reseña ficticia ${ORD[n++]} para la prueba del voto en la lista. La fotografía es preciosa y el guion se toma su tiempo sin aburrir nunca.`;
  const r = await deps.publicar({ uid: c.uid, tipo: "movie", tmdbId, texto: t, idIntento: randomUUID(), hash: sha256(t),
    decision: { resultado: "publicar", version_reglas: "prueba-e5a-a1", reglas: [], huella: huella(normalizarTexto(t), SECRETO) } });
  assert.equal(r.resultado, "publicada", JSON.stringify(r));
  return r;
}

const config = (cols) => sqlOk(`update comunidad.config set ${Object.entries(cols).map(([k, v]) => `${k} = ${v}`).join(", ")} where id`);
const configPrevia = JSON.parse(sqlOk("select row_to_json(c)::text from comunidad.config c"));
const S = {};

/** Lo que hace el componente al tocar un pulgar. `perder`: cuántas respuestas de la base se pierden. */
async function tocar(lista, versionId, boton, perder = 0) {
  const item = lista.items.find((x) => x.version_id === versionId);
  const enviado = accionVoto(item.mi_voto, boton);
  perdida.restantes = perder;
  const r = enviado === "retirar" ? await opsRuta.retirarVoto(S.lector.uid, versionId) : await opsRuta.votar(S.lector.uid, versionId, enviado === "util");
  perdida.restantes = 0;
  return { enviado, resultado: r.resultado, mensaje: mensajeVoto(r), lista: trasVoto(lista, versionId, r.resultado, enviado) };
}
/** La verdad en la base, leída con la función real como el lector. */
function enBase(versionId) {
  const r = leerComo(S.lector.uid, "movie", S.T, { limite: 20 });
  const x = r.items.find((i) => i.version_id === versionId);
  return { mi_voto: x.mi_voto ?? null, utiles: x.utiles, total: x.total };
}
const enPantalla = (lista, versionId) => { const x = lista.items.find((i) => i.version_id === versionId); return { mi_voto: x.mi_voto, utiles: x.utiles, total: x.total }; };

config({ modulo_activo: true, publicacion_activa: true });
try {
  await prueba("preparación: 7 reseñas reales (dos páginas: 5 + 2), un lector con sesión real y otra cuenta que ya votó dos", async () => {
    S.T = 9_600_000 + Math.floor(Math.random() * 10_000) * 10;
    S.lector = await cuenta("lector");
    S.otro = await cuenta("otro");
    S.r = [];
    for (let i = 0; i < 7; i++) S.r.push(await publicar(await cuenta(`au${i}`), S.T));
    // Votos ajenos previos, para que los conteos no arranquen en cero.
    assert.equal((await ops.votar(S.otro.uid, S.r[6].version_id, true)).resultado, "voto_registrado");
    assert.equal((await ops.votar(S.otro.uid, S.r[5].version_id, false)).resultado, "voto_registrado");
    const cli = createClient(URL_API, ANON, opc);
    const { data, error } = await cli.auth.signInWithPassword({ email: S.lector.email, password: S.lector.password });
    if (error) throw error;
    S.sb = createClient(URL_API, ANON, { ...opc, global: { headers: { Authorization: `Bearer ${data.session.access_token}` } } });
    // La lista REAL: primera página y "Cargar más", como el componente.
    const clave = claveLista(S.lector.uid, "movie", S.T, "recientes");
    const p1 = await leerResenas(S.sb, pedidoLectura(new URLSearchParams(`tipo=movie&id=${S.T}`)));
    let l = conPrimeraPagina(listaVacia(clave), tandaValida(p1, "recientes"));
    const m = pedirMas(l);
    const p2 = await leerResenas(S.sb, pedidoLectura(new URLSearchParams(`tipo=movie&id=${S.T}&cursor=${m.pedido.cursor}`)));
    l = alLlegarMas(m.estado, m.pedido.n, m.pedido.clave, tandaValida(p2, "recientes"));
    assert.deepEqual([l.items.length, new Set(l.items.map((x) => x.resena_id)).size, l.hayMas, l.cursor], [7, 7, false, null]);
    S.lista = l;
  });

  const caso = (nombre, fn) => prueba(nombre, async () => {
    await fn();
    // Siempre: la lista sigue con las dos páginas cargadas, sin duplicados ni recarga.
    assert.deepEqual([S.lista.items.length, new Set(S.lista.items.map((x) => x.resena_id)).size, S.lista.hayMas], [7, 7, false]);
  });
  const v = (i) => S.r[i].version_id;

  await caso("positivo SIN pérdida: voto_registrado; pantalla = base; el siguiente toque RETIRA", async () => {
    const t = await tocar(S.lista, v(0), "util");
    assert.deepEqual([t.enviado, t.resultado, t.mensaje], ["util", "voto_registrado", null]);
    S.lista = t.lista;
    assert.deepEqual(enPantalla(S.lista, v(0)), enBase(v(0)));
    assert.equal(accionVoto(enPantalla(S.lista, v(0)).mi_voto, "util"), "retirar");
  });

  await caso("positivo con la PRIMERA respuesta perdida: la reconciliación confirma sin_cambios; pantalla = base (util, sin contar dos veces); el siguiente toque RETIRA", async () => {
    const antes = enPantalla(S.lista, v(1));
    const t = await tocar(S.lista, v(1), "util", 1);
    assert.deepEqual([t.enviado, t.resultado, t.mensaje, perdida.perdidas > 0], ["util", "sin_cambios", null, true]);
    S.lista = t.lista;
    assert.deepEqual(enPantalla(S.lista, v(1)), enBase(v(1)));
    assert.deepEqual(enPantalla(S.lista, v(1)), { mi_voto: "util", utiles: antes.utiles + 1, total: antes.total + 1 });
    assert.equal(accionVoto(enPantalla(S.lista, v(1)).mi_voto, "util"), "retirar", "el siguiente toque tiene que retirar, no volver a votar");
  });

  await caso("negativo SIN pérdida: voto_registrado; pantalla = base; el siguiente toque del mismo pulgar RETIRA", async () => {
    const t = await tocar(S.lista, v(3), "no_util");
    assert.deepEqual([t.enviado, t.resultado, t.mensaje], ["no_util", "voto_registrado", null]);
    S.lista = t.lista;
    assert.deepEqual(enPantalla(S.lista, v(3)), enBase(v(3)));
    assert.deepEqual(enPantalla(S.lista, v(3)), { mi_voto: "no_util", utiles: 0, total: 1 });
    assert.equal(accionVoto(enPantalla(S.lista, v(3)).mi_voto, "no_util"), "retirar");
  });

  await caso("negativo con la primera respuesta perdida (reseña con un voto ajeno negativo): sin_cambios; pantalla = base", async () => {
    const t = await tocar(S.lista, v(5), "no_util", 1);
    assert.deepEqual([t.enviado, t.resultado], ["no_util", "sin_cambios"]);
    S.lista = t.lista;
    assert.deepEqual(enPantalla(S.lista, v(5)), enBase(v(5)));
    assert.deepEqual(enPantalla(S.lista, v(5)), { mi_voto: "no_util", utiles: 0, total: 2 });
  });

  await caso("CAMBIO de voto (útil → no útil) con la primera respuesta perdida: sin_cambios; útiles −1, total igual; pantalla = base", async () => {
    const antes = enPantalla(S.lista, v(1));
    const t = await tocar(S.lista, v(1), "no_util", 1);
    assert.deepEqual([t.enviado, t.resultado], ["no_util", "sin_cambios"]);
    S.lista = t.lista;
    assert.deepEqual(enPantalla(S.lista, v(1)), enBase(v(1)));
    assert.deepEqual(enPantalla(S.lista, v(1)), { mi_voto: "no_util", utiles: antes.utiles - 1, total: antes.total });
  });

  await caso("RETIRO con la primera respuesta perdida: la reconciliación confirma sin_efecto; pantalla = base (sin voto); el siguiente toque VOTA", async () => {
    const t = await tocar(S.lista, v(1), "no_util", 1);
    assert.deepEqual([t.enviado, t.resultado, t.mensaje], ["retirar", "sin_efecto", null]);
    S.lista = t.lista;
    assert.deepEqual(enPantalla(S.lista, v(1)), enBase(v(1)));
    assert.equal(enPantalla(S.lista, v(1)).mi_voto, null);
    assert.equal(accionVoto(null, "no_util"), "no_util");
  });

  await caso("retiro SIN pérdida (voto_retirado) sobre una reseña con voto ajeno: pantalla = base", async () => {
    let t = await tocar(S.lista, v(6), "util");
    S.lista = t.lista;
    assert.deepEqual(enPantalla(S.lista, v(6)), { mi_voto: "util", utiles: 2, total: 2 });
    t = await tocar(S.lista, v(6), "util");
    assert.deepEqual([t.enviado, t.resultado], ["retirar", "voto_retirado"]);
    S.lista = t.lista;
    assert.deepEqual(enPantalla(S.lista, v(6)), enBase(v(6)));
    assert.deepEqual(enPantalla(S.lista, v(6)), { mi_voto: null, utiles: 1, total: 1 });
  });

  await caso("pérdida de AMBAS respuestas: sin_confirmar, la pantalla NO cambia y avisa la incertidumbre; el reintento posterior confirma sin_cambios y la pantalla queda = base", async () => {
    const antes = enPantalla(S.lista, v(2));
    const t = await tocar(S.lista, v(2), "util", 2);
    assert.deepEqual([t.enviado, t.resultado], ["util", "sin_confirmar"]);
    assert.ok(t.mensaje && /sabemos|confirm/i.test(t.mensaje), `mensaje de incertidumbre: ${t.mensaje}`);
    assert.equal(t.lista, S.lista, "un sin_confirmar no se muestra como éxito");
    assert.deepEqual(enPantalla(t.lista, v(2)), antes);
    assert.equal(enBase(v(2)).mi_voto, "util", "la base sí lo guardó (commit antes de perder la respuesta)");
    // La persona vuelve a tocar el mismo pulgar: lo que ve dice "sin voto", así que envía "util" otra vez.
    const r = await tocar(S.lista, v(2), "util");
    assert.deepEqual([r.enviado, r.resultado, r.mensaje], ["util", "sin_cambios", null]);
    S.lista = r.lista;
    assert.deepEqual(enPantalla(S.lista, v(2)), enBase(v(2)));
    assert.deepEqual(enPantalla(S.lista, v(2)), { mi_voto: "util", utiles: antes.utiles + 1, total: antes.total + 1 });
  });

  await caso("pérdida de AMBAS respuestas al retirar: sin_confirmar sin cambio visible; el reintento confirma sin_efecto y la pantalla queda sin voto = base", async () => {
    const t = await tocar(S.lista, v(2), "util", 2);
    assert.deepEqual([t.enviado, t.resultado], ["retirar", "sin_confirmar"]);
    assert.equal(t.lista, S.lista);
    assert.equal(enBase(v(2)).mi_voto, null);
    const r = await tocar(S.lista, v(2), "util");
    assert.deepEqual([r.enviado, r.resultado], ["retirar", "sin_efecto"]);
    S.lista = r.lista;
    assert.deepEqual(enPantalla(S.lista, v(2)), enBase(v(2)));
    assert.equal(enPantalla(S.lista, v(2)).mi_voto, null);
  });

  await caso("al final: TODA la lista (las dos páginas) coincide con la base, reseña por reseña", async () => {
    const r = leerComo(S.lector.uid, "movie", S.T, { limite: 20 });
    const base = Object.fromEntries(r.items.map((x) => [x.version_id, { mi_voto: x.mi_voto ?? null, utiles: x.utiles, total: x.total }]));
    for (const x of S.lista.items) assert.deepEqual(enPantalla(S.lista, x.version_id), base[x.version_id], `versión ${x.version_id}`);
    console.log(`     respuestas perdidas simuladas: ${perdida.perdidas}`);
  });
} finally {
  console.log("\n— Limpieza (base compartida): sólo lo de esta corrida —");
  try {
    const prev = configPrevia;
    config({ modulo_activo: prev.modulo_activo, publicacion_activa: prev.publicacion_activa, top_yumpers_activo: prev.top_yumpers_activo, muestreo_activo: prev.muestreo_activo ?? false });
    const us = [...cuentas];
    const todos = [...participantes].map(q).join(",");
    for (const u of us) await srv.auth.admin.deleteUser(u, false);
    if (todos) sqlOk(`begin;
      delete from comunidad.intentos where participante_id in (${todos});
      delete from comunidad.tramos where evaluador_participante in (${todos}) or autor_participante in (${todos});
      delete from comunidad.evaluaciones where evaluador_participante in (${todos}) or autor_participante in (${todos});
      delete from comunidad.denuncias where denunciante_participante in (${todos}) or autor_participante in (${todos});
      delete from comunidad.huellas where autor_participante in (${todos});
      delete from comunidad.resenas where autor_participante in (${todos});
      delete from comunidad.contadores where participante_id in (${todos});
      delete from comunidad.participantes where id in (${todos});
      commit;`);
    console.log(`   cuentas: ${us.length}; restos (cuentas|participantes|interruptores): ${sqlOk(`select (select count(*) from auth.users where id in (${us.map(q).join(",") || "null::uuid"}))
      || '|' || (select count(*) from comunidad.participantes where id in (${todos || "null::uuid"}))
      || '|' || (select (modulo_activo or publicacion_activa or top_yumpers_activo or muestreo_activo)::text from comunidad.config)`)}`);
  } catch (e) {
    console.error("   ⚠️ la limpieza falló:", e.message);
    process.exitCode = 1;
  }
}
cerrar();
