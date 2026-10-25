// E3a: núcleo de escritura, texto compartido, mensajes y núcleos de interfaz.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LARGO_MAX, LARGO_MIN, largoTexto, normalizarTexto, problemaFormato } from "./texto.ts";
import { normalizarOriginal } from "./reglas/plegado.ts";
import { LARGO_RESENA } from "./reglas/listas.ts";
import { MOTIVO_RETENCION_RESENA, evaluarResena } from "./reglas/decision.ts";
import {
  conReconciliacion, errorConfirmado, errorRpc, escribirResena, estadoHttp, firmaPedido, type DependenciasEscritura, type RespuestaBase,
} from "./escritura-nucleo.ts";
import {
  MENSAJE_ERROR, MENSAJE_RETENIDA, MENSAJE_SIN_CONFIRMAR, MOTIVOS_CUENTA, mensajeEscritura,
} from "./mensajes.ts";
import { TERMINOS_VERSION } from "./terminos.ts";
import {
  avisoReinicio, conservarIntento, contador, firmaEnvio, intentoPara, puedeEnviar, respuestaVigente, type Persistida,
} from "./editor-nucleo.ts";
import { accionVoto, conteoUtilidad, mensajeVoto, puedeEvaluar } from "./evaluacion-nucleo.ts";

const BIEN = "La vi el fin de semana y me sorprendió para bien: buen ritmo, actuaciones creíbles y un final que no regala nada.";
const TELEFONO = "La vi el fin de semana y me encantó. Si querés hablar de la peli llamame al 11 5566 7788 y lo charlamos tranquilos.";
const SPAM = "Gana plata gratis con cripto: invertí hoy y duplicá tus ganancias en una semana, sorteo exclusivo para los primeros.";
const UID = "00000000-0000-4000-8000-000000000001";
const INTENTO = "00000000-0000-4000-8000-0000000000aa";

// ============================================================================
// Texto: pantalla, servidor y base cuentan igual
// ============================================================================

test("normalizarTexto es la normalización de las reglas de E1", () => {
  for (const t of ["  hola\r\nmundo  ", "Café ", "\n\nx\r\r", "👨‍👩‍👧 familia", "a b"]) {
    assert.equal(normalizarTexto(t), normalizarOriginal(t), JSON.stringify(t));
  }
});

test("los largos son los de E1 y los del CHECK de la base", () => {
  assert.deepEqual([LARGO_MIN, LARGO_MAX], [LARGO_RESENA.min, LARGO_RESENA.max]);
  const sql = readFileSync("supabase/migrations/011_comunidad_esquema.sql", "utf8");
  assert.match(sql, new RegExp(`char_length\\(texto\\) between ${LARGO_MIN} and ${LARGO_MAX}`));
});

test("el largo cuenta puntos de código, como char_length (emojis compuestos incluidos)", () => {
  assert.equal(largoTexto("abc"), 3);
  assert.equal(largoTexto("👨‍👩‍👧"), 5, "familia: 3 personas + 2 ZWJ");
  assert.equal(largoTexto("🇦🇷"), 2, "bandera: 2 indicadores regionales");
  assert.equal(largoTexto("é"), 1);
  assert.equal(largoTexto(normalizarTexto("é")), 1, "NFC une la tilde");
  assert.equal(contador("a".repeat(80)).estado, "ok");
  assert.equal(contador("a".repeat(79)).estado, "corto");
  assert.equal(contador("a".repeat(601)).estado, "largo");
  assert.equal(contador("  " + "a".repeat(80) + "\n\n").estado, "ok", "los bordes no cuentan, como en el servidor");
});

test("los caracteres que la base rechaza se rechazan antes (tabulación e invisibles incluidos)", () => {
  const base = BIEN;
  assert.equal(problemaFormato(base), null);
  for (const c of ["\t", "​", "‮", "⁦", "﻿", "\u0007"]) {
    assert.deepEqual(problemaFormato(base.replace(" ", ` ${c}`)), { tipo: "caracteres" }, JSON.stringify(c));
  }
  assert.equal(problemaFormato(base.replace(" ", "\n")), null, "el salto de línea sí");
  // E1 deja pasar la tabulación: sin esta validación fallaría al guardar.
  assert.equal(evaluarResena(base.replace(" ", "\t"), { textosRecientes: [] }).resultado, "publicar");
});

// ============================================================================
// Núcleo de escritura: orden y resultados, con dependencias falsas
// ============================================================================

