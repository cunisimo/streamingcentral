// Reglas una por una, con sus falsos positivos más probables. Cada caso se
// evalúa con la decisión completa para ver también qué reglas se dispararon.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarNombre, evaluarResena } from "./decision.ts";
import { corridasNumericas, REGLAS_NOMBRE, REGLAS_RESENA } from "./reglas.ts";

const RELLENO = " La película está muy bien filmada y los actores sostienen cada escena con mucha naturalidad.";
const sinCtx = { textosRecientes: [] as string[] };
const resena = (t: string, ctx = sinCtx) => evaluarResena(t + RELLENO, ctx);
const reglas = (t: string, ctx = sinCtx) => resena(t, ctx).disparadas.map((d) => d.regla);

test("teléfono: 8 dígitos o más se rechazan; 6–7 sólo con una palabra de contacto cerca", () => {
  assert.equal(resena("Pasame un mensaje al 11445566.").resultado, "rechazo_contenido");
  assert.equal(resena("La vi 4455667 veces.").resultado, "publicar");
  assert.equal(resena("Tel 4455667 por cualquier cosa.").resultado, "rechazo_contenido");
});

test("teléfono: años, montos con miles y fechas no son contactos", () => {
  assert.deepEqual(corridasNumericas("de 1984 1989 y 1990").map((c) => c.texto), []);
  assert.deepEqual(corridasNumericas("recaudo 1.000.000.000 de dolares"), []);
  assert.deepEqual(corridasNumericas("estreno el 15-03-2024"), []);
  // Con "/" son tres números distintos, ninguno largo.
  assert.ok(corridasNumericas("15/03/2024").every((c) => c.digitos <= 4));
  assert.equal(resena("Es de 2001, se filmó en 1999 y llegó en 2003.").resultado, "publicar");
});

test("teléfono: un CUIT con su palabra es dato personal (retiene), no teléfono", () => {
  const d = resena("El autor tiene CUIT 20-30123456-7, búsquenlo.");
  assert.equal(d.resultado, "retener");
  assert.deepEqual(d.disparadas.map((x) => x.regla), ["datos.documento"]);
});

test("enlace: TLD fuertes siempre; débiles sólo pegados y con ruta", () => {
  assert.equal(resena("Mirala en pelis-gratis.c0m sin cuenta.").resultado, "rechazo_contenido");
  assert.equal(resena("Busquen t.me/canal para verla.").resultado, "rechazo_contenido");
  assert.equal(resena("Buenísima.Me encantó la parte del viaje.").resultado, "publicar");
  assert.equal(resena("Excelente.La recomiendo para ver con tiempo.").resultado, "publicar");
});

test("redes: mencionar una red no es contacto; red + verbo, usuario + red o 'red:' sí", () => {
  assert.equal(resena("La gente en Twitter decía que era mala.").resultado, "publicar");
  assert.equal(resena("Seguí viendo en Twitter las reacciones.").resultado, "publicar");
  assert.equal(resena("Encontrás el tráiler en TikTok de la productora.").resultado, "publicar");
  assert.equal(resena("Seguime en ig @cine_fan para más.").resultado, "rechazo_contenido");
  assert.equal(resena("Mi insta: cine.fan, nos vemos.").resultado, "rechazo_contenido");
  assert.equal(resena("Hablame por t3l3gram cuando quieras.").resultado, "rechazo_contenido");
});

test("correo: con o sin TLD si el proveedor es conocido", () => {
  assert.equal(resena("Escribime a ana@gmail sin el punto com.").resultado, "rechazo_contenido");
  assert.ok(reglas("Mandame a ana arroba hotmail punto com.").includes("contacto.email"));
});

test("spam: una sola señal no alcanza; dos sí", () => {
  assert.equal(resena("Un documental sobre bitcoin y las criptomonedas.").resultado, "publicar");
  assert.equal(resena("Los inversores apostaron contra el mercado.").resultado, "publicar");
  assert.equal(resena("Ganá dinero con bitcoin, ganancias garantizadas.").resultado, "retener");
  assert.equal(resena("Sorteo de cuentas gratis, participá compartiendo.").resultado, "retener");
});

test("odio: insultos a personajes no; grupos 'de mierda', insultos de odio y ofuscados sí", () => {
  assert.equal(resena("El villano es un hijo de puta hermoso.").resultado, "publicar");
  assert.equal(resena("Lo hicieron esos negros de mierda.").resultado, "retener");
  assert.equal(resena("Una película para m4ric0nes.").resultado, "retener");
  assert.equal(resena("Hay que echar a todos los bolivianos.").resultado, "retener");
  assert.equal(evaluarNombre("La Negra Cinéfila").resultado, "publicar");
});

