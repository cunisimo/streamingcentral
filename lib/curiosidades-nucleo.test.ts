// «¿Sabías que…?»: reglas puras + blindaje estructural de la ficha, las rutas y
// la migración. La prueba contra la base real es scripts/sabias-que/pruebas-local.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  LIMITES, accionesDisponibles, filaAAdmin, mismosCampos, normalizarCampos, normalizarTexto,
  fuenteDe, patronBusqueda, posterValido, publicasDeFilas, textoDeFuente, publicasDeRespuesta, sinGuardar, urlFuenteValida,
  validarBorrador, validarPublicacion,
  type CamposCuriosidad, type CuriosidadAdmin, type FilaCuriosidad,
} from "./curiosidades-nucleo.ts";
import { URLS } from "./curiosidades-urls-prueba.ts";

const raiz = path.resolve(import.meta.dirname, "..");
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8").replace(/\r/g, "");

const OK: CamposCuriosidad = {
  texto: "[PRUEBA] Texto de una curiosidad.", fuenteNombre: "Fuente de prueba",
  fuenteUrl: "https://es.wikipedia.org/wiki/Prueba", spoiler: false,
};


test("URL de la fuente: sólo http/https con host público y sin credenciales", () => {
  for (const [u, esperado] of URLS) assert.equal(urlFuenteValida(u), esperado, u);
  assert.equal(urlFuenteValida(`https://example.com/${"a".repeat(LIMITES.fuenteUrl)}`), false, "tope de largo");
});

test("texto plano: controles fuera, saltos unificados, sin HTML interpretado", () => {
  assert.equal(normalizarTexto("  hola\r\nmundo\u0007\n\n\n\nchau  "), "hola\nmundo\n\nchau");
  assert.equal(normalizarTexto("<b>negrita</b>"), "<b>negrita</b>", "se guarda tal cual; React lo escapa");
  assert.equal(normalizarTexto(42), "");
  const c = normalizarCampos({ texto: " x ", fuenteNombre: " Wiki\npedia ", fuenteUrl: " https://a.b ", spoiler: "true" });
  assert.deepEqual(c, { texto: "x", fuenteNombre: "Wiki pedia", fuenteUrl: "https://a.b", spoiler: false },
    "spoiler sólo con true booleano");
});

test("borrador incompleto se puede guardar; publicar exige SÓLO el texto (fuente opcional) y una URL válida si viene", () => {
  const vacio = { texto: "", fuenteNombre: "", fuenteUrl: "", spoiler: false };
  assert.deepEqual(validarBorrador(vacio), {});
  assert.deepEqual(validarPublicacion(vacio), { texto: "Escribí la curiosidad." }, "sin fuente no hay error de fuente");
  assert.deepEqual(validarPublicacion({ ...OK, fuenteNombre: "", fuenteUrl: "" }), {}, "sin fuente se publica");
  assert.deepEqual(validarPublicacion({ ...OK, fuenteUrl: "" }), {}, "sólo nombre");
  assert.deepEqual(validarPublicacion({ ...OK, fuenteNombre: "" }), {}, "sólo URL");
  assert.match(validarPublicacion({ ...OK, fuenteUrl: "javascript:alert(1)" }).fuenteUrl ?? "", /http/);
  assert.match(validarPublicacion({ ...OK, fuenteNombre: "", fuenteUrl: "data:text/html,x" }).fuenteUrl ?? "", /http/,
    "la URL se valida también sin nombre");
  assert.deepEqual(validarPublicacion(OK), {});
  assert.ok(validarBorrador({ ...OK, texto: "x".repeat(LIMITES.texto + 1) }).texto, "el tope rige también en borrador");
});

const fila = (p: Partial<FilaCuriosidad>): CuriosidadAdmin => filaAAdmin({
  id: "00000000-0000-4000-8000-000000000001", tipo: "movie", tmdb_id: 105, titulo: "[PRUEBA]",
  anio: 1985, poster: null, texto: OK.texto, fuente_nombre: OK.fuenteNombre, fuente_url: OK.fuenteUrl,
  spoiler: false, pub_texto: null, pub_fuente_nombre: null, pub_fuente_url: null, pub_spoiler: null,
  publicada: false, publicada_en: null, estado: "borrador", updated_at: "2026-11-19T12:00:00Z", ...p,
});
const publicadaIgual = { pub_texto: OK.texto, pub_fuente_nombre: OK.fuenteNombre, pub_fuente_url: OK.fuenteUrl, pub_spoiler: false, publicada: true, estado: "publicada" };

