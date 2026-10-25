// E3b: núcleos puros de duplicados, denuncias, bloqueos y "Pedir revisión"
// (sin base ni red). Lo que sólo la base puede probar (locks, topes bajo
// concurrencia, permisos) está en scripts/comunidad/pruebas-moderacion.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PREFIJO_SECRETO_LOCAL, huella, jaccard, palabras, secretoDuplicados } from "./duplicados.ts";
import { CATEGORIAS, COMENTARIO_MAX, comentarioDenuncia, esCategoria, etiquetaBloqueo, mensajeBloqueo, mensajeDenuncia, ofreceReintento } from "./menu-nucleo.ts";
import { denunciarVersion, estadoHttpMenu, type DependenciasDenuncia } from "./moderacion-nucleo.ts";
import { escribirResena, firmaPedido, type DependenciasEscritura } from "./escritura-nucleo.ts";
import { evaluarResena } from "./reglas/decision.ts";
import { cuerpoRevision, firmaRevision, guardoVersion, ofreceRevision, conservarIntento, type EstadoEditor } from "./editor-nucleo.ts";
import { MOTIVOS_CUENTA, mensajeEscritura } from "./mensajes.ts";

const SECRETO = "prueba-unitaria-".padEnd(40, "x");
const UID = "00000000-0000-4000-8000-000000000001";
const INTENTO = "00000000-0000-4000-8000-0000000000aa";
const BIEN = "La vi el fin de semana y me sorprendió para bien: buen ritmo, actuaciones creíbles y un final que no regala nada.";
const TELEFONO = "La vi el fin de semana y me encantó. Si querés hablar de la peli llamame al 11 5566 7788 y lo charlamos tranquilos.";

// ============================================================================
// Duplicados
// ============================================================================
test("huella: determinística, sólo hex (64 y 16), sin palabras del texto; otro secreto, otra huella", () => {
  const h = huella(BIEN, SECRETO);
  assert.deepEqual(huella(BIEN, SECRETO), h);
  assert.match(h.texto, /^[0-9a-f]{64}$/);
  assert.ok(h.shingles.length > 10 && h.shingles.every((s) => /^[0-9a-f]{16}$/.test(s)));
  assert.equal(new Set(h.shingles).size, h.shingles.length, "sin repetidos");
  const volcado = JSON.stringify(h);
  for (const w of palabras(BIEN).filter((w) => w.length >= 4)) assert.ok(!volcado.includes(w), w);
  assert.notEqual(huella(BIEN, "otro-secreto-".padEnd(40, "y")).texto, h.texto);
});

test("huella: se calcula sobre el texto plegado (mayúsculas, tildes y puntuación no la cambian)", () => {
  assert.deepEqual(huella(BIEN.toUpperCase(), SECRETO), huella(BIEN, SECRETO));
  assert.deepEqual(huella(BIEN.normalize("NFD"), SECRETO), huella(BIEN, SECRETO));
  assert.deepEqual(huella(BIEN.replace(/[,:.]/g, " ; "), SECRETO), huella(BIEN, SECRETO));
});

test("jaccard: una palabra cambiada en un texto largo queda ≥ 0,8; dos reseñas distintas, muy por debajo", () => {
  const largo = "La fotografía es preciosa y cada plano parece pensado con cuidado. El guion se toma su tiempo pero nunca aburre. Las actuaciones sostienen la historia incluso en los momentos flojos. La música acompaña sin subrayar lo que ya se ve. Así la recuerdo.";
  const a = huella(largo, SECRETO).shingles;
  assert.ok(jaccard(a, huella(largo.replace("recuerdo", "vi"), SECRETO).shingles) >= 0.8);
  assert.ok(jaccard(a, huella(BIEN, SECRETO).shingles) < 0.1);
  assert.equal(jaccard([], []), 0);
});

test("secreto: falta o es corto → null; el de prueba local se rechaza en producción", () => {
  assert.equal(secretoDuplicados({}), null);
  assert.equal(secretoDuplicados({ COMUNIDAD_HMAC_DUPLICADOS: "corto" }), null);
  const local = `${PREFIJO_SECRETO_LOCAL}${"a".repeat(40)}`;
  assert.equal(secretoDuplicados({ COMUNIDAD_HMAC_DUPLICADOS: local, NODE_ENV: "development" }), local);
  assert.equal(secretoDuplicados({ COMUNIDAD_HMAC_DUPLICADOS: local, NODE_ENV: "production" }), null);
  assert.equal(secretoDuplicados({ COMUNIDAD_HMAC_DUPLICADOS: "z".repeat(40), NODE_ENV: "production" }), "z".repeat(40));
  assert.throws(() => huella(BIEN, ""));
});

