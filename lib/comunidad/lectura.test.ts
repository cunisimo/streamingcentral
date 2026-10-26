// E5a: lectura protegida. Núcleo de la lista (tandas, cursor confirmado,
// respuestas viejas), pedido y adaptador de la ruta con una base FALSA,
// encabezado de la sección y barridos de fuente. Las funciones reales
// (permisos, visibilidad, más de 200 reseñas, cambios entre páginas) están en
// scripts/comunidad/pruebas-lectura.mjs, contra `supabase start`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  alLlegarMas, claveLista, conPrimeraPagina, listaVacia, pedirMas, tandaValida, trasDenuncia, trasVoto, unir,
  type ItemLista, type Tanda,
} from "./lista-nucleo.ts";
import { codificarCursor, decodificarCursor, estadoHttpLectura, leerResenas, pedidoLectura } from "./lectura.ts";
import { encabezadoResenas } from "../resenas.ts";

const it = (id: number, extra: Partial<ItemLista> = {}): ItemLista => ({
  resena_id: id, version_id: id * 10, texto: `t${id}`, publicada_en: `2026-10-26T00:00:0${id % 10}.000001+00:00`,
  editada: false, utiles: 0, total: 0, mi_voto: null, denunciada: false, ...extra,
});
const tanda = (ids: number[], cursor: string | null): Tanda => ({ items: ids.map((i) => it(i)), cursor, hayMas: cursor !== null, orden: "recientes" });
const K = claveLista("u1", "movie", 603, "recientes");

test("lista: la primera página reemplaza; Cargar más avanza el cursor SÓLO con una tanda válida", () => {
  let e = conPrimeraPagina(listaVacia(K), tanda([9, 8, 7, 6, 5], "c1"));
  assert.deepEqual(e.items.map((x) => x.resena_id), [9, 8, 7, 6, 5]);
  const p = pedirMas(e)!;
  assert.equal(p.pedido.cursor, "c1");
  assert.equal(pedirMas(p.estado), null, "un segundo toque mientras carga no pide otra vez");
  // Falla la tanda: lo visible queda, el cursor confirmado no se mueve y el reintento sale del mismo punto.
  e = alLlegarMas(p.estado, p.pedido.n, K, null);
  assert.deepEqual([e.items.length, e.cursor, e.errorMas, e.cargandoMas], [5, "c1", true, false]);
  const r = pedirMas(e)!;
  assert.equal(r.pedido.cursor, "c1");
  e = alLlegarMas(r.estado, r.pedido.n, K, tanda([4, 3, 2, 1, 0], null));
  assert.deepEqual([e.items.map((x) => x.resena_id), e.cursor, e.hayMas, e.errorMas], [[9, 8, 7, 6, 5, 4, 3, 2, 1, 0], null, false, false]);
  assert.equal(pedirMas(e), null, "sin más, no hay pedido");
});

test("lista: una respuesta vieja, de otra clave (cuenta, título u orden) o después de una recarga se descarta", () => {
  const e0 = conPrimeraPagina(listaVacia(K), tanda([5, 4], "c1"));
  const p = pedirMas(e0)!;
  // Otra clave.
  for (const otra of [claveLista("u2", "movie", 603, "recientes"), claveLista("u1", "tv", 603, "recientes"), claveLista("u1", "movie", 603, "utiles")]) {
    assert.equal(alLlegarMas(p.estado, p.pedido.n, otra, tanda([3], null)), p.estado);
  }
  // Una recarga completa mientras "Cargar más" estaba en vuelo: su respuesta tardía no entra.
  const recargada = conPrimeraPagina(p.estado, tanda([6, 5], "c2"));
  const tarde = alLlegarMas(recargada, p.pedido.n, K, tanda([3], null));
  assert.deepEqual(tarde.items.map((x) => x.resena_id), [6, 5]);
  assert.equal(tarde.cursor, "c2");
  // Y el pedido siguiente no puede tener el mismo número que el invalidado.
  assert.notEqual(pedirMas(recargada)!.pedido.n, p.pedido.n);
});

test("lista: sin duplicados por reseña (una edición entre páginas trae otra versión de la misma reseña)", () => {
  const editada = it(5, { version_id: 51, texto: "nueva" });
  assert.deepEqual(unir([it(6), it(5)], [editada, it(4)]).map((x) => [x.resena_id, x.version_id]), [[6, 60], [5, 50], [4, 40]]);
});

