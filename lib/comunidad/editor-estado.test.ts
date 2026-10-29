// A2 de la auditoría de E3a: una versión que llega de otra sesión mientras se
// edita no pisa el borrador ni cambia en silencio la versión esperada.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  adoptar, alCambiarPersistida, avisoReinicio, cargarRemota, claveEditor, cuerpoEnvio, empezarEdicion, firmaEnvio,
  intentoPara, mantenerBorrador, publicarComoNueva, puedeEnviar, trasGuardado, type Persistida, type Titulo,
} from "./editor-nucleo.ts";

const T: Titulo = { tipo: "movie", tmdbId: 603 };
const LARGO = " y además el final no regala nada, con un ritmo que no decae nunca en dos horas.";
const V1: Persistida = { resenaId: 7, versionId: 11, texto: `Primera versión de la reseña${LARGO}`, estado: "publicada" };
const V2: Persistida = { resenaId: 7, versionId: 12, texto: `Segunda versión, guardada en otro dispositivo${LARGO}`, estado: "publicada" };
const BORRADOR = `Mi borrador sin guardar, escrito sobre la primera${LARGO}`;

/** Editar V1 y escribir un borrador. */
const editandoV1 = () => ({ ...empezarEdicion(V1), texto: BORRADOR });

test("A2 · editando V1 con borrador llega V2 por una recarga: texto, base y versión esperada intactos; aviso con decisión", () => {
  const e = alCambiarPersistida(editandoV1(), V2);
  assert.equal(e.texto, BORRADOR, "el borrador no se pisa");
  assert.equal(e.editando, true, "la edición no se cierra");
  assert.equal(e.base, V1, "la base sigue siendo V1");
  assert.deepEqual(e.remoto, { tipo: "modificada", version: V2 });
  const c = cuerpoEnvio(e, T, "id");
  assert.deepEqual([c.accion, c.version_esperada, c.texto], ["editar", V1.versionId, BORRADOR],
    "sin decidir, el envío sale contra V1 y la base devuelve el conflicto");
  assert.equal(firmaEnvio(e.base, T, e.texto), firmaEnvio(V1, T, BORRADOR), "la firma del intento tampoco cambia");
  assert.equal(avisoReinicio(e.base, e.texto), true);
  // Otra recarga con la misma V2 no cambia nada; una V3 actualiza el aviso.
  assert.deepEqual(alCambiarPersistida(e, V2), e);
  const V3 = { ...V2, versionId: 13, texto: `Tercera${LARGO}` };
  assert.deepEqual(alCambiarPersistida(e, V3).remoto, { tipo: "modificada", version: V3 });
});

test("A2 · decisiones explícitas ante V2: cargarla descarta el borrador; mantenerlo pasa V2 a ser la base (intento nuevo)", () => {
  const e = alCambiarPersistida(editandoV1(), V2);
  const cargada = cargarRemota(V2);
  assert.deepEqual([cargada.texto, cargada.editando, cargada.base, cargada.remoto], [V2.texto, false, V2, null]);
  const mantiene = mantenerBorrador(e);
  assert.deepEqual([mantiene.texto, mantiene.editando, mantiene.base, mantiene.remoto], [BORRADOR, true, V2, null]);
  assert.equal(cuerpoEnvio(mantiene, T, "id").version_esperada, V2.versionId);
  const previo = intentoPara(null, firmaEnvio(e.base, T, e.texto), () => "a");
  assert.equal(intentoPara(previo, firmaEnvio(mantiene.base, T, mantiene.texto), () => "b").id, "b",
    "otra base es otro envío: id_intento nuevo");
  assert.equal(puedeEnviar(mantiene.base, mantiene.texto, false), true);
});

test("A2 · borrado remoto con borrador: no se vacía el texto; publicar como nueva o descartar, a elección", () => {
  const e = alCambiarPersistida(editandoV1(), null);
  assert.deepEqual([e.texto, e.editando, e.base, e.remoto], [BORRADOR, true, V1, { tipo: "borrada" }]);
  assert.equal(cuerpoEnvio(e, T, "id").accion, "editar", "sin decidir, editar lo borrado lo rechaza la base");
  const nueva = publicarComoNueva(e);
  assert.deepEqual([nueva.texto, nueva.base, nueva.remoto], [BORRADOR, null, null]);
  assert.deepEqual(cuerpoEnvio(nueva, T, "id"), { accion: "publicar", tipo: "movie", tmdb_id: 603, texto: BORRADOR, id_intento: "id" });
  const descartado = cargarRemota(null);
  assert.deepEqual([descartado.texto, descartado.base, descartado.editando], ["", null, true]);
});