test("el secreto local no está en el repo: .env.comunidad-local está ignorado y ningún archivo versionado lo define", () => {
  const ignorados = readFileSync(".gitignore", "utf8");
  assert.match(ignorados, /\.env\*|\.env\.comunidad-local|\.env\.\*/);
  for (const f of ["lib/comunidad/duplicados.ts", "scripts/comunidad/pruebas-moderacion.mjs"]) {
    assert.ok(!/COMUNIDAD_HMAC_DUPLICADOS\s*=\s*\S/.test(readFileSync(f, "utf8")), f);
  }
});

// ============================================================================
// Escritura con huella y "Pedir revisión"
// ============================================================================
function falsas(o: { base?: Record<string, unknown>; huellaFalla?: boolean } = {}) {
  const pedidos: { decision: Record<string, unknown>; hash: string }[] = [];
  const deps: DependenciasEscritura = {
    textosRecientes: async () => [],
    evaluar: (t, c) => evaluarResena(t, c),
    hash: (s) => s,
    huella: (t) => { if (o.huellaFalla) throw new Error("sin secreto"); return huella(t, SECRETO); },
    publicar: async (a) => { pedidos.push(a as never); return (o.base ?? { resultado: "x" }) as never; },
    editar: async (a) => { pedidos.push(a as never); return (o.base ?? { resultado: "x" }) as never; },
  };
  return { deps, pedidos };
}
const publicarP = (texto: string, extra = {}) => ({
  uid: UID, idIntento: INTENTO, texto, accion: { tipo: "publicar" as const, titulo: { tipo: "movie" as const, tmdbId: 1 } }, ...extra,
});
const editarP = (texto: string, extra = {}) => ({
  uid: UID, idIntento: INTENTO, texto, accion: { tipo: "editar" as const, resenaId: 1, versionEsperada: 2 }, ...extra,
});

test("revisión: sólo con rechazo por contenido va como revisión; con un texto que ya pasa, es un envío normal", async () => {
  const a = falsas();
  await escribirResena(a.deps, publicarP(TELEFONO, { revision: true }));
  assert.deepEqual([a.pedidos[0].decision.resultado, a.pedidos[0].decision.revision], ["rechazo_contenido", true]);
  const b = falsas();
  await escribirResena(b.deps, publicarP(BIEN, { revision: true }));
  assert.deepEqual([b.pedidos[0].decision.resultado, b.pedidos[0].decision.revision], ["publicar", undefined]);
  const c = falsas();
  await escribirResena(c.deps, publicarP(TELEFONO));
  assert.equal(c.pedidos[0].decision.revision, undefined, "sin pedirla, un rechazo no se guarda");
});

test("revisión de una edición sin confirmar que la publicada deja de verse → 'requiere_confirmacion' sin tocar la base", async () => {
  const a = falsas();
  assert.equal((await escribirResena(a.deps, editarP(TELEFONO, { revision: true }))).resultado, "requiere_confirmacion");
  assert.equal(a.pedidos.length, 0);
  const b = falsas();
  await escribirResena(b.deps, editarP(TELEFONO, { revision: true, confirmarOculta: true }));
  assert.equal(b.pedidos[0].decision.revision, true);
});

test("la firma de una revisión es otra: el mismo id con y sin revisión es un conflicto, no el mismo envío", () => {
  const acc = { tipo: "publicar" as const, titulo: { tipo: "movie" as const, tmdbId: 1 } };
  assert.notEqual(firmaPedido(acc, "x", true), firmaPedido(acc, "x"));
  assert.equal(firmaPedido(acc, "x", false), firmaPedido(acc, "x"), "lo de E3a no cambia");
});