test("tanda válida: activo, el orden pedido, items bien formados y cursor exactamente cuando hay más", () => {
  const base = { activo: true, orden: "recientes", items: [it(1)], hay_mas: true, cursor: "x" };
  assert.ok(tandaValida(base, "recientes"));
  assert.equal(tandaValida({ ...base, orden: "utiles" }, "recientes"), null);
  assert.equal(tandaValida({ ...base, activo: false }, "recientes"), null);
  assert.equal(tandaValida({ ...base, hay_mas: false }, "recientes"), null);
  assert.equal(tandaValida({ ...base, cursor: null }, "recientes"), null);
  assert.equal(tandaValida({ ...base, items: [{ resena_id: "1" }] }, "recientes"), null);
  assert.equal(tandaValida({ resultado: "error" }, "recientes"), null);
});

test("voto confirmado: se aplica a la reseña que se ve, sin recargar; sin confirmar o rechazado no cambia nada", () => {
  const e = conPrimeraPagina(listaVacia(K), { items: [it(1, { utiles: 2, total: 3 })], cursor: null, hayMas: false, orden: "recientes" });
  const util = trasVoto(e, 10, "voto_registrado", "util");
  assert.deepEqual([util.items[0].mi_voto, util.items[0].utiles, util.items[0].total], ["util", 3, 4]);
  const cambio = trasVoto(util, 10, "voto_registrado", "no_util");
  assert.deepEqual([cambio.items[0].mi_voto, cambio.items[0].utiles, cambio.items[0].total], ["no_util", 2, 4]);
  const retirado = trasVoto(cambio, 10, "voto_retirado", "retirar");
  assert.deepEqual([retirado.items[0].mi_voto, retirado.items[0].utiles, retirado.items[0].total], [null, 2, 3]);
  for (const r of ["rechazo_cuenta", "error", "sin_confirmar", undefined]) assert.equal(trasVoto(e, 10, r, "util"), e);
  assert.equal(trasDenuncia(e, 10).items[0].denunciada, true);
});

test("A1 (auditoría de E5a): los resultados IDEMPOTENTES de una confirmación recuperada también se reflejan, sin contar dos veces", () => {
  const base = conPrimeraPagina(listaVacia(K), { items: [it(1, { utiles: 2, total: 3 }), it(2)], cursor: "c1", hayMas: true, orden: "recientes" });
  // Voto positivo cuya primera respuesta se perdió: el reintento confirma `sin_cambios` (ya quedó guardado).
  const util = trasVoto(base, 10, "sin_cambios", "util");
  assert.deepEqual([util.items[0].mi_voto, util.items[0].utiles, util.items[0].total], ["util", 3, 4]);
  // Repetirlo (otra respuesta tardía, otro reintento) no vuelve a sumar.
  assert.equal(trasVoto(util, 10, "sin_cambios", "util"), util);
  assert.equal(trasVoto(util, 10, "voto_registrado", "util"), util);
  // Negativo y cambio de voto recuperados.
  const no = trasVoto(base, 10, "sin_cambios", "no_util");
  assert.deepEqual([no.items[0].mi_voto, no.items[0].utiles, no.items[0].total], ["no_util", 2, 4]);
  const cambio = trasVoto(util, 10, "sin_cambios", "no_util");
  assert.deepEqual([cambio.items[0].mi_voto, cambio.items[0].utiles, cambio.items[0].total], ["no_util", 2, 4]);
  // Retiro cuya primera respuesta se perdió: el reintento confirma `sin_efecto` (ya no hay voto).
  const retirado = trasVoto(util, 10, "sin_efecto", "retirar");
  assert.deepEqual([retirado.items[0].mi_voto, retirado.items[0].utiles, retirado.items[0].total], [null, 2, 3]);
  assert.equal(trasVoto(retirado, 10, "sin_efecto", "retirar"), retirado);
  // Lo que NO es una confirmación no cambia nada: incierto, rechazo, error, o un resultado que no corresponde a lo enviado.
  for (const [r, enviado] of [["sin_confirmar", "util"], ["error", "util"], ["rechazo_cuenta", "no_util"], ["sin_efecto", "util"], ["sin_cambios", "retirar"], ["voto_retirado", "util"]] as const) {
    assert.equal(trasVoto(util, 10, r, enviado), util, `${r} tras ${enviado}`);
  }
  // Otra versión (la reseña se editó): no toca nada. Páginas, cursor y orden quedan.
  assert.equal(trasVoto(base, 99, "sin_cambios", "util"), base);
  assert.deepEqual([util.items.length, util.cursor, util.hayMas, util.clave], [2, "c1", true, K]);
});