test("botones según el estado: nueva/borrador/retirada, publicada, publicada con cambios", () => {
  assert.deepEqual(accionesDisponibles(null, OK), ["guardar", "publicar"]);
  assert.deepEqual(accionesDisponibles(fila({}), OK), ["guardar", "publicar"]);
  assert.deepEqual(accionesDisponibles(fila({ ...publicadaIgual, publicada: false, estado: "retirada" }), OK), ["guardar", "publicar"]);
  assert.deepEqual(accionesDisponibles(fila(publicadaIgual), OK), ["guardar", "retirar"]);
  assert.deepEqual(accionesDisponibles(fila(publicadaIgual), { ...OK, texto: "otro" }), ["guardar", "guardar-publicar", "retirar"]);
  // Borrador guardado distinto de lo publicado, aunque en pantalla no haya nada nuevo.
  const conCambios = fila({ ...publicadaIgual, texto: "editado", estado: "cambios" });
  assert.deepEqual(accionesDisponibles(conCambios, conCambios.borrador), ["guardar", "guardar-publicar", "retirar"]);
});

test("cambios sin guardar", () => {
  assert.equal(sinGuardar(null, { texto: "", fuenteNombre: "", fuenteUrl: "", spoiler: false }), false);
  assert.equal(sinGuardar(null, { ...OK }), true);
  assert.equal(sinGuardar(fila({}), OK), false);
  assert.equal(sinGuardar(fila({}), { ...OK, spoiler: true }), true);
  assert.equal(mismosCampos(null, null), true);
});

test("lectura pública: fuente opcional; sin texto se descarta y una URL insegura nunca llega a un href", () => {
  const filas = [
    { texto: "Buena", fuente_nombre: "F", fuente_url: "https://a.b/c", spoiler: true },
    { texto: "URL mala", fuente_nombre: "F", fuente_url: "javascript:alert(1)", spoiler: false },
    { texto: "URL mala sin nombre", fuente_nombre: "", fuente_url: "javascript:alert(1)", spoiler: false },
    { texto: "Sin fuente", fuente_nombre: "", fuente_url: "", spoiler: false },
    { texto: "Sólo nombre", fuente_nombre: "Libro X", fuente_url: "", spoiler: false },
    { texto: "Sólo URL", fuente_nombre: "", fuente_url: "https://www.example.com/a", spoiler: false },
    { texto: "  ", fuente_nombre: "F", fuente_url: "https://a.b", spoiler: false },
  ];
  assert.deepEqual(publicasDeFilas(filas), [
    { texto: "Buena", spoiler: true, fuente: { nombre: "F", url: "https://a.b/c" } },
    { texto: "URL mala", spoiler: false, fuente: { nombre: "F", url: null } },
    { texto: "URL mala sin nombre", spoiler: false, fuente: null },
    { texto: "Sin fuente", spoiler: false, fuente: null },
    { texto: "Sólo nombre", spoiler: false, fuente: { nombre: "Libro X", url: null } },
    { texto: "Sólo URL", spoiler: false, fuente: { nombre: "", url: "https://www.example.com/a" } },
  ]);
  assert.equal(textoDeFuente({ nombre: "", url: "https://www.example.com/a" }), "example.com", "sin nombre, el dominio");
  assert.equal(textoDeFuente({ nombre: "Libro X", url: null }), "Libro X");
  assert.equal(fuenteDe("  ", ""), null);
  assert.equal(urlFuenteValida(""), false, "'' no es una URL: es «sin URL»");
  assert.deepEqual(publicasDeRespuesta({ curiosidades: [{ texto: "T", spoiler: false, fuente: null }] }),
    [{ texto: "T", spoiler: false, fuente: null }]);
  assert.deepEqual(publicasDeFilas(null), []);
  assert.deepEqual(publicasDeRespuesta({ curiosidades: [{ texto: "T", spoiler: false, fuente: { nombre: "N", url: "https://x.y" } }] }),
    [{ texto: "T", spoiler: false, fuente: { nombre: "N", url: "https://x.y" } }]);
  assert.deepEqual(publicasDeRespuesta({ curiosidades: "x" }), []);
  assert.deepEqual(publicasDeRespuesta(null), []);
});

test("póster y búsqueda: sólo imágenes de TMDB; la búsqueda no deja comodines del usuario", () => {
  assert.equal(posterValido("https://image.tmdb.org/t/p/w342/abc.jpg"), "https://image.tmdb.org/t/p/w342/abc.jpg");
  assert.equal(posterValido("https://evil.com/t/p/w342/abc.jpg"), null);
  assert.equal(posterValido("javascript:x"), null);
  assert.equal(patronBusqueda("  50%_off,(x) "), "%50 off x%");
  assert.equal(patronBusqueda("   "), null);
});