test("A2 · reseña nueva en borrador y otra sesión publica una del mismo título: aviso, el borrador queda", () => {
  const e = alCambiarPersistida({ ...adoptar(null), texto: BORRADOR }, V2);
  assert.deepEqual([e.texto, e.base, e.remoto], [BORRADOR, null, { tipo: "modificada", version: V2 }]);
  assert.equal(cuerpoEnvio(e, T, "id").accion, "publicar", "sin decidir, la base responde 'resena_existente'");
});

test("A2 · el guardado propio confirmado SÍ actualiza el editor (sin aviso), llegue antes o después la recarga", () => {
  // La respuesta llega primero: se cierra la edición; la recarga trae V2 y se toma.
  const tras = trasGuardado(editandoV1(), 12, V1);
  assert.deepEqual([tras.editando, tras.remoto], [false, null]);
  const luego = alCambiarPersistida(tras, { ...V2, texto: BORRADOR });
  assert.deepEqual([luego.base?.versionId, luego.texto, luego.editando, luego.remoto], [12, BORRADOR, false, null]);
  // La recarga (por un voto en vuelo) llega ANTES que la respuesta: es el propio
  // texto, no hay nada que conservar ni que avisar.
  const propia = { ...V2, texto: BORRADOR };
  const antes = alCambiarPersistida(editandoV1(), propia);
  assert.deepEqual([antes.base, antes.editando, antes.remoto], [propia, false, null]);
  assert.deepEqual(trasGuardado(antes, 12, propia), adoptar(propia));
  // Tras la confirmación con la recarga ya hecha.
  assert.deepEqual(trasGuardado(editandoV1(), 12, propia), adoptar(propia));
});

test("A2 · sin borrador no hay nada que conservar: la versión nueva (o el borrado) se toma", () => {
  assert.deepEqual(alCambiarPersistida(empezarEdicion(V1), V2), adoptar(V2));
  assert.deepEqual(alCambiarPersistida(empezarEdicion(V1), null), adoptar(null));
  assert.deepEqual(alCambiarPersistida(adoptar(V1), V2), adoptar(V2), "sin edición abierta, siempre se toma");
  assert.deepEqual(alCambiarPersistida(adoptar(null), V2), adoptar(V2), "formulario nuevo vacío");
});

test("A2 · cuenta y título: otra clave monta otro editor, sin borrador ni intento del anterior", () => {
  const a = "00000000-0000-4000-8000-00000000000a", b = "00000000-0000-4000-8000-00000000000b";
  const claves = new Set([claveEditor(a, T), claveEditor(b, T), claveEditor(a, { tipo: "movie", tmdbId: 604 }), claveEditor(a, { tipo: "tv", tmdbId: 603 })]);
  assert.equal(claves.size, 4);
  const resenas = readFileSync("components/comunidad/ResenasComunidad.tsx", "utf8");
  assert.match(resenas, /key=\{claveEditor\(uid, titulo\)\}/, "el editor se monta por cuenta y título");
  assert.doesNotMatch(resenas, /key="editor"/);
  const editor = readFileSync("components/comunidad/EditorResena.tsx", "utf8");
  assert.match(editor, /useRef<Intento \| null>\(null\)/, "el intento vive en el editor y nace vacío");
  assert.match(editor, /useState<EstadoEditor>\(\(\) => adoptar\(mia\)\)/, "el estado nace de la versión de ESTA cuenta y título");
  // E5a: la ficha y la revisión local montan la sección por título, y la sección monta lo comunitario por cuenta y título.
  assert.match(readFileSync("components/DetailView.tsx", "utf8"), /<ResenasAcordeon key=\{`\$\{t\.type\}:\$\{t\.id\}`\}/);
  assert.match(readFileSync("app/revision-local/comunidad/page.tsx", "utf8"), /<ResenasAcordeon key=\{`\$\{tipo\}:\$\{id\}`\}/);
  assert.match(readFileSync("components/ResenasAcordeon.tsx", "utf8"), /<ResenasComunidad key=\{claveEditor\(uid, titulo\)\}/);
  // Una recarga que falla no vacía los datos (desmontaría el editor y su borrador).
  assert.doesNotMatch(resenas, /setError\(true\); setDatos\(null\)|setError\(true\); setCab\(null\)/);
  assert.match(resenas, /if \(!t \|\| !j\) \{ setError\(true\); return; \}/, "el fallo sólo marca el error");
});

test("A2 · el componente no decide por su cuenta: el envío usa la base del estado, no la prop", () => {
  const editor = readFileSync("components/comunidad/EditorResena.tsx", "utf8");
  assert.match(editor, /enviar\(cuerpoEnvio\(e, titulo, it\.id\)\)/);
  assert.doesNotMatch(editor, /version_esperada: mia/);
  assert.match(editor, /alCambiarPersistida\(x, miaActual\.current\)/);
});