function falsas(o: { recientesFalla?: boolean; base?: RespuestaBase | Error } = {}) {
  const llamadas: string[] = [];
  const pedidos: unknown[] = [];
  const deps: DependenciasEscritura = {
    textosRecientes: async () => { llamadas.push("recientes"); if (o.recientesFalla) throw new Error("red"); return []; },
    evaluar: (t, c) => { llamadas.push("reglas"); return evaluarResena(t, c); },
    hash: (s) => { llamadas.push("hash"); return "f".repeat(64) + String(s.length).slice(0, 0); },
    publicar: async (a) => {
      llamadas.push("publicar"); pedidos.push(a);
      if (o.base instanceof Error) throw o.base;
      return o.base ?? { resultado: a.decision.resultado === "publicar" ? "publicada" : a.decision.resultado === "retener" ? "retenida" : "rechazo_contenido" };
    },
    editar: async (a) => { llamadas.push("editar"); pedidos.push(a); if (o.base instanceof Error) throw o.base; return o.base ?? { resultado: "publicada" }; },
  };
  return { deps, llamadas, pedidos };
}
const pedido = (texto: string, extra = {}) => ({
  uid: UID, idIntento: INTENTO, texto,
  accion: { tipo: "publicar" as const, titulo: { tipo: "movie" as const, tmdbId: 603 } }, ...extra,
});

test("orden: forma → texto → contexto → reglas → hash → función", async () => {
  const { deps, llamadas, pedidos } = falsas();
  const r = await escribirResena(deps, pedido(`  ${BIEN}\r\n`));
  assert.equal(r.resultado, "publicada");
  assert.deepEqual(llamadas, ["recientes", "reglas", "hash", "publicar"]);
  assert.equal((pedidos[0] as { texto: string }).texto, BIEN, "a la base llega el texto normalizado");
  assert.deepEqual((pedidos[0] as { decision: unknown }).decision, { resultado: "publicar", version_reglas: evaluarResena(BIEN, { textosRecientes: [] }).versionReglas, reglas: [] });
});

test("pedido inválido o texto de formato inválido: no se toca la base", async () => {
  for (const p of [pedido(BIEN, { idIntento: "x" }), pedido(BIEN, { uid: "x" }),
    pedido(BIEN, { accion: { tipo: "publicar", titulo: { tipo: "serie", tmdbId: 1 } } }),
    pedido(BIEN, { accion: { tipo: "editar", resenaId: 0, versionEsperada: 1 } })]) {
    const { deps, llamadas } = falsas();
    assert.equal((await escribirResena(deps, p as never)).resultado, "invalido");
    assert.deepEqual(llamadas, []);
  }
  for (const t of ["corta", "a".repeat(601), BIEN.replace(" ", "\t")]) {
    const { deps, llamadas } = falsas();
    assert.equal((await escribirResena(deps, pedido(t))).resultado, "rechazo_formato");
    assert.deepEqual(llamadas, [], "ni reglas ni base");
  }
});

test("reglas: rechazo de contenido llega a la base (cuenta para el límite) con el motivo de las reglas", async () => {
  const { deps, pedidos } = falsas();
  const r = await escribirResena(deps, pedido(TELEFONO));
  assert.equal(r.resultado, "rechazo_contenido");
  assert.match(String((r as { mensaje: string }).mensaje), /teléfono/);
  assert.deepEqual((pedidos[0] as { decision: { reglas: string[] } }).decision.reglas, ["contacto.telefono"]);
});

test("reglas: retención llega como 'retener' con sus reglas", async () => {
  const { deps, pedidos } = falsas();
  assert.equal((await escribirResena(deps, pedido(SPAM))).resultado, "retenida");
  const d = (pedidos[0] as { decision: { resultado: string; reglas: string[] } }).decision;
  assert.equal(d.resultado, "retener");
  assert.ok(d.reglas.length > 0);
});

test("fallos: contexto que falla, reglas que lanzan o dan error, base que lanza → 'error', nunca publicado", async () => {
  assert.equal((await escribirResena(falsas({ recientesFalla: true }).deps, pedido(BIEN))).resultado, "error");
  const lanza = falsas(); lanza.deps.evaluar = () => { throw new Error("x"); };
  assert.equal((await escribirResena(lanza.deps, pedido(BIEN))).resultado, "error");
  const err = falsas(); err.deps.evaluar = () => ({ resultado: "error", versionReglas: "v", disparadas: [], motivoUsuario: "" });
  assert.equal((await escribirResena(err.deps, pedido(BIEN))).resultado, "error");
  assert.deepEqual(err.llamadas.includes("publicar"), false);
  // La base RECHAZÓ (SQLSTATE): se revirtió, "error", sin reintentar.
  const rechazo = falsas({ base: errorRpc("comunidad_publicar", { message: "lock", code: "55P03" }) });
  assert.equal((await escribirResena(rechazo.deps, pedido(BIEN))).resultado, "error");
  assert.equal(rechazo.llamadas.filter((x) => x === "publicar").length, 1);
});