// --- Blindaje estructural ------------------------------------------------------

test("ficha: la sección va DEBAJO de las reseñas, con key por título, y no está en /api/title", () => {
  const f = leer("components/DetailView.tsx");
  const resenas = f.indexOf("<ResenasAcordeon"), sq = f.indexOf("<SabiasQue ");
  assert.ok(resenas > 0 && sq > resenas, "SabiasQue después de ResenasAcordeon");
  assert.match(f.slice(sq, sq + 120), /key=\{`sq:\$\{t\.type\}:\$\{t\.id\}`\}/);
  assert.doesNotMatch(leer("app/api/title/[tipo]/[id]/route.ts") + leer("lib/enrich.ts"), /curiosidad/i,
    "la curiosidad no se suma a la ficha principal: no la demora");
});

test("componente: pide con apiUrl (web y contenedor), descarta respuestas viejas y no dibuja nada sin dato", () => {
  const c = leer("components/SabiasQue.tsx");
  assert.match(c, /apiUrl\(`\/api\/curiosidad\/\$\{tipo\}\/\$\{tmdbId\}`\)/);
  assert.match(c, /return \(\) => \{ vivo = false; ctrl\.abort\(\); \};/);
  assert.match(c, /if \(!items\.length\) return null;/);
  const t = leer("components/SabiasQueTarjeta.tsx");
  assert.match(t, /aria-expanded=\{revelada\}/);
  assert.match(t, /\{revelada && \(/, "con spoiler, el texto no se renderiza hasta revelarlo");
  assert.match(t, /rel="noopener noreferrer nofollow"/);
  assert.match(t, /\{fuente\.url && urlFuenteValida\(fuente\.url\)\s*\? <a href=\{fuente\.url\}/,
    "el enlace sólo existe con una URL válida (la vista previa dibuja lo que se tipea)");
  assert.match(t, /\{fuente && etiqueta && \(\s*<p className="sq-fuente">/,
    "sin fuente no se dibuja el apartado (ni rótulo ni hueco)");
  assert.doesNotMatch(t, /["'>]\s*Sin fuente/i, "ningún rótulo «Sin fuente» visible");
  const adm = leer("components/admin/sabias-que/SabiasQueAdmin.tsx");
  assert.equal((adm.match(/fuente: fuenteDe\(/g) ?? []).length, 2,
    "las dos vistas previas del panel arman la fuente con la misma regla que la ficha");
  assert.doesNotMatch(t, /dangerouslySetInnerHTML/);
});

test("rutas: la pública integra CORS y no cachea; la del panel exige admin+MFA y escribe bajo RLS", () => {
  const pub = leer("app/api/curiosidad/[tipo]/[id]/route.ts");
  assert.match(pub, /export const GET = conCors\(manejar, "GET"\);/);
  assert.match(pub, /"Cache-Control": "no-store"/);
  const adm = leer("app/api/admin/curiosidades/route.ts");
  assert.match(adm, /adminDeToken\(tokenDeHeader/);
  assert.match(adm, /supabaseComoUsuario\(r\.token\)/);
  const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
  assert.doesNotMatch(sinComentarios(adm + leer("lib/curiosidades.ts") + pub), /SERVICE_ROLE|service_role|redis|upstash|cached\(/i);
  assert.match(leer("lib/curiosidades.ts"), /rpc\("curiosidad_publicada"/);
});

test("migración 025: RLS con is_admin_mfa, anon sin tabla, lectura pública sólo por la función", () => {
  const m = leer("supabase/migrations/025_sabias_que.sql");
  assert.match(m, /enable row level security/);
  assert.match(m, /revoke all on curiosidades from anon, authenticated;/);
  assert.match(m, /grant select, insert, update on curiosidades to authenticated;/);
  assert.equal((m.match(/is_admin_mfa\(\)/g) ?? []).length >= 4, true);
  assert.match(m, /security definer set search_path = public;/);
  assert.match(m, /where c\.tipo = p_tipo and c\.tmdb_id = p_tmdb_id and c\.publicada/);
  assert.match(m, /constraint curiosidades_titulo_unico unique \(tipo, tmdb_id\)/);
  assert.match(leer("scripts/sala/db-local.mjs"), /025_sabias_que\.sql/);
  assert.ok(fs.existsSync(path.join(raiz, "supabase/migrations/025_sabias_que_down.sql")));
});
