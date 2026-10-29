// Mecanismos del contrato de moderación v1 (catálogo v3.2) que no cubre el
// generador: prioridad única, exclusiones que no eximen, enmiendas de 5982374,
// variante sin IANA, plegado compatible y controles narrativos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarNombre, evaluarResena } from "./decision.ts";
import { familiasDisparadas } from "./familias.ts";
import { plegar } from "./plegado.ts";
import { REGLAS_NOMBRE, REGLAS_RESENA } from "./reglas.ts";

const PREFIJO = "La película tiene buenos actores y una historia que mantiene el interés hasta el final. ";
const r = (t: string) => evaluarResena(PREFIJO + t, { textosRecientes: [] });

test("tabla regla → familia: toda regla del módulo está clasificada", () => {
  const ids = [...REGLAS_RESENA, ...REGLAS_NOMBRE].map((x) => x.id);
  assert.doesNotThrow(() => familiasDisparadas(ids));
});

test("prioridad única: contacto + amenaza se rechaza, y la familia H igual se registra", () => {
  const d = r("Te voy a matar, llamame al 1144556677 si te animás.");
  assert.equal(d.resultado, "rechazo_contenido");
  const f = familiasDisparadas(d.disparadas.map((x) => x.regla));
  assert.ok(f.has("F1") && f.has("H1"));
});

test("una exclusión no exime: instrucción excluida (E1) + teléfono completo se rechaza", () => {
  assert.equal(r("Sumale 52 al final de la fecha que te dije, o llamame directo al 1144556677.").resultado, "rechazo_contenido");
  // E7 (amenaza velada) + amenaza explícita en el mismo texto: se retiene por H1.
  assert.equal(r("Ya sé a qué hora sacás al perro. Te voy a matar.").resultado, "retener");
});

test("enmienda 1: F3-3 conserva las rutas de un carácter y las que empiezan con signo", () => {
  for (const ruta of ["x", "_", "-d", "?a", "#", "%2"]) {
    assert.equal(r(`Mirala en ejemplo.xy/${ruta} sin cortes.`).resultado, "rechazo_contenido", ruta);
  }
});

test("enmienda 2: 'fíjense en mi nombre favorito de la saga' se retiene (falso positivo conocido, cuenta en C4)", () => {
  assert.equal(r("Fíjense en mi nombre favorito de la saga: es el del villano.").resultado, "retener");
  assert.equal(r("Fíjense en el nombre del personaje, es un guiño a la saga.").resultado, "publicar");
  assert.equal(r("Miren el perfil del villano: está muy bien escrito.").resultado, "publicar");
});

test("variante sin IANA: sin ruta sólo T-fuerte; con ruta, cualquier terminación (menor cobertura registrada)", () => {
  assert.equal(r("Mirala en verpelis.photography sin cortes.").resultado, "publicar");
  assert.equal(r("Mirala en verpelis.photography/ver sin cortes.").resultado, "rechazo_contenido");
  assert.equal(r("Mirala en verpelis . photography / ver sin cortes.").resultado, "rechazo_contenido");
  assert.equal(r("Mirala en verpelis,photography/ver sin cortes.").resultado, "publicar");
  assert.equal(r("Mirala en verpelis,com/ver sin cortes.").resultado, "rechazo_contenido");
});

test("plegado compatible: UTS #39 no transforma ASCII ('m' no pasa a 'rn') y las coincidencias normales siguen", () => {
  const p = plegar("Mirá el documental, como siempre, en mi casa.");
  assert.match(p.letras, /como siempre/);
  assert.match(p.letras, /documental/);
  assert.equal(plegar("verpelis.сом").letras.endsWith(".com"), true);
  assert.equal(plegar("Llamame al 1️⃣1️⃣ 4️⃣4️⃣").digitos, "llamame al 1 1 4 4");
});

test("intención: la tercera persona y el pretérito no son intención; el voseo de -ar sin tilde tampoco", () => {
  for (const t of [
    "La protagonista busca a su hermana en TikTok y la encuentra.",
    "Escribí esta reseña después de verla en Instagram dos veces.",
    "Él manda mensajes por WhatsApp a todo el pueblo, muy gracioso.",
  ]) assert.equal(r(t).resultado, "publicar", t);
  assert.equal(r("Mandá un mensaje por WhatsApp al 11 y te paso la lista.").resultado !== "publicar", true);
});