test("A1: una excepción sin clasificar o un cuerpo ilegible NO es 'error': pudo haberse guardado", async () => {
  const lanza = falsas({ base: new Error("timeout") });
  assert.equal((await escribirResena(lanza.deps, pedido(BIEN))).resultado, "sin_confirmar");
  assert.equal(lanza.llamadas.filter((x) => x === "publicar").length, 2, "un solo reintento");
  const raro = falsas({ base: { resultado: 1 } as never });
  assert.equal((await escribirResena(raro.deps, pedido(BIEN))).resultado, "sin_confirmar");
});

test("A1: clasificación de los errores de supabase.rpc (formas medidas contra Supabase local)", () => {
  const conf = (code?: string) => errorRpc("f", { message: "m", code }).confirmado;
  // Rechazos de la base o de PostgREST: la transacción no quedó.
  for (const c of ["22023", "55P03", "40P01", "23505", "42501", "CB001", "CB002", "57014", "PGRST202", "PGRST002", "PGRST301"]) {
    assert.equal(conf(c), true, c);
  }
  // Confirmación perdida: fetch que lanza (code ""), 5xx sin código, conexión
  // caída a mitad del commit, reinicio del servidor, desenlace desconocido.
  for (const c of [undefined, "", "08006", "08007", "57P01", "58030", "XX000", "40003", "PGRST000", "PGRST001", "502"]) {
    assert.equal(conf(c), false, String(c));
  }
  assert.equal(errorConfirmado(new Error("x")), false, "lo que no viene clasificado, no se sabe");
});

test("A1: confirmación perdida → se repite UNA vez con el mismo id_intento y hash y se recupera el resultado", async () => {
  for (const accion of [
    { tipo: "publicar" as const, titulo: { tipo: "movie" as const, tmdbId: 603 } },
    { tipo: "editar" as const, resenaId: 7, versionEsperada: 11 },
  ]) {
    const { deps, pedidos } = falsas();
    let n = 0;
    const perdida = errorRpc("f", { message: "TypeError: fetch failed", code: "" });
    const real = accion.tipo === "publicar" ? deps.publicar : deps.editar;
    const una = async (a: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      n++; const r = await (real as (a: unknown) => Promise<RespuestaBase>)(a); if (n === 1) throw perdida; return { ...r, repetido: true }; };
    if (accion.tipo === "publicar") deps.publicar = una; else deps.editar = una;
    const r = await escribirResena(deps, pedido(BIEN, { accion }));
    assert.equal(r.resultado, "publicada", accion.tipo);
    assert.equal((r as { repetido?: boolean }).repetido, true);
    assert.equal(pedidos.length, 2);
    assert.deepEqual(pedidos[0], pedidos[1], "mismos argumentos: id_intento, hash, versión esperada");
  }
});

test("A1: si el reintento tampoco confirma (o la base lo rechaza), 'sin_confirmar', nunca 'error'", async () => {
  const perdida = errorRpc("f", { message: "bad gateway" });
  const dos = falsas({ base: perdida });
  assert.equal((await escribirResena(dos.deps, pedido(BIEN))).resultado, "sin_confirmar");
  const luegoRechazo = falsas();
  let n = 0;
  luegoRechazo.deps.publicar = async () => { n++; throw n === 1 ? perdida : errorRpc("f", { message: "lock", code: "55P03" }); };
  assert.equal((await escribirResena(luegoRechazo.deps, pedido(BIEN))).resultado, "sin_confirmar");
  assert.equal(n, 2);
});

test("A1: conReconciliacion para las demás mutaciones (votar, retirar, borrar, términos)", async () => {
  let n = 0;
  const perdida = errorRpc("f", { message: "fetch failed", code: "" });
  assert.deepEqual(await conReconciliacion(async () => { n++; if (n === 1) throw perdida; return { resultado: "sin_cambios" }; }), { resultado: "sin_cambios" });
  assert.deepEqual(await conReconciliacion(async () => { throw perdida; }), { resultado: "sin_confirmar" });
  n = 0;
  await assert.rejects(conReconciliacion(async () => { n++; throw errorRpc("f", { message: "x", code: "CB001" }); }), /f: x/);
  assert.equal(n, 1, "un rechazo confirmado no se repite");
});

