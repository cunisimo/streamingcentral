// Guards TEXTUALES sobre supabase/migrations/009_salas.sql (salas compartidas).
//
// No ejecutan SQL: fijan las propiedades del archivo que una lectura humana
// deja pasar y que, si se pierden, abren la base. La batería que sí ejecuta
// contra Postgres es scripts/sala/pruebas-rls.mjs (con la anon key local).
//
//   1. Inventario de funciones y exposición: toda función declarada está en el
//      mapa, y toda función del mapa existe. Postgres concede EXECUTE a PUBLIC
//      en cada función nueva, así que cada una lleva su revoke a los tres roles
//      y sólo las de cara al cliente reciben un grant explícito.
//   2. Las seis tablas están cerradas: RLS activo, sin policies, sin privilegios.
//   3. La lista de códigos de plataforma del SQL es exactamente ALL_CODES.
//   4. Ninguna RPC acepta participant_id: el id sale siempre del token.
//   5. Toda security definer pinea el search_path.
//   6. Orden de bloqueo: sala antes que ronda, en TODO cuerpo que bloquee una ronda.
//   7. sala_candidatos: sin apto_chicos, con duración, razón con texto real, sin
//      exigir advertencia, sin popularidad ni nota, orden por semilla.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ALL_CODES } from "./providers-ar.ts";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/009_salas.sql"), "utf8").replace(/\r\n/g, "\n");

// El inventario: quién puede ejecutar qué. Cualquier `create function` que no
// esté acá hace fallar el test; cualquier fila sin su revoke/grant, también.
const EXPOSICION: Record<string, "interna" | "participante" | "cuenta" | "servidor"> = {
  sala_codigos_permitidos: "interna", sala_activas: "interna", sala_hash: "interna", sala_nuevo_token: "interna",
  sala_plataformas_validas: "interna", sala_nombre_valido: "interna", sala_participante: "interna",
  sala_limite_seg: "interna", sala_tocar: "interna", rooms_publicar_cambio: "interna",
  sala_computar: "interna", sala_aplicar_vencimientos: "interna", sala_barrido: "interna",
  sala_unirse: "participante", sala_estado: "participante", sala_votar: "participante",
  sala_crear: "cuenta", sala_reclamar: "cuenta", sala_desempatar: "cuenta", sala_cerrar: "cuenta",
  sala_iniciar_preparacion: "servidor", sala_candidatos: "servidor", sala_publicar_ronda: "servidor", sala_abortar_preparacion: "servidor",
};
const GRANT: Record<string, string | null> = { interna: null, participante: "anon, authenticated", cuenta: "authenticated", servidor: "service_role" };