test("toda decisión lleva la huella; sin secreto la escritura es 'error' y no llega a la base", async () => {
  const a = falsas();
  await escribirResena(a.deps, publicarP(BIEN));
  assert.deepEqual(a.pedidos[0].decision.huella, huella(BIEN, SECRETO));
  const b = falsas({ huellaFalla: true });
  assert.equal((await escribirResena(b.deps, publicarP(BIEN))).resultado, "error");
  assert.equal(b.pedidos.length, 0);
  assert.equal((await escribirResena(falsas().deps, publicarP(BIEN, { revision: "si" }) as never)).resultado, "invalido");
});

test("editor: la revisión se ofrece SÓLO tras un rechazo por contenido; su intento es aparte; guarda versión", () => {
  assert.equal(ofreceRevision({ resultado: "rechazo_contenido" }), true);
  for (const r of [{ resultado: "rechazo_formato" }, { resultado: "rechazo_cuenta" }, { resultado: "retenida" }, "sin-confirmar" as const, null]) {
    assert.equal(ofreceRevision(r), false, JSON.stringify(r));
  }
  const t = { tipo: "movie" as const, tmdbId: 1 };
  assert.notEqual(firmaRevision(null, t, "x"), JSON.stringify(["publicar", "movie", 1, "x"]));
  assert.ok(guardoVersion("revision_solicitada") && !conservarIntento({ resultado: "revision_solicitada" }));
  const e: EstadoEditor = { base: { resenaId: 1, versionId: 2, texto: "a", estado: "publicada" }, texto: "b", editando: true, remoto: null };
  assert.equal(cuerpoRevision(e, t, "id", true).confirmar_oculta, true);
  assert.equal("confirmar_oculta" in cuerpoRevision({ ...e, base: null }, t, "id", true), false);
});

test("mensajes de escritura: revisión pedida, admisión cerrada (por autor y global) y confirmación pendiente", () => {
  assert.match(mensajeEscritura({ resultado: "revision_solicitada" }).texto, /revisión/);
  assert.equal(mensajeEscritura({ resultado: "rechazo_cuenta", motivo: "admision_autor" }).texto, "Tenés publicaciones en revisión; esperá a que se resuelvan.");
  assert.equal(mensajeEscritura({ resultado: "rechazo_cuenta", motivo: "admision_global" }).texto, "No podemos revisar más publicaciones ahora, probá más tarde.");
  assert.equal(mensajeEscritura({ resultado: "requiere_confirmacion" }).tono, "rechazo");
  assert.ok(MOTIVOS_CUENTA.admision_global);
});

// ============================================================================
// Menú: denuncias y bloqueos
// ============================================================================
test("categorías: las siete del diseño, iguales a las del CHECK de la base y a las de la función", () => {
  const ids = CATEGORIAS.map((c) => c.id).sort();
  assert.deepEqual(ids, ["acoso_amenazas", "datos_personales", "odio", "otro", "phishing_estafa", "sexual_explotacion", "spam"]);
  const sql = readFileSync("supabase/migrations/011_comunidad_esquema.sql", "utf8") + readFileSync("supabase/migrations/015_comunidad_moderacion_datos.sql", "utf8");
  for (const id of ids) assert.ok(sql.includes(`'${id}'`), id);
  assert.equal(esCategoria("me_cae_mal"), false);
});

test("comentario: opcional, NFC, sin controles ni bordes, hasta 300 caracteres", () => {
  assert.deepEqual(comentarioDenuncia(undefined), { ok: true, valor: null });
  assert.deepEqual(comentarioDenuncia("   "), { ok: true, valor: null });
  assert.deepEqual(comentarioDenuncia("  Publica\u0007 un DNI.  "), { ok: true, valor: "Publica un DNI." });
  assert.deepEqual(comentarioDenuncia("é"), { ok: true, valor: "é" });
  assert.equal(comentarioDenuncia("x".repeat(COMENTARIO_MAX)).ok, true);
  assert.equal(comentarioDenuncia("x".repeat(COMENTARIO_MAX + 1)).ok, false);
  assert.equal(comentarioDenuncia(5).ok, false);
});

