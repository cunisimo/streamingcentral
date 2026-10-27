// E6: nombre comunitario y perfil mínimo. Pruebas de lógica, adaptadores y
// barridos de fuente; los permisos efectivos y la base real los prueba
// scripts/comunidad/pruebas-perfiles.mjs contra Supabase local.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluarNombre } from "./reglas/decision.ts";
import { cambiarNombre, type DependenciasNombre } from "./nombre-nucleo.ts";
import { mensajeNombre, MENSAJE_NOMBRE_NO_ADMITIDO, NOMBRE_PENDIENTE, normalizarNombre, problemaNombre } from "./nombre.ts";
import { agregadosPerfil, cabeceraValida, clavePerfil, ORDEN_PERFIL, tituloPerfil } from "./perfil-nucleo.ts";
import { pedidoPerfil } from "./perfil.ts";
import { codificarCursor } from "./lectura.ts";
import { alLlegarMas, conPrimeraPagina, itemValido, listaVacia, pedirMas, tandaValida, trasVoto } from "./lista-nucleo.ts";
import { ErrorRpc } from "./escritura-nucleo.ts";
import { hrefPerfil, parseParamsPerfil } from "../rutas.ts";
import { AVATARES, LEGADO_V1 } from "../avatares.ts";

const leer = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const UID = "11111111-1111-4111-8111-111111111111";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// ------------------------------------------------------------ forma del nombre

test("nombre: NFC, bordes y espacios colapsados; 2–24 puntos de código; sin controles ni invisibles", () => {
  assert.equal(normalizarNombre("  Cinéfila   del\tSur  "), "Cinéfila del Sur");
  assert.equal(problemaNombre("Ana"), null);
  assert.match(problemaNombre("x") ?? "", /entre 2 y 24/);
  assert.match(problemaNombre("a".repeat(25)) ?? "", /entre 2 y 24/);
  assert.equal(problemaNombre("🎬🍿"), null, "2 puntos de código: entra");
  // El CHECK de 011 prohíbe U+200D (ZWJ): un emoji compuesto queda afuera, igual
  // que en las reseñas. Reabrirlo es la decisión pendiente anotada en ESTADO.
  assert.notEqual(problemaNombre("👨‍👩‍👧"), null);
  for (const c of ["​", "‮", "⁦", "﻿", "\u0007", "\u0085"]) {
    assert.match(problemaNombre(`Ana${c}Ana`) ?? "", /invisibles/, JSON.stringify(c));
  }
});

test("nombre: la validación previa usa los MISMOS caracteres que el CHECK de 011", () => {
  const sql = leer("supabase/migrations/011_comunidad_esquema.sql");
  assert.match(sql, /nombre_comunitario !~ '\[\\u0001-\\u001F\\u007F-\\u009F​-‏‪-‮⁠-⁩﻿\]'/);
  for (const cp of [0x01, 0x1f, 0x7f, 0x9f, 0x200b, 0x200f, 0x202a, 0x202e, 0x2060, 0x2069, 0xfeff]) {
    assert.notEqual(problemaNombre(`Ab${String.fromCodePoint(cp)}Cd`), null, cp.toString(16));
  }
  assert.match(sql, /char_length\(nombre_comunitario\) between 2 and 24/);
});

// ------------------------------------------------------------ reglas de E1

test("reglas de E1 sobre nombres: contacto ofuscado → rechazo; odio → retener; lo común → publicar", () => {
  for (const n of ["juan arroba gmail", "juan@gmail.com", "wsp 11 5555 4444", "1155554444", "ig: @juancho", "netflix punto com"]) {
    assert.equal(evaluarNombre(n).resultado, "rechazo_contenido", n);
  }
  assert.equal(evaluarNombre("FueraBolitas").resultado, "retener");
  for (const n of ["Cinéfila del Sur", "Juan Pérez", "Ana"]) assert.equal(evaluarNombre(n).resultado, "publicar", n);
});

// ------------------------------------------------------------ núcleo de la ruta

