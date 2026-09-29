// 🔴 Los votos de Yumpeá (Sí / No / Paso) viven SÓLO en `room_votes`.
//
// No son calificaciones personales: no se escriben en `votes` (la tabla del
// LikeButton de la ficha), no alimentan «Elegidas para vos» ni los rieles de
// votos ("Lo más votados", "No gustaron"), y se borran con la sala. Este test
// fija esa separación en los tres lugares donde podría romperse: la migración,
// el código de salas y los consumidores de `votes`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(join(raiz, p), "utf8").replace(/\r\n/g, "\n");
const sinComentariosSql = (s: string) => s.replace(/--.*$/gm, "");
const sinComentariosTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
function archivos(dir: string, filtro: RegExp): string[] {
  const out: string[] = [];
  for (const n of readdirSync(join(raiz, dir))) {
    const p = `${dir}/${n}`;
    if (statSync(join(raiz, p)).isDirectory()) out.push(...archivos(p, filtro));
    else if (filtro.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
// "votes" como tabla propia, no como sufijo de room_votes.
const TABLA_VOTES = /(?<![A-Za-z_])votes(?![A-Za-z_])/;

test("la migración de salas guarda los votos en room_votes y nunca toca `votes`", () => {
  const sql = sinComentariosSql(leer("supabase/migrations/009_salas.sql"));
  assert.match(sql, /create table if not exists room_votes/);
  assert.match(sql, /insert into room_votes/, "sala_votar escribe en room_votes");
  const menciones = sql.split("\n").filter((l) => TABLA_VOTES.test(l));
  assert.deepEqual(menciones, [], "la migración nombra la tabla `votes`");
  for (const f of ["top_voted", "user_reviews", "view_history", "user_items"]) {
    assert.ok(!sql.includes(f), `la migración toca ${f}`);
  }
});

test("el código de salas no escribe ni lee `votes`, ni usa el voto personal de la ficha", () => {
  const rutas = [...archivos("components/sala", /\.tsx?$/), ...archivos("lib/sala", /\.ts$/), "hooks/useSala.ts", "app/api/sala/preparar/route.ts"];
  assert.ok(rutas.length > 20, "el barrido encontró el código de salas");
  for (const p of rutas) {
    const src = sinComentariosTs(leer(p));
    assert.doesNotMatch(src, /from\(\s*["']votes["']\s*\)/, `${p} usa la tabla votes`);
    assert.doesNotMatch(src, /LikeButton|lib\/userdata|top_voted/, `${p} usa el voto personal`);
  }
});

test("«Elegidas para vos» y los rieles de votos no leen room_votes", () => {
  const consumidores = [
    ...archivos("lib", /^(reco|votes|userdata|te-va-a-gustar|home)[^/]*\.ts$/),
    ...archivos("app/api/te-va-a-gustar", /\.ts$/),
    ...archivos("app/api/mas-votados", /\.ts$/),
    ...archivos("app/api/hacete-cargo", /\.ts$/),
    "components/LikeButton.tsx",
  ];
  assert.ok(consumidores.length >= 5, consumidores.join(", "));
  for (const p of consumidores) assert.ok(!leer(p).includes("room_votes"), `${p} lee los votos de las salas`);
});
