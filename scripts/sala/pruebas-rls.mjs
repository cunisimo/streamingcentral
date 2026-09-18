#!/usr/bin/env node
// Batería de RLS / RPC / concurrencia de las salas compartidas, contra la base
// LOCAL de `supabase start`, CON LA ANON KEY (y JWTs de usuarios reales), no
// desde el SQL Editor: lo que se prueba es exactamente lo que un navegador
// puede hacer. Plan: docs/superpowers/plans/2026-09-17-salas-compartidas.md,
// Tarea 1.5 (pruebas 1–28).
//
// Uso:
//   node scripts/sala/db-local.mjs                       # esquema + 009 + fixtures
//   node --env-file=.env.sala-local scripts/sala/pruebas-rls.mjs
//
// service_role se usa SÓLO para lo que en producción hace el servidor (crear
// usuarios de prueba, forzar relojes, correr la preparación y el barrido).
// Termina con código 1 si alguna prueba falla. Los usuarios y salas creados
// quedan en la base local; `supabase db reset` o `db-local.mjs` la rehacen.
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SRV) { console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY (¿--env-file=.env.sala-local?)"); process.exit(2); }
if (!/127\.0\.0\.1|localhost/.test(URL)) { console.error(`Esta batería es SÓLO para la base local; URL = ${URL}`); process.exit(2); }

const admin = createClient(URL, SRV, { auth: { persistSession: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false } });
const como = (jwt) => createClient(URL, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });

const fallos = [];
let numero = 0;
const prueba = async (nombre, fn) => {
  numero++;
  try { await fn(); console.log("✔", nombre); }
  catch (e) { fallos.push(nombre); console.log("✖", nombre, "\n   ", e.message?.split("\n")[0]); }
};
const debeFallar = async (p, patron) => {
  const { error } = await p;
  assert.ok(error, "debía fallar y no falló");
  if (patron) assert.match(error.message + " " + (error.code ?? ""), patron, `falló con otro motivo: ${error.message}`);
};
const rpc = (c, fn, args) => c.rpc(fn, args).then(({ data, error }) => { if (error) throw new Error(`${fn}: ${error.message} [${error.code}]`); return data; });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const enMs = (iso) => new Date(iso).getTime();