test("pedido de lectura: título válido, sólo «recientes» habilitado, cursor opaco; el lector NUNCA sale de la consulta", () => {
  const q = (s: string) => pedidoLectura(new URLSearchParams(s));
  assert.deepEqual(q("tipo=movie&id=603"), { tipo: "movie", tmdbId: 603, orden: "recientes", cursor: null, limite: 5 });
  const c = codificarCursor({ t: "2026-10-26T01:02:03.123456+00:00", id: 77 });
  assert.deepEqual(q(`tipo=tv&id=1&orden=recientes&cursor=${c}`), { tipo: "tv", tmdbId: 1, orden: "recientes", cursor: { t: "2026-10-26T01:02:03.123456+00:00", id: 77 }, limite: 5 });
  assert.deepEqual(q("tipo=movie&id=603&orden=utiles"), { invalido: "orden_no_disponible" }, "Más útiles es de E5b");
  for (const mal of ["", "tipo=x&id=1", "tipo=movie&id=0", "tipo=movie&id=1.5", "tipo=movie&id=-3", "tipo=movie&id=99999999999",
    "tipo=movie&id=1&orden=otro", "tipo=movie&id=1&cursor=nada", `tipo=movie&id=1&cursor=${codificarCursor({ t: "ayer", id: 1 })}`]) {
    assert.ok("invalido" in q(mal), mal);
  }
  assert.equal(decodificarCursor(codificarCursor({ t: "2026-01-01T00:00:00+00:00", id: 0 })), null);
  // Aunque venga un uid en la consulta, el pedido no lo lleva.
  assert.equal(JSON.stringify(q("tipo=movie&id=1&uid=00000000-0000-4000-8000-000000000000")).includes("uid"), false);
});

function baseFalsa(respuestas: Array<{ data?: unknown; error?: { code?: string; message?: string } } | "lanza">) {
  const llamadas: Array<{ f: string; args: unknown }> = [];
  const sb = {
    rpc: async (f: string, args: unknown) => {
      llamadas.push({ f, args });
      const r = respuestas.shift();
      if (r === "lanza" || r === undefined) throw new TypeError("fetch failed");
      return { data: r.data ?? null, error: r.error ?? null };
    },
  } as unknown as SupabaseClient;
  return { sb, llamadas };
}

test("adaptador: llama a comunidad_resenas con el pedido y codifica el cursor siguiente; 42501 y JWT vencido = sin_sesion", async () => {
  const p = pedidoLectura(new URLSearchParams("tipo=movie&id=603")) as Exclude<ReturnType<typeof pedidoLectura>, { invalido: string }>;
  const a = baseFalsa([{ data: { activo: true, orden: "recientes", items: [], hay_mas: true, cursor: { t: "2026-10-26T00:00:00+00:00", id: 9 } } }]);
  const r = await leerResenas(a.sb, p);
  assert.deepEqual(a.llamadas, [{ f: "comunidad_resenas", args: { p_tipo: "movie", p_tmdb_id: 603, p_orden: "recientes", p_cursor: null, p_limite: 5 } }]);
  assert.deepEqual(decodificarCursor(r.cursor as string), { t: "2026-10-26T00:00:00+00:00", id: 9 });
  for (const [error, esperado] of [[{ code: "42501" }, "sin_sesion"], [{ code: "PGRST301" }, "sin_sesion"], [{ code: "22023" }, "invalido"], [{ code: "XX000" }, "error"]] as const) {
    const b = baseFalsa([{ error }]);
    assert.deepEqual(await leerResenas(b.sb, p), { resultado: esperado });
    assert.equal(b.llamadas.length, 1, "una lectura no se repite sola: reintenta el cliente desde el mismo cursor");
  }
  assert.deepEqual(await leerResenas(baseFalsa(["lanza"]).sb, p), { resultado: "error" });
  // Módulo apagado: exactamente { activo: false }, sin cursor ni nada más.
  assert.deepEqual(await leerResenas(baseFalsa([{ data: { activo: false } }]).sb, p), { activo: false });
  assert.deepEqual([estadoHttpLectura({ resultado: "sin_sesion" }), estadoHttpLectura({ resultado: "invalido" }), estadoHttpLectura({ resultado: "error" }), estadoHttpLectura({ activo: true })], [401, 400, 500, 200]);
});

