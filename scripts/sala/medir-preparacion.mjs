#!/usr/bin/env node
// Medición de la preparación de una tanda (plan de salas, Tarea 2.3).
//
// Contra `next dev` levantado con `.env.sala-local` (base local con el catálogo
// real cargado por `db-local.mjs --catalogo-real`, TMDB real, caché en memoria
// porque no hay UPSTASH_*). Crea una sala de 2 con plataformas n,d,m, pide la
// preparación de 5, 10 y 20 en `cualquiera`, y lee la línea `[sala]` que
// imprime la ruta en el stdout del servidor (se le pasa un archivo de log).
//
// FRÍO / CALIENTE. La caché es de proceso: "frío" es la primera preparación de
// una combinación desde que arrancó el servidor; "caliente" es repetir la MISMA
// combinación de tamaño y unión con otra sala sin reiniciar. Como la semilla de
// candidatas es el room_id, dos salas distintas NO piden las mismas películas:
// para que "caliente" reuse las cards, cada tamaño se mide sobre la MISMA sala
// con "otra tanda"... que excluye las anteriores. Por eso el caliente se mide
// así: se prepara la sala A (frío), se aborta esa ronda con service_role y se
// vuelve a preparar la MISMA sala con la misma semilla → mismas candidatas,
// cards ya en caché. Es exactamente lo que pasa cuando un organizador reintenta.
//
// Reglas de MANTENIMIENTO.md: alternar (frío A, caliente A, frío B, caliente B…)
// y no correr nada más contra TMDB mientras tanto.
//
// Uso:
//   node --env-file=.env.sala-local scripts/sala/medir-preparacion.mjs --base http://localhost:3111 --log <archivo con el stdout de next>
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : d; };
const BASE = arg("--base", "http://localhost:3111");
const LOG = arg("--log", null);
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SRV = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/127\.0\.0\.1|localhost/.test(URL ?? "")) { console.error("Sólo contra la base local"); process.exit(2); }

const admin = createClient(URL, SRV, { auth: { persistSession: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false } });
const como = (jwt) => createClient(URL, ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
const rpc = (c, fn, args) => c.rpc(fn, args).then(({ data, error }) => { if (error) throw new Error(`${fn}: ${error.message}`); return data; });
const credencial = () => randomBytes(32).toString("base64url");

async function usuario() {
  const email = `medir-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@sala.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "Prueba-1234", email_confirm: true });
  if (error) throw error;
  const { data: s } = await anon().auth.signInWithPassword({ email, password: "Prueba-1234" });
  return { id: data.user.id, jwt: s.session.access_token };
}

let logOffset = 0;
function lineasSalaNuevas() {
  if (!LOG) return [];
  const txt = readFileSync(LOG, "utf8");
  const nuevas = txt.slice(logOffset); logOffset = txt.length;
  return nuevas.split("\n").filter((l) => l.includes("[sala] preparar"));
}
const parse = (l) => {
  const m = (re) => (l.match(re) ?? [])[1];
  return { tmdb: Number(m(/tmdb (\d+) llamadas/)), redis: Number(m(/redis (\d+) comandos/)), supabase: Number(m(/supabase (\d+) consultas/)), rpc: Number(m(/\+ (\d+) rpc admin/)), ms: Number(m(/\| (\d+)ms/)), estado: m(/preparar \S+ (\S+) \d{3}/) };
};

async function preparar(jwt, roomId, size) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/sala/preparar`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ room_id: roomId, size, duracion: "cualquiera" }) });
  const body = await r.json();
  const wall = Date.now() - t0;
  await new Promise((res) => setTimeout(res, 300));
  const linea = lineasSalaNuevas().at(-1);
  return { status: r.status, body, wall, medida: linea ? parse(linea) : null, linea };
}

const filas = [];
for (const size of [5, 10, 20]) {
  const h = await usuario();
  const cred = credencial();
  const { room_id } = await rpc(como(h.jwt), "sala_crear", { p_nombre: "M", p_platforms: ["n", "d", "m"], p_credencial: cred });
  await rpc(anon(), "sala_unirse", { p_room: room_id, p_nombre: "B", p_platforms: ["n"], p_credencial: credencial() });

  const frio = await preparar(h.jwt, room_id, size);
  if (!frio.body.ok) { console.error("frío falló", size, frio.status, frio.body); process.exit(1); }
  filas.push({ size, estado: "frío", ...frio.medida, wall: frio.wall });

  // Misma sala, misma semilla → mismas candidatas: abortar la ronda publicada no
  // es posible (ya está votando); se cierra la ronda con service_role forzando
  // el deadline y se pide OTRA tanda excluyendo... no: eso cambia las
  // candidatas. Se recrea la situación exacta: borrar la ronda y volver a
  // preparar. Sólo local, sólo para medir.
  await admin.from("room_rounds").delete().eq("room_id", room_id);
  await admin.from("rooms").update({ estado: "lobby", round_actual: null, platforms_frozen: null }).eq("id", room_id);
  const caliente = await preparar(h.jwt, room_id, size);
  if (!caliente.body.ok) { console.error("caliente falló", size, caliente.status, caliente.body); process.exit(1); }
  filas.push({ size, estado: "caliente", ...caliente.medida, wall: caliente.wall });

  // Control: tercera preparación de la MISMA sala tiene que dar lo mismo que la segunda.
  await admin.from("room_rounds").delete().eq("room_id", room_id);
  await admin.from("rooms").update({ estado: "lobby", round_actual: null, platforms_frozen: null }).eq("id", room_id);
  const control = await preparar(h.jwt, room_id, size);
  filas.push({ size, estado: "control", ...control.medida, wall: control.wall });

  await rpc(como(h.jwt), "sala_cerrar", { p_room: room_id });
}

console.log("\n| size | estado | tmdb | redis | supabase | rpc admin | ms servidor | ms pared |");
console.log("|---|---|---|---|---|---|---|---|");
for (const f of filas) console.log(`| ${f.size} | ${f.estado} | ${f.tmdb ?? "?"} | ${f.redis ?? "?"} | ${f.supabase ?? "?"} | ${f.rpc ?? "?"} | ${f.ms ?? "?"} | ${f.wall} |`);
if (!LOG) console.log("\n(sin --log no hay línea [sala]: sólo tiempo de pared)");