function deps(respuestas: (() => Promise<Record<string, unknown>>)[], evaluar = evaluarNombre) {
  const llamadas: { uid: string; nombre: string; decision: { resultado: string } }[] = [];
  const d: DependenciasNombre = {
    evaluar,
    cambiar: async (a) => { llamadas.push(a); const f = respuestas.shift(); if (!f) throw new Error("sin respuesta"); return f() as never; },
  };
  return { d, llamadas };
}
const ok = (x: Record<string, unknown>) => async () => x;

test("ruta del nombre: formato y pedido inválido no tocan la base; el nombre que llega es el NORMALIZADO", async () => {
  const { d, llamadas } = deps([ok({ resultado: "nombre_cambiado", nombre: "Juan Pérez" })]);
  assert.deepEqual(await cambiarNombre(d, { uid: "no-uuid", nombre: "Ana" }), { resultado: "invalido" });
  assert.equal((await cambiarNombre(d, { uid: UID, nombre: "x" })).resultado, "rechazo_formato");
  assert.equal((await cambiarNombre(d, { uid: UID, nombre: "Ana​" })).resultado, "rechazo_formato");
  assert.equal(llamadas.length, 0);
  const r = await cambiarNombre(d, { uid: UID, nombre: "  Juan   Pérez " });
  assert.equal(r.resultado, "nombre_cambiado");
  assert.deepEqual([llamadas[0].nombre, llamadas[0].decision.resultado], ["Juan Pérez", "publicar"]);
});

test("ruta del nombre: rechazo de contenido lleva el motivo de las reglas; retener viaja como retener (la base no lo guarda)", async () => {
  const { d, llamadas } = deps([ok({ resultado: "rechazo_contenido" }), ok({ resultado: "nombre_no_admitido" })]);
  const r = await cambiarNombre(d, { uid: UID, nombre: "juan arroba gmail" });
  assert.equal(r.resultado, "rechazo_contenido");
  assert.match(String((r as { mensaje?: unknown }).mensaje), /correo/);
  assert.equal((await cambiarNombre(d, { uid: UID, nombre: "FueraBolitas" })).resultado, "nombre_no_admitido");
  assert.deepEqual(llamadas.map((x) => x.decision.resultado), ["rechazo_contenido", "retener"]);
  assert.equal(mensajeNombre({ resultado: "nombre_no_admitido" }).texto, MENSAJE_NOMBRE_NO_ADMITIDO);
});

test("ruta del nombre: una regla que falla NUNCA llega a la base como publicar", async () => {
  const { d, llamadas } = deps([], () => { throw new Error("falla"); });
  assert.deepEqual(await cambiarNombre(d, { uid: UID, nombre: "Ana" }), { resultado: "error" });
  const e = deps([], () => ({ resultado: "error", versionReglas: "v", disparadas: [], motivoUsuario: "x" }));
  assert.deepEqual(await cambiarNombre(e.d, { uid: UID, nombre: "Ana" }), { resultado: "error" });
  assert.equal(llamadas.length + e.llamadas.length, 0);
});

test("ruta del nombre: confirmación perdida → se repite UNA vez (sin_cambios confirma); dos pérdidas → sin_confirmar; rechazo confirmado → error", async () => {
  const perdida = async () => { throw new ErrorRpc("x", "", false); };
  const a = deps([perdida, ok({ resultado: "sin_cambios", nombre: "Ana" })]);
  assert.equal((await cambiarNombre(a.d, { uid: UID, nombre: "Ana" })).resultado, "sin_cambios");
  assert.equal(a.llamadas.length, 2);
  const b = deps([perdida, perdida]);
  assert.deepEqual(await cambiarNombre(b.d, { uid: UID, nombre: "Ana" }), { resultado: "sin_confirmar" });
  const c = deps([async () => { throw new ErrorRpc("x", "23514", true); }]);
  assert.deepEqual(await cambiarNombre(c.d, { uid: UID, nombre: "Ana" }), { resultado: "error" });
  assert.equal(c.llamadas.length, 1);
  const baja = deps([async () => { throw new ErrorRpc("baja_en_curso", "CB001", true); }]);
  assert.deepEqual(await cambiarNombre(baja.d, { uid: UID, nombre: "Ana" }), { resultado: "baja_en_curso" });
});