async function usuario(prefijo) {
  const email = `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@sala.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Prueba-1234", email_confirm: true });
  if (error) throw error;
  const { data: s, error: e2 } = await anon().auth.signInWithPassword({ email, password: "Prueba-1234" });
  if (e2) throw e2;
  return { id: data.user.id, jwt: s.session.access_token };
}

// "Pruebas" es el proveedor sintético de las fixtures: aísla la batería del
// catálogo real aunque esté cargado en local (ver fixtures-local.sql).
const PLATS = ["Pruebas"];
const card = (c, pos) => ({ pos, tmdb_id: c.tmdb_id, titulo: "T" + c.tmdb_id, anio: 2000, runtime: c.runtime, poster: null, generos: ["drama"], platforms: ["n"], razon: c.razon, advertencia: c.advertencia });

/** Sala de 2 (host + B) ya en `preparando`, con candidatas y cards listas para publicar. */
async function salaPreparando(jwtHost, hostId, size = 5, duracion = "cualquiera") {
  const r = await rpc(como(jwtHost), "sala_crear", { p_nombre: "H", p_platforms: ["n", "d", "m"] });
  const tB = (await rpc(anon(), "sala_unirse", { p_room: r.room_id, p_nombre: "B", p_platforms: ["n"] })).token;
  const ini = await rpc(admin, "sala_iniciar_preparacion", { p_room: r.room_id, p_host: hostId, p_size: size, p_duracion: duracion });
  const cand = await rpc(admin, "sala_candidatos", { p_providers: PLATS, p_duracion: duracion, p_excluir: [], p_seed: "s", p_limit: 80 });
  const cards = cand.slice(0, size).map(card);
  return { room: r.room_id, tokHost: r.token, tB, ini, cand, cards };
}
const publicar = (s, cards = s.cards) => rpc(admin, "sala_publicar_ronda", { p_round: s.ini.round_id, p_prep_token: s.ini.prep_token, p_titulos: cards });
const votar = (room, tok, round, pos, voto) => rpc(anon(), "sala_votar", { p_room: room, p_token: tok, p_round: round, p_pos: pos, p_voto: voto });
const estado = (room, tok) => rpc(anon(), "sala_estado", { p_room: room, p_token: tok });

console.log(`Base: ${URL}\n`);

// Precondición: las salas están encendidas en local (fixtures).
{
  const { data } = await admin.from("sala_config").select("valor").eq("clave", "activas").single();
  if (data?.valor !== "true") { console.error("sala_config.activas no es 'true' en local: corré scripts/sala/db-local.mjs"); process.exit(2); }
}

const host = await usuario("host");
const inv = await usuario("inv");
let sala, tokHost, tokA, tokInv, ronda;
const toksExtra = [];

await prueba("1. lectura y escritura directa rechazadas con anon y con JWT", async () => {
  for (const t of ["rooms", "room_participants", "room_rounds", "room_titles", "room_votes", "sala_config"]) {
    await debeFallar(anon().from(t).select("*").limit(1), /permission denied|42501/);
    await debeFallar(como(host.jwt).from(t).select("*").limit(1), /permission denied|42501/);
    await debeFallar(anon().from(t).insert({}), /permission denied|42501/);
  }
});

await prueba("2. crear sala exige sesión, valida plataformas y devuelve un token de 43 caracteres", async () => {
  await debeFallar(anon().rpc("sala_crear", { p_nombre: "X", p_platforms: ["n"] }), /permission denied|42501/); // sin grant a anon: ni llega a la función
  await debeFallar(como(host.jwt).rpc("sala_crear", { p_nombre: "Facu", p_platforms: ["n", "zz", "d"] }), /sala_plataforma_desconocida/); // no se limpia en silencio
  await debeFallar(como(host.jwt).rpc("sala_crear", { p_nombre: "Facu", p_platforms: [] }), /sala_sin_plataformas/);
  const r = await rpc(como(host.jwt), "sala_crear", { p_nombre: "  Facu  ", p_platforms: ["n", "n", "d"] });
  sala = r.room_id; tokHost = r.token;
  assert.equal(tokHost.length, 43);
});

await prueba("3. una sola sala activa por organizador", async () => {
  await debeFallar(como(host.jwt).rpc("sala_crear", { p_nombre: "Otra", p_platforms: ["n"] }), /sala_ya_tiene_activa/);
});

await prueba("4. plataformas deduplicadas y ordenadas; nombre normalizado; desconocidas y vacías rechazadas", async () => {
  const e = await estado(sala, tokHost);
  assert.deepEqual(e.soy.platforms, ["d", "n"]); assert.equal(e.soy.nombre, "Facu");
  await debeFallar(anon().rpc("sala_unirse", { p_room: sala, p_nombre: "A", p_platforms: ["zz"] }), /sala_plataforma_desconocida/);
  await debeFallar(anon().rpc("sala_unirse", { p_room: sala, p_nombre: "A", p_platforms: ["n", "zz"] }), /sala_plataforma_desconocida/);
  await debeFallar(anon().rpc("sala_unirse", { p_room: sala, p_nombre: "A", p_platforms: [] }), /sala_sin_plataformas/);
  await debeFallar(anon().rpc("sala_unirse", { p_room: sala, p_nombre: "x".repeat(25), p_platforms: ["n"] }), /sala_nombre_invalido/);
  await debeFallar(anon().rpc("sala_unirse", { p_room: sala, p_nombre: "  \t ", p_platforms: ["n"] }), /sala_nombre_invalido/);
});

await prueba("5. unirse anónimo y autenticado; una cuenta no ocupa dos lugares (rota el token)", async () => {
  tokA = (await rpc(anon(), "sala_unirse", { p_room: sala, p_nombre: "Ana", p_platforms: ["m"] })).token;
  tokInv = (await rpc(como(inv.jwt), "sala_unirse", { p_room: sala, p_nombre: "Inv", p_platforms: ["p"] })).token;
  const otra = (await rpc(como(inv.jwt), "sala_unirse", { p_room: sala, p_nombre: "Inv2", p_platforms: ["p"] })).token;
  assert.notEqual(otra, tokInv);
  await debeFallar(anon().rpc("sala_estado", { p_room: sala, p_token: tokInv }), /sala_token_invalido/); // el rotado murió
  tokInv = otra;
  const e = await estado(sala, tokHost);
  assert.equal(e.n, 3);
  assert.deepEqual(e.participantes.map((p) => p.nombre), ["Facu", "Ana", "Inv"]);
  // sala_reclamar con cuenta: rota otra vez y el anterior muere
  const rec = (await rpc(como(inv.jwt), "sala_reclamar", { p_room: sala })).token;
  await debeFallar(anon().rpc("sala_estado", { p_room: sala, p_token: tokInv }), /sala_token_invalido/);
  tokInv = rec;
  await debeFallar(anon().rpc("sala_reclamar", { p_room: sala }), /permission denied|42501/);
});

await prueba("6. el token de una sala no sirve en otra", async () => {
  const r2 = await rpc(como(inv.jwt), "sala_crear", { p_nombre: "Inv", p_platforms: ["n"] });
  await debeFallar(anon().rpc("sala_estado", { p_room: r2.room_id, p_token: tokHost }), /sala_token_invalido/);
  await debeFallar(anon().rpc("sala_votar", { p_room: r2.room_id, p_token: tokHost, p_round: r2.room_id, p_pos: 0, p_voto: "yes" }), /sala_token_invalido/);
  await rpc(como(inv.jwt), "sala_cerrar", { p_room: r2.room_id });
});

await prueba("7. máximo seis participantes", async () => {
  for (const n of ["P4", "P5", "P6"]) toksExtra.push((await rpc(anon(), "sala_unirse", { p_room: sala, p_nombre: n, p_platforms: ["n"] })).token);
  await debeFallar(anon().rpc("sala_unirse", { p_room: sala, p_nombre: "P7", p_platforms: ["n"] }), /sala_llena/);
  assert.equal((await estado(sala, tokHost)).n, 6);
});

await prueba("8. un invitado no ejecuta acciones del organizador; anon no ejecuta la preparación", async () => {
  await debeFallar(como(inv.jwt).rpc("sala_desempatar", { p_room: sala }), /sala_no_es_host|42501/);
  await debeFallar(como(inv.jwt).rpc("sala_cerrar", { p_room: sala }), /sala_no_es_host|42501/);
  await debeFallar(anon().rpc("sala_desempatar", { p_room: sala }), /permission denied|42501/);
  await debeFallar(anon().rpc("sala_iniciar_preparacion", { p_room: sala, p_host: host.id, p_size: 5, p_duracion: "cualquiera" }), /permission denied|42501/);
  await debeFallar(como(host.jwt).rpc("sala_iniciar_preparacion", { p_room: sala, p_host: host.id, p_size: 5, p_duracion: "cualquiera" }), /permission denied|42501/);
  await debeFallar(como(host.jwt).rpc("sala_candidatos", { p_providers: PLATS, p_duracion: "cualquiera", p_excluir: [], p_seed: "s", p_limit: 80 }), /permission denied|42501/);
});

await prueba("9. candidatas correctas y publicación atómica con validación estricta", async () => {
  const ini = await rpc(admin, "sala_iniciar_preparacion", { p_room: sala, p_host: host.id, p_size: 5, p_duracion: "cualquiera" });
  assert.deepEqual(ini.union, ["d", "m", "n", "p"]);
  const cand = await rpc(admin, "sala_candidatos", { p_providers: PLATS, p_duracion: "cualquiera", p_excluir: [], p_seed: "s", p_limit: 80 });
  // Controles negativos de las fixtures: infantiles, sin duración, SIN RAZÓN, con contexto, serie, sin AR, razón en blanco y la exclusiva de MUBI.
  const excluidos = [90000101, 90000102, 90000103, 90000104, 90000105, 90000106, 90000107, 90000108, 90000041];
  assert.ok(cand.every((c) => c.runtime > 0 && c.razon && c.razon.trim() && !excluidos.includes(c.tmdb_id)));
  // "Sin pero" (90000042) SÍ entra: la advertencia es opcional.
  assert.ok(cand.some((c) => c.tmdb_id === 90000042 && c.advertencia === null), "la película sin pero tiene que ser candidata");
  assert.equal(cand.filter((c) => c.tmdb_id >= 90000000).length, 41, "41 candidatas ficticias con n,d,m(,p)");
  const pub = (titulos) => admin.rpc("sala_publicar_ronda", { p_round: ini.round_id, p_prep_token: ini.prep_token, p_titulos: titulos });
  await debeFallar(pub(cand.slice(0, 4).map(card)), /sala_tanda_incompleta/);
  await debeFallar(pub(cand.slice(0, 5).map((c, i) => card(c, i === 4 ? 7 : i))), /sala_posiciones_invalidas/);
  await debeFallar(pub(cand.slice(0, 5).map((c, i) => ({ ...card(c, i), razon: i === 2 ? "  " : c.razon }))), /sala_card_invalida/);   // sin razón no entra
  await debeFallar(pub(cand.slice(0, 5).map((c, i) => ({ ...card(c, i), platforms: i === 1 ? ["mb"] : ["n"] }))), /sala_card_invalida/); // mb no está en la unión
  await debeFallar(pub(cand.slice(0, 5).map((c, i) => ({ ...card(c, i), platforms: i === 1 ? ["zz"] : ["n"] }))), /sala_card_invalida/); // código no permitido
  await debeFallar(pub(cand.slice(0, 5).map((c, i) => ({ ...card(c, i), runtime: i === 3 ? 0 : c.runtime }))), /sala_card_invalida/);
  await debeFallar(admin.rpc("sala_publicar_ronda", { p_round: ini.round_id, p_prep_token: "00000000-0000-0000-0000-000000000000", p_titulos: cand.slice(0, 5).map(card) }), /sala_prep_invalida/);
  // Nada de lo anterior dejó títulos a medias.
  const { data: parciales } = await admin.from("room_titles").select("pos").eq("round_id", ini.round_id);
  assert.equal(parciales.length, 0, "una publicación rechazada dejó títulos");
  // Publicación real: pos 0 es la card SIN "pero" (advertencia null) y pos 1 lleva advertencia "" → las dos se aceptan.
  const sinPero = cand.find((c) => c.tmdb_id === 90000042);
  const tanda = [sinPero, ...cand.filter((c) => c.tmdb_id !== 90000042).slice(0, 4)]
    .map(card).map((c, i) => ({ ...c, pos: i, advertencia: i === 1 ? "" : c.advertencia }));
  assert.equal(tanda[0].advertencia, null);
  const publicado = await rpc(admin, "sala_publicar_ronda", { p_round: ini.round_id, p_prep_token: ini.prep_token, p_titulos: tanda });
  assert.ok(publicado.ok); ronda = ini.round_id;
  const e = await estado(sala, tokHost);
  assert.equal(e.estado, "votando"); assert.equal(e.ronda.titulos.length, 5);
  assert.equal(e.ronda.limite_seg, 120);
  assert.ok(enMs(e.ronda.deadline_at) - enMs(e.ronda.started_at) === 120_000);
  // La card sin pero viaja con advertencia NULL, y la vacía se normalizó a NULL.
  assert.equal(e.ronda.titulos[0].tmdb_id, 90000042); assert.equal(e.ronda.titulos[0].advertencia, null);
  assert.equal(e.ronda.titulos[1].advertencia, null);
  assert.ok(e.ronda.titulos.every((t) => typeof t.razon === "string" && t.razon.length > 0));
  // Publicar dos veces no publica dos veces.
  await debeFallar(pub(tanda), /sala_prep_invalida/);
});

await prueba("10. lobby cerrado: no entran participantes nuevos", async () => {
  await debeFallar(anon().rpc("sala_unirse", { p_room: sala, p_nombre: "Tarde", p_platforms: ["n"] }), /sala_no_admite_ingresos/);
});

await prueba("11. voto: sólo la siguiente pos; idempotente; distinto voto sobre pos ya votada rechazado; pos fuera de la ronda rechazada", async () => {
  assert.equal((await votar(sala, tokA, ronda, 1, "yes")).motivo, "fuera_de_orden");
  assert.ok((await votar(sala, tokA, ronda, 0, "no")).ok);
  assert.ok((await votar(sala, tokA, ronda, 0, "no")).idempotente);
  const r = await votar(sala, tokA, ronda, 0, "yes");
  assert.equal(r.motivo, "ya_votado"); assert.equal(r.siguiente, 1);
  assert.equal((await votar(sala, tokA, ronda, 9, "yes")).motivo, "fuera_de_orden");
  await debeFallar(anon().rpc("sala_votar", { p_room: sala, p_token: tokA, p_round: ronda, p_pos: 1, p_voto: "maybe" }), /sala_voto_invalido/);
  const { data: votos } = await admin.from("room_votes").select("pos, voto").eq("round_id", ronda);
  assert.deepEqual(votos, [{ pos: 0, voto: "no" }]);
});

await prueba("12. nadie ve votos ajenos; el estado no expone participant_id ajenos ni tokens", async () => {
  const e = await estado(sala, tokHost);
  assert.deepEqual(e.ronda.mis_votos, {});           // el host no ve el voto de Ana
  assert.equal(e.ronda.mi_siguiente_pos, 0);
  const eA = await estado(sala, tokA);
  assert.deepEqual(eA.ronda.mis_votos, { 0: "no" });
  const txt = JSON.stringify(e);
  assert.ok(!txt.includes("token"), "no viaja ningún token");
  assert.equal((txt.match(/"id":"/g) ?? []).length, 2, "sólo mi id y el de la ronda"); // soy.id y ronda.id
  // El host no puede votar por otro: no existe parámetro para eso; con SU token vota por sí mismo.
  assert.ok((await votar(sala, tokHost, ronda, 0, "no")).ok);
  assert.deepEqual((await estado(sala, tokA)).ronda.mis_votos, { 0: "no" }); // el de Ana sigue siendo el suyo
});

await prueba("13. seis participantes; el último voto de cada uno se manda a la vez; un único resultado 'ganador'", async () => {
  const seis = [tokHost, tokA, tokInv, ...toksExtra];
  assert.equal(seis.length, 6);
  // pos 0 ya la votaron Ana y el host (no). El resto vota 0..3 en serie; pos 2 = "yes" para todos → ganador con 6 síes.
  for (const t of seis) for (let pos = (t === tokA || t === tokHost) ? 1 : 0; pos < 4; pos++) await votar(sala, t, ronda, pos, pos === 2 ? "yes" : "no");
  const antes = await estado(sala, tokHost);
  assert.equal(antes.ronda.terminaron, 0); assert.equal(antes.estado, "votando");
  const res = await Promise.all(seis.map((t) => votar(sala, t, ronda, 4, "no")));
  assert.ok(res.every((r) => r.ok));
  const e = await estado(sala, tokHost);
  assert.equal(e.estado, "resultado"); assert.equal(e.resultado.tipo, "ganador"); assert.equal(e.resultado.ganador_pos, 2);
  assert.equal(e.ronda.terminaron, 6);
  assert.equal(e.resultado.puede_otra_tanda, true);
  assert.equal((await estado(sala, tokA)).resultado.puede_otra_tanda, false);
  const { data: rondas } = await admin.from("room_rounds").select("id, resultado, closed_at").eq("room_id", sala);
  assert.equal(rondas.filter((r) => r.resultado).length, 1);
});

await prueba("14. sala de 2: dos Sí simultáneos sobre la misma película → un único match, y la ronda se detiene", async () => {
  const h = await usuario("h14");
  const s = await salaPreparando(h.jwt, h.id);
  await publicar(s);
  const res = await Promise.all([votar(s.room, s.tokHost, s.ini.round_id, 0, "yes"), votar(s.room, s.tB, s.ini.round_id, 0, "yes")]);
  assert.ok(res.every((r) => r.ok));
  const e = await estado(s.room, s.tB);
  assert.equal(e.estado, "resultado"); assert.equal(e.resultado.tipo, "match"); assert.equal(e.resultado.ganador_pos, 0);
  assert.equal((await votar(s.room, s.tB, s.ini.round_id, 1, "yes")).motivo, "ronda_cerrada");
  // Sin coincidencia hasta el final → "sin_coincidencias" (control de la regla de 2)
  const h2 = await usuario("h14b");
  const s2 = await salaPreparando(h2.jwt, h2.id);
  await publicar(s2);
  for (let pos = 0; pos < 5; pos++) { await votar(s2.room, s2.tokHost, s2.ini.round_id, pos, pos === 1 ? "yes" : "no"); await votar(s2.room, s2.tB, s2.ini.round_id, pos, pos === 3 ? "yes" : "pass"); }
  const e2 = await estado(s2.room, s2.tB);
  assert.equal(e2.resultado.tipo, "sin_coincidencias", "un solo Sí por película no es match");
  await rpc(como(h.jwt), "sala_cerrar", { p_room: s.room }); await rpc(como(h2.jwt), "sala_cerrar", { p_room: s2.room });
});

await prueba("15. sala de 3 con empate: sólo el host desempata; repetir devuelve el mismo ganador; la ventana se renueva", async () => {
  const h = await usuario("h15");
  const r = await rpc(como(h.jwt), "sala_crear", { p_nombre: "H", p_platforms: ["n", "d", "m"] });
  const tB = (await rpc(anon(), "sala_unirse", { p_room: r.room_id, p_nombre: "B", p_platforms: ["n"] })).token;
  const tC = (await rpc(anon(), "sala_unirse", { p_room: r.room_id, p_nombre: "C", p_platforms: ["d"] })).token;
  const ini = await rpc(admin, "sala_iniciar_preparacion", { p_room: r.room_id, p_host: h.id, p_size: 5, p_duracion: "cualquiera" });
  await debeFallar(anon().rpc("sala_unirse", { p_room: r.room_id, p_nombre: "D", p_platforms: ["n"] }), /sala_no_admite_ingresos/);
  const cand = await rpc(admin, "sala_candidatos", { p_providers: PLATS, p_duracion: "cualquiera", p_excluir: [], p_seed: "s15", p_limit: 80 });
  await rpc(admin, "sala_publicar_ronda", { p_round: ini.round_id, p_prep_token: ini.prep_token, p_titulos: cand.slice(0, 5).map(card) });
  for (const t of [r.token, tB, tC]) for (let pos = 0; pos < 5; pos++) await votar(r.room_id, t, ini.round_id, pos, pos === 1 || pos === 3 ? "yes" : "no");
  let e = await estado(r.room_id, tB);
  assert.equal(e.estado, "empate"); assert.deepEqual(e.resultado.empatadas, [1, 3]); assert.equal(e.resultado.desempatado, false);
  assert.equal(e.resultado.puede_desempatar, false); assert.equal(e.resultado.puede_otra_tanda, false);
  assert.equal((await estado(r.room_id, r.token)).resultado.puede_desempatar, true);
  const antes = enMs(e.expires_at);
  await dormir(1100);
  const g1 = (await rpc(como(h.jwt), "sala_desempatar", { p_room: r.room_id })).ganador_pos;
  const g2 = (await rpc(como(h.jwt), "sala_desempatar", { p_room: r.room_id })).ganador_pos;
  const g3 = (await rpc(como(h.jwt), "sala_desempatar", { p_room: r.room_id })).ganador_pos;
  assert.ok([1, 3].includes(g1)); assert.equal(g1, g2); assert.equal(g2, g3);
  e = await estado(r.room_id, tB);
  assert.equal(e.estado, "resultado"); assert.equal(e.resultado.tipo, "empate"); assert.equal(e.resultado.desempatado, true); assert.equal(e.resultado.ganador_pos, g1);
  assert.ok(enMs(e.expires_at) > antes, "desempatar renueva la ventana de 5 min");
  // Determinístico por semilla: recalculado a mano coincide.
  const { data: fila } = await admin.from("rooms").select("seed").eq("id", r.room_id).single();
  const { data: tit } = await admin.from("room_titles").select("pos, tmdb_id").eq("round_id", ini.round_id).in("pos", [1, 3]);
  const { data: md5 } = await admin.rpc("sala_barrido"); // (sólo para tener una llamada admin; el md5 se calcula abajo con SQL)
  void md5;
  const { createHash } = await import("node:crypto");
  const esperado = tit.map((t) => ({ pos: t.pos, h: createHash("md5").update(fila.seed + String(t.tmdb_id)).digest("hex") })).sort((a, b) => (a.h < b.h ? -1 : 1))[0].pos;
  assert.equal(g1, esperado, "el desempate no es min(md5(seed || tmdb_id))");
  await rpc(como(h.jwt), "sala_cerrar", { p_room: r.room_id });
});

await prueba("16. voto posterior al cierre rechazado con 'ronda_cerrada'", async () => {
  const r = await votar(sala, tokA, ronda, 4, "yes");
  assert.equal(r.ok, false); assert.equal(r.motivo, "ronda_cerrada");
});

await prueba("18. otra tanda excluye los títulos de la ronda anterior (y una card repetida es rechazada)", async () => {
  const ini2 = await rpc(admin, "sala_iniciar_preparacion", { p_room: sala, p_host: host.id, p_size: 5, p_duracion: "cualquiera" });
  assert.equal(ini2.numero, 2);
  const { data: previos } = await admin.from("room_titles").select("tmdb_id").eq("round_id", ronda);
  assert.deepEqual([...ini2.excluir].sort(), previos.map((t) => t.tmdb_id).sort());
  assert.deepEqual(ini2.union, ["d", "m", "n", "p"], "la unión sigue congelada");
  const cand = await rpc(admin, "sala_candidatos", { p_providers: PLATS, p_duracion: "cualquiera", p_excluir: ini2.excluir, p_seed: "s2", p_limit: 80 });
  assert.ok(cand.every((c) => !ini2.excluir.includes(c.tmdb_id)));
  const cards2 = cand.slice(0, 5).map(card);
  await debeFallar(admin.rpc("sala_publicar_ronda", { p_round: ini2.round_id, p_prep_token: ini2.prep_token, p_titulos: [{ ...cards2[0], tmdb_id: previos[0].tmdb_id }, ...cards2.slice(1)] }), /sala_card_invalida/);
  // Se aborta para dejar la sala en `resultado` (lo prueban 17 y 27 después).
  await rpc(admin, "sala_abortar_preparacion", { p_round: ini2.round_id, p_prep_token: ini2.prep_token });
  const e = await estado(sala, tokHost);
  assert.equal(e.estado, "resultado"); assert.equal(e.ronda.id, ronda, "round_actual vuelve a la ronda cerrada anterior");
  assert.equal(e.resultado.tipo, "ganador");
});

await prueba("19. un payload falso en el tópico público NO cambia version ni estado", async () => {
  const antes = await estado(sala, tokHost);
  const c = anon();
  const ch = c.channel(`sala:${sala}`, { config: { private: false } });
  const suscripto = await new Promise((res) => {
    const t = setTimeout(() => res("timeout"), 8000);
    ch.subscribe((status) => { if (status === "SUBSCRIBED") { clearTimeout(t); res("ok"); } if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") { clearTimeout(t); res(status); } });
  });
  assert.equal(suscripto, "ok", `no se pudo suscribir al canal público: ${suscripto}`);
  const r = await ch.send({ type: "broadcast", event: "cambio", payload: { v: 999999, estado: "resultado", ganador_pos: 4 } });
  assert.ok(["ok", "error", "timed out"].includes(r));
  await dormir(500);
  const despues = await estado(sala, tokHost);
  assert.equal(despues.version, antes.version); assert.equal(despues.estado, antes.estado); assert.equal(despues.resultado.ganador_pos, 2);
  await c.removeChannel(ch);
});

await prueba("20. una sola sala activa por creador, bajo concurrencia (10 sala_crear a la vez)", async () => {
  const h3 = await usuario("h20");
  const res = await Promise.allSettled(Array.from({ length: 10 }, () => rpc(como(h3.jwt), "sala_crear", { p_nombre: "H3", p_platforms: ["n"] })));
  const ok = res.filter((r) => r.status === "fulfilled");
  assert.equal(ok.length, 1, `creó ${ok.length} salas`);
  assert.ok(res.filter((r) => r.status === "rejected").every((r) => /sala_ya_tiene_activa/.test(r.reason.message)));
  await rpc(como(h3.jwt), "sala_cerrar", { p_room: ok[0].value.room_id });
});

await prueba("21. publicar y abortar a la vez: un solo desenlace, nunca un estado intermedio", async () => {
  const h = await usuario("h21");
  const s = await salaPreparando(h.jwt, h.id);
  const [pub, ab] = await Promise.allSettled([publicar(s), rpc(admin, "sala_abortar_preparacion", { p_round: s.ini.round_id, p_prep_token: s.ini.prep_token })]);
  const e = await estado(s.room, s.tB);
  assert.ok((e.estado === "votando" && e.ronda.titulos.length === 5) || (e.estado === "lobby" && !e.ronda), JSON.stringify({ pub: pub.status, ab: ab.status, estado: e.estado }));
  if (e.estado === "votando") assert.equal(ab.status, "fulfilled", "abortar sobre una ronda ya publicada es un no-op, no un error");
  await rpc(como(h.jwt), "sala_cerrar", { p_room: s.room });
});

await prueba("22. publicar contra el vencimiento de la preparación (barrido): sin deadlock, un solo desenlace", async () => {
  const h = await usuario("h22");
  const s = await salaPreparando(h.jwt, h.id);
  await rpc(admin, "sala_barrido"); // control: recién creada, el barrido no la toca
  assert.equal((await estado(s.room, s.tB)).estado, "preparando");
  const { error: e1 } = await admin.from("room_rounds").update({ created_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", s.ini.round_id);
  assert.equal(e1, null);
  const res = await Promise.allSettled([publicar(s), rpc(admin, "sala_barrido")]);
  assert.ok(res.every((r) => r.status !== "rejected" || !/deadlock/i.test(r.reason.message)), "deadlock detectado");
  const e = await estado(s.room, s.tB);
  assert.ok((e.estado === "votando" && e.ronda.titulos.length === 5) || (e.estado === "lobby" && !e.ronda), `estado ${e.estado}`);
  await rpc(como(h.jwt), "sala_cerrar", { p_room: s.room });
});

await prueba("23. voto contra el cierre por plazo: o entra antes del cierre o es 'ronda_cerrada'; nunca los dos", async () => {
  const h = await usuario("h23");
  const s = await salaPreparando(h.jwt, h.id);
  await publicar(s);
  await admin.from("room_rounds").update({ deadline_at: new Date(Date.now() + 1500).toISOString() }).eq("id", s.ini.round_id);
  await dormir(1400);
  const res = await Promise.all([
    votar(s.room, s.tB, s.ini.round_id, 0, "yes"),
    dormir(150).then(() => rpc(admin, "sala_barrido")),
    votar(s.room, s.tokHost, s.ini.round_id, 0, "yes"),
  ]);
  const { data: votos } = await admin.from("room_votes").select("participant_id").eq("round_id", s.ini.round_id);
  const aceptados = [res[0], res[2]].filter((r) => r.ok).length;
  assert.equal(votos.length, aceptados, "un voto rechazado quedó escrito, o uno aceptado no quedó");
  const e = await estado(s.room, s.tB);
  assert.ok(["votando", "resultado"].includes(e.estado));
  await dormir(200);
  assert.ok(["resultado"].includes((await estado(s.room, s.tB)).estado), "pasado el plazo, la lectura cierra la ronda");
  await rpc(como(h.jwt), "sala_cerrar", { p_room: s.room });
});

await prueba("24. las funciones internas no se pueden ejecutar con anon ni con authenticated", async () => {
  const internas = [["sala_tocar", { p_room: sala }], ["sala_participante", { p_room: sala, p_token: tokA }], ["sala_computar", { p_round: ronda }],
    ["sala_aplicar_vencimientos", { p_room: sala }], ["sala_barrido", {}], ["sala_activas", {}], ["sala_hash", { p_token: "x" }], ["sala_nuevo_token", {}],
    ["sala_codigos_permitidos", {}], ["sala_limite_seg", { p_size: 5 }], ["sala_plataformas_validas", { p: ["n"] }], ["sala_nombre_valido", { p: "x" }]];
  for (const [fn, args] of internas) {
    await debeFallar(anon().rpc(fn, args), /permission denied|42501/);
    await debeFallar(como(inv.jwt).rpc(fn, args), /permission denied|42501/);
  }
});

await prueba("25. kill switch en la base: con activas='false' no se crea ni se entra; con 'true' vuelve", async () => {
  await admin.from("sala_config").update({ valor: "false" }).eq("clave", "activas");
  const h = await usuario("h25");
  await debeFallar(como(h.jwt).rpc("sala_crear", { p_nombre: "H", p_platforms: ["n"] }), /sala_desactivadas/);
  const s = await (async () => { await admin.from("sala_config").update({ valor: "true" }).eq("clave", "activas"); return rpc(como(h.jwt), "sala_crear", { p_nombre: "H", p_platforms: ["n"] }); })();
  await admin.from("sala_config").update({ valor: "false" }).eq("clave", "activas");
  await debeFallar(anon().rpc("sala_unirse", { p_room: s.room_id, p_nombre: "B", p_platforms: ["n"] }), /sala_desactivadas/);
  await admin.from("sala_config").update({ valor: "true" }).eq("clave", "activas");
  await rpc(como(h.jwt), "sala_cerrar", { p_room: s.room_id });
});

await prueba("26. 'Otra tanda' iniciada a segundos del vencimiento renueva expires_at y el barrido no la toca", async () => {
  const h = await usuario("h26");
  const s = await salaPreparando(h.jwt, h.id);
  await publicar(s);
  for (let pos = 0; pos < 5; pos++) for (const t of [s.tokHost, s.tB]) await votar(s.room, t, s.ini.round_id, pos, "no");
  let e = await estado(s.room, s.tB);
  assert.equal(e.estado, "resultado"); assert.equal(e.resultado.tipo, "sin_coincidencias");
  await admin.from("rooms").update({ expires_at: new Date(Date.now() + 2000).toISOString() }).eq("id", s.room);
  const ini2 = await rpc(admin, "sala_iniciar_preparacion", { p_room: s.room, p_host: h.id, p_size: 5, p_duracion: "cualquiera" });
  assert.deepEqual([...ini2.excluir].sort(), s.cards.map((c) => c.tmdb_id).sort());
  const { data: fila } = await admin.from("rooms").select("estado, expires_at").eq("id", s.room).single();
  assert.equal(fila.estado, "preparando");
  assert.ok(enMs(fila.expires_at) > Date.now() + 4 * 60_000, "expires_at no se renovó");
  await dormir(2500);
  await rpc(admin, "sala_barrido");
  e = await estado(s.room, s.tB);
  assert.equal(e.estado, "preparando", "el barrido tocó una sala en preparación");
  const cand = await rpc(admin, "sala_candidatos", { p_providers: PLATS, p_duracion: "cualquiera", p_excluir: ini2.excluir, p_seed: "s2", p_limit: 80 });
  assert.ok(cand.every((c) => !ini2.excluir.includes(c.tmdb_id)));
  const cards2 = cand.slice(0, 5).map(card);
  await debeFallar(admin.rpc("sala_publicar_ronda", { p_round: ini2.round_id, p_prep_token: ini2.prep_token, p_titulos: [{ ...cards2[0], tmdb_id: s.cards[0].tmdb_id }, ...cards2.slice(1)] }), /sala_card_invalida/);
  const pub2 = await rpc(admin, "sala_publicar_ronda", { p_round: ini2.round_id, p_prep_token: ini2.prep_token, p_titulos: cards2 });
  assert.ok(pub2.ok);
  e = await estado(s.room, s.tB);
  assert.equal(e.ronda.numero, 2); assert.equal(e.estado, "votando"); assert.equal(e.ronda.mi_siguiente_pos, 0);
  await rpc(como(h.jwt), "sala_cerrar", { p_room: s.room });
});

await prueba("27. una sala en `preparando` nunca es eliminada por el barrido; `sala_cerrar` conserva 5 min", async () => {
  const h = await usuario("h27");
  const s = await salaPreparando(h.jwt, h.id);
  await admin.from("rooms").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", s.room);
  await admin.from("room_rounds").update({ created_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", s.ini.round_id);
  await rpc(admin, "sala_barrido");
  const { data: fila } = await admin.from("rooms").select("estado, expires_at, round_actual").eq("id", s.room).single();
  assert.ok(fila, "la sala fue borrada");
  assert.equal(fila.estado, "lobby"); assert.equal(fila.round_actual, null);
  assert.ok(enMs(fila.expires_at) > Date.now());
  assert.equal((await admin.from("room_rounds").select("id").eq("room_id", s.room)).data.length, 0);
  await debeFallar(como(h.jwt).rpc("sala_cerrar", { p_room: "00000000-0000-0000-0000-000000000000" }), /sala_no_es_host/);
  await rpc(como(h.jwt), "sala_cerrar", { p_room: s.room });
  await rpc(admin, "sala_barrido");
  assert.ok((await admin.from("rooms").select("id").eq("id", s.room).single()).data, "cerrar borró en el acto");
  assert.equal((await estado(s.room, s.tB)).estado, "vencida");
  await admin.from("rooms").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", s.room);
  await rpc(admin, "sala_barrido");
  assert.equal((await admin.from("rooms").select("id").eq("id", s.room)).data.length, 0);
  assert.equal((await estado(s.room, s.tB)).estado, "inexistente");
});

await prueba("28. preparación desde el lobby abortada con los 15 min ya vencidos: el lobby se renueva 5 min y se puede reintentar", async () => {
  const h = await usuario("h28");
  const s = await salaPreparando(h.jwt, h.id);
  await admin.from("rooms").update({ lobby_expires_at: new Date(Date.now() - 30_000).toISOString() }).eq("id", s.room);
  await rpc(admin, "sala_abortar_preparacion", { p_round: s.ini.round_id, p_prep_token: s.ini.prep_token });
  const { data: fila } = await admin.from("rooms").select("estado, lobby_expires_at").eq("id", s.room).single();
  assert.equal(fila.estado, "lobby");
  const lobbyMs = enMs(fila.lobby_expires_at) - Date.now();
  assert.ok(lobbyMs > 4 * 60_000 && lobbyMs <= 5 * 60_000 + 2000, `lobby_expires_at fuera de la ventana acotada: ${lobbyMs} ms`);
  assert.equal((await estado(s.room, s.tB)).estado, "lobby");
  const ini2 = await rpc(admin, "sala_iniciar_preparacion", { p_room: s.room, p_host: h.id, p_size: 5, p_duracion: "cualquiera" });
  assert.ok(ini2.round_id);
  await admin.from("rooms").update({ lobby_expires_at: new Date(Date.now() - 30_000).toISOString() }).eq("id", s.room);
  await admin.from("room_rounds").update({ created_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", ini2.round_id);
  await rpc(admin, "sala_barrido");
  assert.equal((await estado(s.room, s.tB)).estado, "lobby");
  // Control: un lobby vencido de verdad (sin preparación) SÍ vence.
  await admin.from("rooms").update({ lobby_expires_at: new Date(Date.now() - 30_000).toISOString() }).eq("id", s.room);
  assert.equal((await estado(s.room, s.tB)).estado, "vencida");
});

await prueba("17. el barrido elimina la sala completa (seis tablas) 5 min después del estado terminal", async () => {
  await admin.from("rooms").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", sala);
  await rpc(admin, "sala_barrido");
  for (const [t, col] of [["rooms", "id"], ["room_participants", "room_id"], ["room_rounds", "room_id"]]) {
    assert.equal((await admin.from(t).select("*").eq(col, sala)).data.length, 0, `${t} no quedó en cero`);
  }
  assert.equal((await admin.from("room_titles").select("pos").eq("round_id", ronda)).data.length, 0);
  assert.equal((await admin.from("room_votes").select("pos").eq("round_id", ronda)).data.length, 0);
  assert.equal((await estado(sala, tokHost)).estado, "inexistente");
});

console.log(fallos.length ? `\n${fallos.length} fallos: ${fallos.join(" | ")}` : `\nTodo verde (${numero} pruebas)`);
process.exit(fallos.length ? 1 : 0);
