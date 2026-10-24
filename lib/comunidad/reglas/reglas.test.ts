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

test("teléfono: años, montos con miles y fechas quedan marcados como excepción", () => {
  assert.deepEqual(corridasNumericas("de 1984 1989 y 1990").map((c) => c.excepcion), ["anio", "anio"]);
  assert.deepEqual(corridasNumericas("recaudo 1.000.000.000 de dolares").map((c) => c.excepcion), ["miles"]);
  assert.deepEqual(corridasNumericas("estreno el 15-03-2024").map((c) => c.excepcion), ["fecha"]);
  // Contrato v1: "/" es separador (S); una fecha con barras es UNA corrida con excepción "fecha".
  assert.deepEqual(corridasNumericas("15/03/2024").map((c) => c.excepcion), ["fecha"]);
  assert.deepEqual(corridasNumericas("8/10 9/10 7.5/10").map((c) => c.excepcion), ["puntaje"]);
  assert.equal(resena("Es de 2001, se filmó en 1999 y llegó en 2003.").resultado, "publicar");
  assert.equal(resena("Recaudó 1.155.512.345 dólares en todo el mundo.").resultado, "publicar");
  assert.equal(resena("Las fechas clave de la saga son 1985 2026 y 2030.").resultado, "publicar");
  // Contrato v1 (F1): un importe con un medio de §6.M en el ámbito cuenta como
  // teléfono, y "número" es un medio. Este texto legítimo se RECHAZA: falso
  // positivo del contrato aplicado literalmente (cuenta en C3). Ver el informe.
  assert.equal(resena("El número de entradas vendidas fue 1.200.000 en una semana.").resultado, "rechazo_contenido");
});

test("teléfono v2 (A1): una señal fuerte de contacto anula la excepción", () => {
  assert.equal(resena("Escribime al 1.155.512.345 para charlar.").resultado, "rechazo_contenido");
  assert.equal(resena("Escribime al 1985 2026 para charlar.").resultado, "rechazo_contenido");
  assert.equal(resena("Llamame al 15-03-2024, es mi número.").resultado, "rechazo_contenido");
});

test("teléfono v2 (A1): letras por dígitos dentro de un número", () => {
  assert.equal(resena("Escribime al 11 5O5O 1234 para charlar.").resultado, "rechazo_contenido");
  assert.equal(resena("Mandame un mensaje al 1l 44 5S 66 77.").resultado, "rechazo_contenido");
  // Sin contacto ni largo de teléfono, una pieza así es un nombre de modelo.
  assert.equal(resena("El robot modelo 5O5O aparece recién en el capítulo 12.").resultado, "publicar");
  assert.equal(resena("Se7en, M3GAN y T3E8 son títulos con números.").resultado, "publicar");
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

test("correo v2 (A2): 'usuario en/de proveedor', con usuario de forma reconocible o pista de correo", () => {
  assert.ok(reglas("Mi correo es cuenta_demo en gmail para charlar.").includes("contacto.email"));
  assert.ok(reglas("Escribime a anita1990 de hotmail.").includes("contacto.email"));
  assert.ok(reglas("Para más, juanperez en yahoo, escribime.").includes("contacto.email"));
  // Benignos emparejados.
  assert.equal(resena("El hacker entra al correo de gmail de su jefe.").resultado, "publicar");
  assert.equal(resena("Me llegó un mail de hotmail con la promo del estreno.").resultado, "publicar");
  assert.equal(resena("Su usuario en gmail era el mismo que el de la serie.").resultado, "publicar");
});

test("dominio v2 (A2): terminaciones con confusables de otros alfabetos", () => {
  assert.equal(resena("Visita ejemplo.coм para encontrar novedades.").resultado, "rechazo_contenido");
  assert.equal(resena("Está en verpelis.nеt sin cortes.").resultado, "rechazo_contenido");
  assert.equal(resena("La tenés en verpelis.οrg gratis.").resultado, "rechazo_contenido");
  // Texto en otro alfabeto sin dominio no dispara nada.
  assert.equal(resena("Левиафан es una película rusa durísima.").resultado, "publicar");
});

test("redes v3: menciones lejanas o sin verbo publican; un pedido entre comillas o atribuido se RETIENE, no se publica", () => {
  // Falsos positivos del contrato v1: S2 (intención + medio sin alias, en el
  // ámbito) retiene estos dos textos legítimos. Cuentan en C4; no se exceptúan.
  assert.equal(resena("El padre le dice \"escribime\" a su hija; luego ella mira Instagram, y esa escena me emocionó.").resultado, "retener");
  assert.equal(resena("Agregame a la lista de fans: la vi tres veces. Después busqué el tráiler en TikTok.").resultado, "retener");
  assert.equal(resena("En el final ella le dice «nos vemos en Instagram» y se va.").resultado, "publicar");
  // E1.2 (A1 de 1f475e3): antes publicaban; ahora son señal débil.
  assert.equal(resena("En una escena él le dice 'mandame un mensaje por WhatsApp cuando llegues' y nunca llega.").resultado, "retener");
  assert.equal(resena("El villano le grita escribime por WhatsApp y cuelga.").resultado, "retener");
});

test("redes v3 (A1): con o sin comillas, un pedido con destinatario se rechaza", () => {
  assert.equal(resena("Escribime por Instagram a cine_amigo.").resultado, "rechazo_contenido");
  assert.equal(resena("«Escribime por Instagram a cine_amigo».").resultado, "rechazo_contenido");
  assert.equal(resena("\"Escribime por Instagram a cine_amigo\".").resultado, "rechazo_contenido");
  assert.equal(resena("Le dice: 'agregame al wsp, soy demo_88'.").resultado, "rechazo_contenido");
});

test("redes v2 (A3): pedidos reales sin comillas", () => {
  // Pedidos reales, emparejados.
  assert.equal(resena("Agregame al wsp y charlamos de la peli.").resultado, "rechazo_contenido");
  assert.equal(resena("Escribime por insta, soy cinefila_demo.").resultado, "rechazo_contenido");
  // Entre comillas, pero con un usuario: lo detecta igual.
  assert.equal(resena("\"Seguime en ig @cine_demo\" dice el final.").resultado, "rechazo_contenido");
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