test("mensajes del nombre: ninguno afirma un guardado sin confirmar", () => {
  assert.equal(mensajeNombre("sin-confirmar").tono, "sin_confirmar");
  assert.equal(mensajeNombre({ resultado: "sin_confirmar" }).tono, "sin_confirmar");
  assert.match(mensajeNombre({ resultado: "nombre_cambiado", nombre: "Ana" }).texto, /«Ana»/);
  assert.match(mensajeNombre({ resultado: "rechazo_cuenta", motivo: "limite_diario" }).texto, /límite/);
  assert.match(mensajeNombre({ resultado: "rechazo_cuenta", motivo: "terminos_pendientes" }).texto, /términos/);
  assert.equal(mensajeNombre({ resultado: "error" }).tono, "error");
});

// ------------------------------------------------------------ perfil

test("cabecera: fuera de `activo` no se toma nombre ni avatar aunque vengan; avatar sólo con forma de id del catálogo", () => {
  for (const estado of ["bloqueado", "eliminada"]) {
    const c = cabeceraValida({ activo: true, estado, id: P1, nombre: "Filtrado", avatar: "coco", resenas: 9 });
    assert.deepEqual([c?.estado, c?.nombre, c?.avatar, c?.resenas], [estado, null, null, 0]);
  }
  assert.equal(tituloPerfil(cabeceraValida({ activo: true, estado: "bloqueado", id: P1 })!), "Usuario bloqueado");
  assert.equal(tituloPerfil(cabeceraValida({ activo: true, estado: "eliminada", id: P1 })!), "Cuenta eliminada");
  const a = cabeceraValida({ activo: true, estado: "activo", id: P1, nombre: null, avatar: "../x.png", propio: false, resenas: 1, utiles_recibidos: 2 })!;
  assert.deepEqual([a.avatar, tituloPerfil(a), agregadosPerfil(a)], [null, NOMBRE_PENDIENTE, "1 reseña · 2 «Me sirvió» recibidos"]);
  assert.equal(cabeceraValida({ activo: false }), null);
  assert.equal(cabeceraValida({ activo: true, estado: "activo" }), null, "activo sin id");
  assert.equal(cabeceraValida({ activo: true, estado: "otro", id: P1 }), null);
});

test("perfil: pedido válido sólo con un id uuid o yo=1, y cursor de la forma (fecha, id)", () => {
  assert.deepEqual(pedidoPerfil(new URLSearchParams(`id=${P1}`)), { id: P1, cursor: null, limite: 5 });
  assert.deepEqual(pedidoPerfil(new URLSearchParams("yo=1")), { id: null, cursor: null, limite: 5 });
  const c = codificarCursor({ t: "2026-10-27T00:00:00Z", id: 7 });
  assert.deepEqual(pedidoPerfil(new URLSearchParams(`id=${P1}&cursor=${c}`)), { id: P1, cursor: { t: "2026-10-27T00:00:00Z", id: 7 }, limite: 5 });
  for (const q of ["", `id=${P1}&yo=1`, "id=123", `id=${P1.toUpperCase()}`, `id=${P1}&cursor=basura`, `id=${P1}&cursor=${codificarCursor({ o: 1, p: 0 })}`]) {
    assert.ok("invalido" in pedidoPerfil(new URLSearchParams(q)), q);
  }
});