function funcionesDeclaradas(): string[] {
  return [...sql.matchAll(/create or replace function\s+(\w+)\s*\(/g)].map((m) => m[1]);
}

test("cada función declarada está en el inventario, y cada fila del inventario existe", () => {
  const declaradas = [...new Set(funcionesDeclaradas())].sort();
  assert.deepEqual(declaradas, Object.keys(EXPOSICION).sort());
});

test("toda función revoca EXECUTE a public, anon y authenticated; sólo las expuestas tienen grant", () => {
  for (const [fn, clase] of Object.entries(EXPOSICION)) {
    assert.match(sql, new RegExp(`revoke execute on function ${fn}\\([^)]*\\) from public, anon, authenticated;`), `${fn}: falta el revoke`);
    const grants = [...sql.matchAll(new RegExp(`grant execute on function ${fn}\\([^)]*\\) to ([^;]+);`, "g"))].map((m) => m[1].trim());
    if (GRANT[clase] === null) assert.deepEqual(grants, [], `${fn}: es interna y tiene grant`);
    else assert.deepEqual(grants, [GRANT[clase]], `${fn}: grant incorrecto`);
  }
});

test("las seis tablas tienen RLS y sin privilegios para anon/authenticated", () => {
  for (const t of ["rooms", "room_participants", "room_rounds", "room_titles", "room_votes", "sala_config"]) {
    assert.match(sql, new RegExp(`alter table ${t} enable row level security`));
    assert.match(sql, new RegExp(`revoke all on ${t} from anon, authenticated`));
    assert.doesNotMatch(sql, new RegExp(`create policy [^\\n]* on ${t}\\b`), `${t} no debe tener policies`);
  }
});

test("la lista de códigos permitidos en SQL es exactamente ALL_CODES", () => {
  const m = sql.match(/sala_codigos_permitidos\(\)[\s\S]*?array\[([^\]]+)\]/);
  assert.ok(m, "falta sala_codigos_permitidos");
  const codigos = m[1].split(",").map((s) => s.trim().replace(/'/g, "")).sort();
  assert.deepEqual(codigos, [...ALL_CODES].sort());
});

test("ninguna RPC acepta participant_id como parámetro", () => {
  assert.doesNotMatch(sql, /p_participant/i);
});

test("toda security definer pinea el search_path", () => {
  const defs = sql.match(/security definer[\s\S]*?set search_path = public, extensions, pg_temp/g) ?? [];
  const total = (sql.match(/security definer/g) ?? []).length;
  assert.equal(defs.length, total);
});

test("orden de bloqueo: ninguna función bloquea room_rounds antes que rooms", () => {
  // Por cuerpo de función: si hay un `from room_rounds … for update`, tiene que
  // haber antes un `from rooms … for update` en el MISMO cuerpo, o el cuerpo
  // tiene que declarar que su llamador ya bloqueó la sala.
  const cuerpos = sql.split(/create or replace function/).slice(1);
  for (const c of cuerpos) {
    const nombre = c.match(/^\s*(\w+)/)![1];
    const ronda = c.search(/from room_rounds[^;]*for update/);
    if (ronda < 0) continue;
    const sala = c.search(/from rooms[^;]*for update/);
    const declara = /-- llamador: sala bloqueada/.test(c);
    assert.ok(declara || (sala >= 0 && sala < ronda), `${nombre}: bloquea la ronda antes que la sala`);
  }
});

test("sala_candidatos excluye apto_chicos y exige duración y razón (no advertencia) en TODAS las duraciones", () => {
  const cuerpo = sql.match(/function sala_candidatos[\s\S]*?\$\$;/)![0];
  assert.match(cuerpo, /not rt\.apto_chicos/);
  assert.match(cuerpo, /rt\.runtime > 0/);
  assert.match(cuerpo, /nullif\(btrim\(rt\.razon\), ''\) is not null/, "la razón vale sólo con texto real");
  assert.doesNotMatch(cuerpo, /advertencia is not null/, "el pero es opcional: no puede filtrarse");
  assert.match(cuerpo, /order by md5\(p_seed/);
  assert.doesNotMatch(cuerpo, /popularity|vote_average/);
  assert.match(cuerpo, /media_type = 'movie'/);
});

test("sólo service_role ejecuta la preparación", () => {
  for (const f of ["sala_iniciar_preparacion", "sala_candidatos", "sala_publicar_ronda", "sala_abortar_preparacion"]) {
    assert.match(sql, new RegExp(`grant execute on function ${f}\\([^)]*\\) to service_role`));
    assert.match(sql, new RegExp(`revoke execute on function ${f}\\([^)]*\\) from public, anon, authenticated`));
  }
});

test("room_titles.advertencia admite NULL y razon no", () => {
  const tabla = sql.match(/create table if not exists room_titles \(([\s\S]*?)\);/)![1];
  assert.match(tabla, /\n\s*razon\s+text not null/);
  assert.match(tabla, /\n\s*advertencia\s+text,/);
});

test("las salas nacen apagadas: sala_config.activas = 'false' en la migración", () => {
  assert.match(sql, /insert into sala_config \(clave, valor\) values \('activas', 'false'\)/);
});