test("H1: lo/le + daño exige destinatario; con 'van a' sólo 'te'; las expresiones excluidas no disparan", () => {
  assert.equal(r("Le voy a reventar la cabeza a ese actor si lo cruzo.").resultado, "retener");
  assert.equal(r("Lo voy a matar de risa con este chiste a mi hermano.").resultado, "publicar");
  assert.equal(r("Te van a matar si te ven con esa remera.").resultado, "retener");
  assert.equal(r("Lo van a matar en la tercera temporada, se veía venir.").resultado, "publicar");
  assert.equal(r("La protagonista la rompe y me mató de risa.").resultado, "publicar");
});

test("A3 de bbb8fc7: una expresión excluida cercana NO anula una amenaza (ambos órdenes, puntuación y saltos)", () => {
  for (const t of [
    "Te voy a pegar un tiro. La rompe esta peli.",
    "La rompe esta peli. Te voy a pegar un tiro.",
    "Te voy a pegar un tiro, la rompe esta peli.",
    "Te voy a pegar un tiro\nLa rompe esta peli.",
    "La rompe esta peli\nte voy a pegar un tiro.",
    "Me mató de risa. Vos, te voy a reventar si te cruzo.",
    "Le voy a reventar la cara a ese actor; la vamos a pasar bomba igual.",
  ]) assert.equal(r(t).resultado, "retener", JSON.stringify(t));
  // La excepción sigue valiendo para el uso idiomático del propio fragmento.
  for (const t of [
    "Lo voy a matar de risa con este chiste a mi hermano.",
    "Voy a matar el tiempo con otra peli, a esta la rompe.",
    "Me mató de risa, la protagonista la rompe.",
    "La vamos a pasar bomba viendo esta comedia con amigos.",
  ]) assert.equal(r(t).resultado, "publicar", JSON.stringify(t));
});

test("A5 de bbb8fc7: el salto de línea es fin de oración (H2 no une; S1–S3 admiten la contigua)", () => {
  assert.equal(r("El documental muestra inmigrantes. La plaga del cultivo explica el conflicto.").resultado, "publicar");
  assert.equal(r("El documental muestra inmigrantes\nLa plaga del cultivo explica el conflicto.").resultado, "publicar");
  assert.equal(r("Llegan inmigrantes al pueblo\nuna plaga de langostas arruina la cosecha.").resultado, "publicar");
  assert.equal(r("Llegan inmigrantes al pueblo y una plaga de langostas arruina la cosecha.").resultado, "retener");
  assert.equal(r("Los inmigrantes son una plaga y la serie lo muestra.").resultado, "retener");
  // Señales que admiten la oración contigua: siguen funcionando a través de un salto.
  assert.equal(r("Mi celular es el de siempre\nescribime cuando quieras.").resultado, "retener");
  assert.equal(r("Fíjense en mi nombre de acá\nlos espero.").resultado, "retener");
  // Pero no más allá de la contigua.
  assert.equal(r("Mi celular es el de siempre\nLa peli es larga.\nEscribime qué opinan del final.").resultado, "publicar");
  // Un teléfono partido en dos líneas se sigue detectando (cobertura vigente).
  assert.equal(r("Llamame al 11 4455\n6677 para comentar.").resultado, "rechazo_contenido");
});

test("H2: grupo + deshumanización en la MISMA oración; en oraciones distintas no (límite del contrato)", () => {
  assert.equal(r("Los bolivianos son una plaga y vienen a ensuciar.").resultado, "retener");
  assert.equal(r("Pusieron bolivianos en todos lados. Son una plaga.").resultado, "publicar");
  assert.equal(r("La película retrata el racismo contra los bolivianos con cuidado.").resultado, "publicar");
  assert.equal(evaluarNombre("FueraBolitas").resultado, "retener");
  assert.equal(evaluarNombre("MuerteALosPutos").resultado, "retener");
  assert.equal(evaluarNombre("Ana del Sur").resultado, "publicar");
});

test("H3: domicilio con persona y localizador; la dirección de una ficción sin localizador publica", () => {
  assert.equal(r("A Héctor Salvatierra lo encuentran en Diagonal Supuesta 515 todas las tardes.").resultado, "retener");
  assert.equal(r("En la película, Freddy Krueger ataca en la calle Elm 1428 de noche.").resultado, "publicar");
  assert.equal(r("El que la critica es Tomás Abregú, 31.987.654, por si lo buscan.").resultado, "retener");
  assert.equal(r("Recaudó 12.345.678 dólares, según Box Office Mojo.").resultado, "publicar");
});