test("lista del perfil: misma máquina que la ficha; respuestas de otra cuenta, otro perfil o pedido viejo no se aplican; votar no reordena ni pierde páginas", () => {
  const item = (id: number) => ({ resena_id: id, version_id: id * 10, texto: `t${id}`, publicada_en: "2026-10-27T00:00:00+00:00", utiles: 0, total: 0,
    autor: { id: P1, nombre: "Ana" }, tipo: "movie", tmdb_id: 100 + id });
  const pagina = (ids: number[], cursor: string | null) => ({ activo: true, estado: "activo", orden: ORDEN_PERFIL, items: ids.map(item), hay_mas: cursor !== null, cursor });
  const K = clavePerfil(UID, P1);
  const t1 = tandaValida(pagina([1, 2, 3, 4, 5], "c1"), ORDEN_PERFIL)!;
  assert.deepEqual(t1.items[0].titulo, { tipo: "movie", tmdbId: 101 });
  let e = conPrimeraPagina(listaVacia(K), t1);
  const p = pedirMas(e)!;
  e = p.estado;
  const t2 = tandaValida(pagina([6, 7], null), ORDEN_PERFIL)!;
  assert.equal(alLlegarMas(e, p.pedido.n, clavePerfil(UID, P2), t2), e, "otro perfil");
  assert.equal(alLlegarMas(e, p.pedido.n, clavePerfil("22222222-2222-4222-8222-222222222222", P1), t2), e, "otra cuenta");
  assert.equal(alLlegarMas(e, p.pedido.n - 1, K, t2), e, "pedido viejo");
  e = alLlegarMas(e, p.pedido.n, K, t2);
  assert.deepEqual([e.items.map((x) => x.resena_id), e.hayMas], [[1, 2, 3, 4, 5, 6, 7], false]);
  const v = trasVoto(e, 60, "voto_registrado", "util");
  assert.deepEqual([v.items.map((x) => x.resena_id), v.items[5].utiles, v.items[5].total], [[1, 2, 3, 4, 5, 6, 7], 1, 1]);
  assert.equal(tandaValida({ ...pagina([1], null), orden: "recientes" }, ORDEN_PERFIL), null, "una respuesta de la ficha no es del perfil");
});

test("item: el autor sólo con id uuid (nunca otro dato); un autor mal formado no invalida la reseña", () => {
  const base = { resena_id: 1, version_id: 2, texto: "t", publicada_en: "2026-10-27T00:00:00Z", utiles: 0, total: 0 };
  assert.deepEqual(itemValido({ ...base, autor: { id: P1, nombre: "Ana", correo: "a@b.c", user_id: UID } })?.autor, { id: P1, nombre: "Ana" });
  assert.deepEqual(itemValido({ ...base, autor: { id: P1, nombre: null } })?.autor, { id: P1, nombre: null });
  assert.equal(itemValido({ ...base, autor: { id: "x" } })?.autor, null);
  assert.equal(itemValido(base)?.autor, null);
});

test("rutas: /u/?id= igual en la web y el contenedor; sólo uuid", () => {
  assert.equal(hrefPerfil(P1), `/u/?id=${P1}`);
  assert.deepEqual(parseParamsPerfil(new URLSearchParams(`id=${P1.toUpperCase()}`)), { id: P1 });
  for (const q of ["", "id=1", "id=../x", `id=${P1}x`]) assert.equal(parseParamsPerfil(new URLSearchParams(q)), null, q);
  const pagina = leer("app/u/page.tsx");
  assert.doesNotMatch(pagina, /^"use client"/);
  assert.match(pagina, /robots: \{ index: false, follow: false \}/);
  assert.match(leer("components/nativo/PerfilDesdeQuery.tsx"), /<Suspense/);
  // La ruta viaja en el contenedor: no está entre las excluidas del export.
  assert.doesNotMatch(leer("scripts/build-capacitor.mjs").match(/^const APP_FUERA = .*$/m)![0], /"u"/);
});

// ------------------------------------------------------------ barridos de la base

const sql019 = () => leer("supabase/migrations/019_comunidad_perfiles.sql");
const funcion = (s: string, nombre: string) => {
  const i = s.indexOf(`create or replace function ${nombre}(`);
  return s.slice(i, s.indexOf("\n$$;", i));
};