test("encabezado: sin sesión con el módulo encendido NO lleva número (no revela si hay); con sesión cuenta lo que ve; apagado, sólo Yump", () => {
  assert.equal(encabezadoResenas(0, null, false), "RESEÑAS");
  assert.equal(encabezadoResenas(1, null, false), "RESEÑAS");
  assert.equal(encabezadoResenas(1, 12, false), "RESEÑAS · 13");
  assert.equal(encabezadoResenas(0, 0, false), "RESEÑAS · 0");
  assert.equal(encabezadoResenas(1, null, true), "RESEÑAS · 1");
});

// ---------------------------------------------------------------------------
// Barridos de fuente.
// ---------------------------------------------------------------------------
const leer = (f: string) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
function archivos(dir: string): string[] {
  const raiz = new URL(`../../${dir}/`, import.meta.url);
  return readdirSync(raiz).flatMap((n) => {
    const st = statSync(new URL(n, raiz));
    return st.isDirectory() ? archivos(`${dir}/${n}`) : [`${dir}/${n}`];
  });
}

test("barrido: la ruta de lectura usa la sesión del lector y nunca service_role; sin sesión sólo informa el interruptor", () => {
  const r = leer("app/api/comunidad/resenas/lista/route.ts");
  assert.match(r, /supabaseComoUsuario\(token\)/);
  assert.match(r, /leerResenas\(sb, p\)/);
  assert.doesNotMatch(r, /supabaseAdmin|SERVICE_ROLE/);
  assert.match(r, /"Cache-Control": "private, no-store"/);
  assert.match(r, /resultado: "sin_sesion", activo: activo === true/);
  assert.match(r, /export const dynamic = "force-dynamic"/);
  assert.doesNotMatch(leer("lib/comunidad/lectura.ts"), /SUPABASE_SERVICE_ROLE_KEY|supabaseAdmin/);
  // La lectura provisional ya no existe en ninguna parte del código de la app.
  for (const f of [...archivos("app"), ...archivos("components"), ...archivos("lib")].filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("lectura.test.ts"))) {
    assert.doesNotMatch(leer(f), /comunidad_leer_titulo|\/api\/comunidad\/titulo|ops\.leerTitulo/, f);
  }
});

test("barrido: /api/title y la ficha del servidor no tocan nada comunitario (T1: la respuesta no cambia con el módulo)", () => {
  const titulo = archivos("app/api/title").filter((f) => f.endsWith(".ts"));
  assert.ok(titulo.length > 0);
  for (const f of [...titulo, "lib/enrich.ts", "lib/reviews.ts"]) {
    const s = leer(f);
    assert.doesNotMatch(s, /comunidad|ResenasComunidad|resenas\/lista/i, f);
  }
  // La sección de reseñas es de cliente y pide lo comunitario con Bearer, sin caché.
  assert.match(leer("components/ResenasAcordeon.tsx"), /^"use client";/);
  const cm = leer("components/comunidad/ResenasComunidad.tsx");
  assert.match(cm, /^"use client";/);
  assert.match(cm, /\/api\/comunidad\/resenas\/lista/);
  assert.match(cm, /Authorization: `Bearer \$\{t\}`/);
  assert.match(cm, /cache: "no-store"/);
});

test("barrido: la base. comunidad_resenas sólo para authenticated, lee al lector de auth.uid() (sin p_uid), filtra bloqueos y suspensiones y rechaza «utiles»", () => {
  const s = leer("supabase/migrations/017_comunidad_lectura.sql");
  assert.match(s, /function public\.comunidad_resenas\(p_tipo text, p_tmdb_id integer, p_orden text, p_cursor jsonb, p_limite integer\)/);
  assert.doesNotMatch(s.slice(s.indexOf("function public.comunidad_resenas"), s.indexOf("function public.comunidad_modulo_activo")), /p_uid/);
  assert.match(s, /v_uid uuid := auth\.uid\(\);/);
  assert.match(s, /grant execute on function public\.comunidad_resenas\(text, integer, text, jsonb, integer\) to authenticated;/);
  assert.doesNotMatch(s, /grant execute on function public\.comunidad_resenas[^;]*(anon|service_role)/);
  assert.match(s, /bloqueador_participante = v_part and b\.bloqueado_participante = r\.autor_participante/);
  assert.match(s, /s\.participante_id = r\.autor_participante/);
  assert.match(s, /p_orden is distinct from 'recientes'/);
  assert.match(s, /\(r\.primera_publicacion_en, r\.id\) < \(v_t, v_id\)/);
  assert.match(s, /drop function if exists public\.comunidad_leer_titulo/);
});