test("A1: HTTP y mensajes de sin_confirmar: 503, no afirma nada y conserva el intento", () => {
  assert.equal(estadoHttp({ resultado: "sin_confirmar" }), 503);
  assert.equal(estadoHttp({ resultado: "error" }), 500);
  assert.deepEqual(mensajeEscritura({ resultado: "sin_confirmar" }), { tono: "sin_confirmar", texto: MENSAJE_SIN_CONFIRMAR });
  assert.equal(mensajeVoto({ resultado: "sin_confirmar" }), MENSAJE_SIN_CONFIRMAR);
  assert.equal(conservarIntento({ resultado: "sin_confirmar" }), true);
});

test("la baja en curso (CB001) de la base se informa como tal", async () => {
  const e = errorRpc("comunidad_publicar", { message: "baja_en_curso", code: "CB001" });
  assert.equal((await escribirResena(falsas({ base: e }).deps, pedido(BIEN))).resultado, "baja_en_curso");
});

test("el hash firma acción, ids y texto normalizado: un reintento igual, el mismo; otro texto, otro", () => {
  const a = { tipo: "publicar" as const, titulo: { tipo: "movie" as const, tmdbId: 603 } };
  assert.equal(firmaPedido(a, normalizarTexto(`  ${BIEN} `)), firmaPedido(a, BIEN));
  assert.notEqual(firmaPedido(a, BIEN), firmaPedido(a, BIEN + "!"));
  assert.notEqual(firmaPedido(a, BIEN), firmaPedido({ tipo: "editar", resenaId: 1, versionEsperada: 2 }, BIEN));
});

// ============================================================================
// Mensajes y términos
// ============================================================================

test("el texto de retención es el de E1", () => {
  assert.equal(MENSAJE_RETENIDA, MOTIVO_RETENCION_RESENA);
});

test("la versión de los términos es la que la migración 014 pone en la base", () => {
  assert.match(readFileSync("supabase/migrations/014_comunidad_escritura.sql", "utf8"), new RegExp(`default '${TERMINOS_VERSION}'`));
});