test("amenazas directas retienen; contarlas en la trama también (falso positivo aceptado)", () => {
  assert.equal(resena("Sé dónde vivís y te voy a buscar.").resultado, "retener");
  assert.equal(resena("¿Cómo sabe el asesino dónde vive la protagonista?").resultado, "publicar");
});

test("datos personales: DNI y domicilio con número retienen", () => {
  assert.equal(resena("Es Ana, DNI 28.456.789.").resultado, "retener");
  assert.equal(resena("Su dirección es Sarmiento 876.").resultado, "retener");
});

test("menores: término sexual cerca de una mención de menores retiene (casos mínimos sintéticos)", () => {
  // Combinaciones mínimas, sin redacción realista, a propósito.
  assert.equal(resena("Prueba sintética: porno, nena.").resultado, "retener");
  assert.equal(resena("Prueba sintética: sexual, 12 años.").resultado, "retener");
  assert.equal(resena("Tiene escenas de sexo, no es para verla en familia.").resultado, "publicar");
  assert.equal(resena("La nena de 10 años actúa increíble.").resultado, "publicar");
});

test("texto anómalo y derivación al perfil retienen", () => {
  assert.equal(evaluarResena("LA MEJOR SERIE DE LA HISTORIA, NO PUEDO CREER QUE NO LA HAYAN VISTO, VÉANLA YA MISMO SIN DUDARLO.", sinCtx).resultado, "retener");
  assert.equal(evaluarResena("buena ".repeat(16).trim(), sinCtx).resultado, "retener");
  assert.equal(resena("Si querés el link mirá mi perfil.").resultado, "retener");
});

test("contacto partido entre reseñas retiene; números legítimos repartidos no", () => {
  const partido = { textosRecientes: ["Mi número arranca con 11 44 77, sigue en otra reseña."] };
  // Solo, este texto pasa: 4 dígitos y ninguna palabra de contacto.
  assert.equal(resena("El final es 55 66.").resultado, "publicar");
  const d = resena("El final es 55 66.", partido);
  assert.equal(d.resultado, "retener");
  assert.ok(d.disparadas.some((x) => x.regla === "contacto.partido"));
  const legitimo = { textosRecientes: ["La vi en 2019 y en 2023.", "La temporada 1 tiene 10 episodios."] };
  assert.equal(resena("La temporada 3 tiene 12 episodios.", legitimo).resultado, "publicar");
});

test("formato de reseña: largo 80–600 en puntos de código y sin controles ni bidi", () => {
  const corto = evaluarResena("a".repeat(30) + " corta", sinCtx);
  assert.equal(corto.resultado, "rechazo_formato");
  assert.match(corto.motivoUsuario, /entre 80 y 600/);
  assert.equal(evaluarResena("x ".repeat(301), sinCtx).resultado, "rechazo_formato");
  assert.equal(resena("Texto con ‮ dirección.").resultado, "rechazo_formato");
  // Los emojis cuentan como un carácter cada uno, igual que en el servidor.
  assert.equal(evaluarResena("😭".repeat(79), sinCtx).resultado, "rechazo_formato");
});

test("nombres: 2–24, sin saltos ni controles; sin las reglas de texto anómalo", () => {
  assert.equal(evaluarNombre("A").resultado, "rechazo_formato");
  assert.equal(evaluarNombre("x".repeat(25)).resultado, "rechazo_formato");
  assert.equal(evaluarNombre("Ana\nMaría").resultado, "rechazo_formato");
  assert.equal(evaluarNombre("AAAA").resultado, "publicar");
  const ids = REGLAS_NOMBRE.map((r) => r.id);
  assert.ok(!ids.some((id) => id.startsWith("anomalo.")));
  assert.ok(REGLAS_RESENA.some((r) => r.id.startsWith("anomalo.")));
});

test("nombres: 6 dígitos ya son un contacto; un año suelto no", () => {
  assert.equal(evaluarNombre("uno uno cuatro cuatro 55").resultado, "rechazo_contenido");
  assert.equal(evaluarNombre("Vale1988").resultado, "publicar");
  assert.equal(evaluarNombre("@ana_cine").resultado, "rechazo_contenido");
  assert.equal(evaluarNombre("ig ana").resultado, "rechazo_contenido");
});