test("barrido 019: permisos. El perfil sólo authenticated (lee al lector de auth.uid(), sin uid en el pedido); el nombre sólo service_role", () => {
  const s = sql019();
  assert.match(s, /grant execute on function public\.comunidad_perfil\(uuid, jsonb, integer\) to authenticated;/);
  assert.match(s, /grant execute on function public\.comunidad_cambiar_nombre\(uuid, text, jsonb\) to service_role;/);
  assert.doesNotMatch(s, /grant execute on function public\.comunidad_perfil[^;]*(anon|service_role)/);
  assert.doesNotMatch(s, /grant execute on function public\.comunidad_cambiar_nombre[^;]*(anon|authenticated)/);
  assert.match(s, /revoke all on function comunidad\.avatar_publico\(text\) from public, anon, authenticated, service_role;/);
  const perfil = funcion(s, "public.comunidad_perfil");
  assert.match(perfil, /v_uid uuid := auth\.uid\(\);/);
  assert.doesNotMatch(perfil.split("\n")[0], /p_uid/);
});

test("barrido 019: la proyección no nombra correo, display_name ni user_id; el nombre se escribe SÓLO en participantes", () => {
  const s = sql019();
  const perfil = funcion(s, "public.comunidad_perfil");
  const salida = perfil.slice(perfil.lastIndexOf("return jsonb_build_object("));
  for (const p of ["email", "display_name", "user_id", "avatar_seed", "plataformas", "user_items", "view_history"]) {
    assert.doesNotMatch(salida, new RegExp(p), p);
  }
  assert.match(salida, /'avatar', comunidad\.avatar_publico\(v_seed\)/);
  assert.doesNotMatch(perfil, /display_name|email/);
  const cambiar = funcion(s, "public.comunidad_cambiar_nombre");
  assert.match(cambiar, /update comunidad\.participantes set nombre_comunitario = p_nombre/);
  assert.doesNotMatch(cambiar, /profiles/);
  assert.match(cambiar, /comunidad\.decision_valida\(p_decision\)/);
  assert.match(cambiar, /comunidad\.condiciones_a\(p_uid, v_part\)/);
  assert.match(cambiar, /limite_nombres/);
  // `profiles.display_name` no aparece en ninguna parte de 019.
  assert.doesNotMatch(s.replace(/^--.*$/gm, ""), /display_name/);
});

test("barrido 019: bloqueo, cuenta eliminada y suspensión en el perfil", () => {
  const perfil = funcion(sql019(), "public.comunidad_perfil");
  assert.match(perfil, /if o\.user_id is null or exists \(select 1 from comunidad\.bajas_en_curso/);
  assert.match(perfil, /'estado', 'eliminada', 'id', o\.id\);/);
  assert.match(perfil, /b\.bloqueador_participante = v_lector and b\.bloqueado_participante = o\.id/);
  assert.match(perfil, /'estado', 'bloqueado', 'id', o\.id\);/);
  assert.match(perfil, /v\.estado = 'publicada' and \(v_propio or not v_suspendido\)/);
});

test("barrido 019: el catálogo del avatar público es LEGADO_V1 y coincide con los 31 de AVATARES", () => {
  const m = sql019().match(/catalogo constant text\[\] := array\[([\s\S]*?)\];/)!;
  const ids = [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]);
  assert.deepEqual(ids, [...LEGADO_V1]);
  assert.deepEqual([...AVATARES.map((a) => a.id)].sort(), [...ids].sort(), "un avatar nuevo exige actualizar avatar_publico");
});

test("barrido 019: el down restaura item_lectura de 017 LITERAL y no toca nombres", () => {
  const down = leer("supabase/migrations/019_comunidad_perfiles_down.sql");
  const de017 = funcion(leer("supabase/migrations/017_comunidad_lectura.sql"), "comunidad.item_lectura");
  assert.ok(down.includes(de017), "item_lectura de 017 copiada sin cambios");
  assert.doesNotMatch(down, /nombre_comunitario\s*=|update /);
});