test("cada motivo de cuenta que devuelve la base tiene su texto", () => {
  const sql = readFileSync("supabase/migrations/014_comunidad_escritura.sql", "utf8");
  const motivos = new Set([...sql.matchAll(/rechazo_cuenta\('([a-z_]+)'/g)].map((m) => m[1]));
  for (const m of ["modulo_apagado", "publicacion_pausada", "suspendida", "correo_pendiente", "terminos_pendientes"]) motivos.add(m);
  for (const m of motivos) assert.ok(MOTIVOS_CUENTA[m], m);
});

test("ningún mensaje afirma un resultado sin confirmar", () => {
  assert.equal(mensajeEscritura("sin-confirmar").texto, MENSAJE_SIN_CONFIRMAR);
  assert.equal(mensajeEscritura({ resultado: "algo-raro" }).tono, "sin_confirmar");
  assert.equal(mensajeEscritura({ resultado: "error" }).texto, MENSAJE_ERROR);
  // Afirmaciones: "está publicada", "Se guardó…", "no se guardó", "no se pudo guardar".
  assert.doesNotMatch(MENSAJE_SIN_CONFIRMAR, /está publicada|^se guardó|no se (pudo )?guardó|no se pudo guardar/i);
  assert.match(MENSAJE_SIN_CONFIRMAR, /^No sabemos si se guardó/);
  assert.equal(mensajeVoto("sin-confirmar"), MENSAJE_SIN_CONFIRMAR);
});

// ============================================================================
// Editor y evaluación
// ============================================================================

const P: Persistida = { resenaId: 7, versionId: 70, texto: BIEN, estado: "publicada" };

test("aviso de reinicio: sólo al cambiar un texto persistido", () => {
  assert.equal(avisoReinicio(null, BIEN), false, "reseña nueva: no hay votos");
  assert.equal(avisoReinicio(P, `  ${BIEN}  `), false, "mismo texto normalizado");
  assert.equal(avisoReinicio(P, BIEN + " Además."), true);
});

test("id_intento: el mismo envío reusa el id; otro envío, id nuevo", () => {
  let n = 0;
  const nuevo = () => `id-${++n}`;
  const t = { tipo: "movie" as const, tmdbId: 603 };
  const f1 = firmaEnvio(null, t, BIEN);
  const a = intentoPara(null, f1, nuevo);
  assert.equal(intentoPara(a, firmaEnvio(null, t, ` ${BIEN} `), nuevo), a, "reintento del mismo texto");
  assert.notEqual(intentoPara(a, firmaEnvio(null, t, BIEN + "!"), nuevo).id, a.id);
  assert.notEqual(firmaEnvio(P, t, BIEN), f1, "editar no es publicar");
  assert.equal(conservarIntento("sin-confirmar"), true);
  assert.equal(conservarIntento({ resultado: "error" }), true);
  assert.equal(conservarIntento({ resultado: "rechazo_contenido" }), true);
  assert.equal(conservarIntento({ resultado: "publicada" }), false);
  assert.equal(conservarIntento({ resultado: "retenida" }), false);
});

test("el contador avisa ANTES de enviar lo que la ruta rechazaría (emoji con ZWJ incluido) y no deja enviar", () => {
  const familia = BIEN.replace("fin de semana", "fin de semana en familia 👨‍👩‍👧");
  const c = contador(familia);
  assert.equal(c.estado, "caracteres");
  assert.match(String(c.aviso), /invisibles/);
  assert.equal(puedeEnviar(null, familia, false), false);
  assert.deepEqual(problemaFormato(normalizarTexto(familia)), { tipo: "caracteres" }, "la ruta decide lo mismo");
  // Un emoji sin ZWJ sí se puede.
  assert.equal(contador(BIEN.replace("fin de semana", "fin de semana 🎬")).estado, "ok");
});

test("puedeEnviar: largo válido, distinto del persistido y no enviando", () => {
  assert.equal(puedeEnviar(null, BIEN, false), true);
  assert.equal(puedeEnviar(null, BIEN, true), false);
  assert.equal(puedeEnviar(null, "corta", false), false);
  assert.equal(puedeEnviar(P, BIEN, false), false);
  assert.equal(puedeEnviar(P, BIEN + " Más.", false), true);
});

test("una respuesta de otra cuenta o de otra carga se descarta", () => {
  assert.equal(respuestaVigente({ gen: 2, uid: "a" }, { gen: 2, uid: "a" }), true);
  assert.equal(respuestaVigente({ gen: 3, uid: "a" }, { gen: 2, uid: "a" }), false);
  assert.equal(respuestaVigente({ gen: 2, uid: "b" }, { gen: 2, uid: "a" }), false);
  assert.equal(respuestaVigente({ gen: 2, uid: null }, { gen: 2, uid: null }), false);
});

test("evaluación: conteo explícito, botón elegido retira, la propia no se evalúa", () => {
  assert.equal(conteoUtilidad(0, 0), "Todavía nadie la evaluó.");
  assert.equal(conteoUtilidad(1, 1), "A 1 de 1 le sirvió.");
  assert.equal(conteoUtilidad(3, 5), "A 3 de 5 les sirvió.");
  assert.equal(accionVoto(null, "util"), "util");
  assert.equal(accionVoto("util", "util"), "retirar");
  assert.equal(accionVoto("util", "no_util"), "no_util");
  assert.equal(puedeEvaluar(true, true), false);
  assert.equal(puedeEvaluar(false, false), false);
  assert.equal(mensajeVoto({ resultado: "voto_registrado" }), null);
  assert.equal(mensajeVoto({ resultado: "rechazo_cuenta", motivo: "propia" }), MOTIVOS_CUENTA.propia);
});

// ============================================================================
// Página de revisión local: inerte fuera del entorno local
// ============================================================================
import { revisionLocalHabilitada } from "./revision-local.ts";

test("la página de revisión local sólo se habilita fuera de producción y con la variable local", () => {
  assert.equal(revisionLocalHabilitada({ NODE_ENV: "development", COMUNIDAD_REVISION_LOCAL: "1" }), true);
  assert.equal(revisionLocalHabilitada({ NODE_ENV: "production", COMUNIDAD_REVISION_LOCAL: "1" }), false);
  assert.equal(revisionLocalHabilitada({ NODE_ENV: "development" }), false);
  assert.equal(revisionLocalHabilitada({ NODE_ENV: "development", COMUNIDAD_REVISION_LOCAL: "true" }), false);
  const pagina = readFileSync("app/revision-local/comunidad/page.tsx", "utf8");
  assert.match(pagina, /if \(!revisionLocalHabilitada\(\)\) notFound\(\);/);
  assert.ok(!readFileSync(".env.local.example", "utf8").includes("COMUNIDAD_REVISION_LOCAL"), "no se documenta para Producción");
});

import { excluidaDeApp } from "../../scripts/build-capacitor.mjs";

test("la página de revisión local no viaja en el artefacto Android", () => {
  assert.equal(excluidaDeApp("revision-local/comunidad/page.tsx"), true);
  assert.equal(excluidaDeApp("revision-local"), true);
});