test("mensajes de denuncia: nunca 'atendida' ni que se ocultó; la cola llena ofrece bloquear; lo incierto ofrece reintentar", () => {
  const textos = [
    mensajeDenuncia({ resultado: "denuncia_registrada" }), mensajeDenuncia({ resultado: "denuncia_registrada", repetido: true }),
    mensajeDenuncia({ resultado: "rechazo_cuenta", motivo: "cola_denuncias_llena" }), mensajeDenuncia({ resultado: "rechazo_cuenta", motivo: "limite_diario" }),
    mensajeDenuncia("sin-confirmar"), mensajeDenuncia({ resultado: "error" }),
  ];
  for (const m of textos) assert.ok(!/atendid|resuelt|eliminad|ocultamos|la sacamos/i.test(m.texto), m.texto);
  assert.match(textos[0].texto, /sigue visible/);
  assert.match(textos[2].texto, /No podemos recibir más denuncias ahora.*bloquearlo/);
  assert.equal(ofreceReintento(textos[4].tono), true);
  assert.equal(ofreceReintento(textos[2].tono), false, "un rechazo no se reintenta");
  assert.match(mensajeDenuncia({ resultado: "rechazo_cuenta", motivo: "correo_pendiente" }).texto, /bloquear/);
});

test("mensajes de bloqueo y desbloqueo; etiqueta sin datos privados", () => {
  assert.match(mensajeBloqueo({ resultado: "bloqueado" }).texto, /desbloquearlo desde tu cuenta/);
  assert.equal(mensajeBloqueo({ resultado: "rechazo_cuenta", motivo: "propio" }).texto, "No podés bloquearte.");
  assert.equal(mensajeBloqueo("sin-confirmar").tono, "sin_confirmar");
  assert.match(mensajeBloqueo({ resultado: "desbloqueado" }).texto, /volver a ver/);
  const e = etiquetaBloqueo({ origen_tipo: "tv", creado_en: "2026-10-25T18:08:00Z" });
  assert.equal(e, "Usuario bloqueado desde una reseña de una serie el 25/10/2026 a las 15:08");
  assert.equal(etiquetaBloqueo({ origen_tipo: "movie" }, "Matrix"), "Usuario bloqueado desde una reseña de «Matrix»");
});

// ============================================================================
// Núcleo de la denuncia (corroboración, bloqueo en el mismo paso)
// ============================================================================
function depsDen(o: { denuncia?: Record<string, unknown>; retenerFalla?: boolean } = {}) {
  const llamadas: string[] = [];
  const deps: DependenciasDenuncia = {
    denunciar: async () => { llamadas.push("denunciar"); return (o.denuncia ?? { resultado: "denuncia_registrada", nueva: true, texto: BIEN }) as never; },
    evaluar: (t) => { llamadas.push("reglas"); return evaluarResena(t, { textosRecientes: [] }); },
    retenerPorRegla: async (_v, d) => { llamadas.push(`retener:${d.resultado}`); if (o.retenerFalla) throw new Error("red"); return { resultado: "retenida_por_regla" }; },
    bloquear: async () => { llamadas.push("bloquear"); return { resultado: "bloqueado", bloqueo_id: 7 }; },
  };
  return { deps, llamadas };
}
const den = (extra = {}) => ({ uid: UID, versionId: 5, categoria: "spam", ...extra });

test("denuncia legítima: se corroboran las reglas y NO se retiene; la respuesta no trae el texto ni detalles", async () => {
  const { deps, llamadas } = depsDen();
  const r = await denunciarVersion(deps, den());
  assert.deepEqual(r, { resultado: "denuncia_registrada" });
  assert.deepEqual(llamadas, ["denunciar", "reglas"]);
});

test("corroboración: si las reglas vigentes retienen o rechazan el texto, se retiene POR LA REGLA; un fallo ahí no cambia la respuesta", async () => {
  for (const texto of ["Gana plata gratis con cripto: invertí hoy y duplicá tus ganancias en una semana, sorteo exclusivo para los primeros.", TELEFONO]) {
    const { deps, llamadas } = depsDen({ denuncia: { resultado: "denuncia_registrada", nueva: true, texto } });
    assert.deepEqual(await denunciarVersion(deps, den()), { resultado: "denuncia_registrada" });
    assert.match(llamadas.at(-1) ?? "", /^retener:(retener|rechazo_contenido)$/);
  }
  const f = depsDen({ denuncia: { resultado: "denuncia_registrada", nueva: true, texto: TELEFONO }, retenerFalla: true });
  assert.deepEqual(await denunciarVersion(f.deps, den()), { resultado: "denuncia_registrada" });
});

test("sin corroboración si la denuncia no es nueva (repetida, rechazada o incierta)", async () => {
  for (const d of [{ resultado: "denuncia_registrada", repetido: true }, { resultado: "rechazo_cuenta", motivo: "cola_denuncias_llena" }, { resultado: "sin_confirmar" }]) {
    const { deps, llamadas } = depsDen({ denuncia: d });
    await denunciarVersion(deps, den());
    assert.deepEqual(llamadas, ["denunciar"], JSON.stringify(d));
  }
});

test("bloquear en el mismo paso: se hace aunque la denuncia no se reciba (cola llena)", async () => {
  const { deps, llamadas } = depsDen({ denuncia: { resultado: "rechazo_cuenta", motivo: "cola_denuncias_llena" } });
  const r = await denunciarVersion(deps, den({ bloquear: true }));
  assert.deepEqual(r, { resultado: "rechazo_cuenta", motivo: "cola_denuncias_llena", bloqueo: { resultado: "bloqueado", bloqueo_id: 7 } });
  assert.deepEqual(llamadas, ["denunciar", "bloquear"]);
});

test("pedido inválido: sin categoría del diseño, versión no entera, comentario largo o bloquear no booleano → 'invalido' sin llamar a la base", async () => {
  for (const p of [den({ categoria: "nada" }), den({ versionId: "5" }), den({ comentario: "x".repeat(301) }), den({ bloquear: "si" }), den({ uid: "x" })]) {
    const { deps, llamadas } = depsDen();
    assert.deepEqual(await denunciarVersion(deps, p), { resultado: "invalido" });
    assert.deepEqual(llamadas, []);
  }
  assert.deepEqual([400, 500, 503, 200].map((s) => s), [estadoHttpMenu({ resultado: "invalido" }), estadoHttpMenu({ resultado: "error" }),
    estadoHttpMenu({ resultado: "sin_confirmar" }), estadoHttpMenu({ resultado: "denuncia_registrada" })]);
});

// ============================================================================
// Interfaz (código): accesibilidad y conexiones reales
// ============================================================================
test("menú y diálogos: nombres accesibles, foco, 44 px, portal; rutas reales; la lectura oculta a los bloqueados", () => {
  const menu = readFileSync("components/comunidad/MenuResena.tsx", "utf8");
  for (const s of ['aria-label="Opciones de la reseña"', 'aria-haspopup="menu"', "aria-expanded", 'role="menu"', 'role="menuitem"',
    'aria-modal="true"', "createPortal", '"Escape"', "ArrowDown", 'width="20" height="20"', "/api/comunidad/denuncias", "/api/comunidad/bloqueos"]) {
    assert.ok(menu.includes(s), s);
  }
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /\.cm-menu-btn\{[^}]*width:44px;height:44px/);
  assert.match(css, /\.cm-menu-item\{[^}]*min-height:44px/);
  assert.match(css, /\.cm-cat\{[^}]*min-height:44px/);
  const lista = readFileSync("components/comunidad/ResenasComunidad.tsx", "utf8");
  assert.ok(lista.includes("/api/comunidad/revision") && lista.includes("<MenuResena") && lista.includes("/cuenta/bloqueados"));
  const sql = readFileSync("supabase/migrations/015_comunidad_moderacion_datos.sql", "utf8");
  assert.match(sql, /not exists \(select 1 from comunidad\.bloqueos b\s+where b\.bloqueador_participante = v_part and b\.bloqueado_participante = r\.autor_participante\)/);
});

test("decisiones que E3b conserva: denunciar no oculta, 'No me sirvió' no modera, nada se publica por vencimiento, el pendiente de bajas sigue explícito", () => {
  const sql = readFileSync("supabase/migrations/015_comunidad_moderacion_datos.sql", "utf8");
  const denunciar = sql.slice(sql.indexOf("function public.comunidad_denunciar"), sql.indexOf("function public.comunidad_retener_por_regla"));
  assert.ok(!/update comunidad\.versiones/.test(denunciar), "denunciar no cambia el estado de una versión");
  assert.ok(!/evaluaciones/.test(sql.slice(sql.indexOf("function comunidad.cola_denuncias"))), "la cola no mira los votos");
  assert.ok(!/interval[^;]*publicada|publicada[^;]*interval/.test(sql), "nada pasa a publicada por tiempo");
  assert.match(sql, /NO RESUELVE el pendiente de las denuncias\s+RECIBIDAS/);
});
