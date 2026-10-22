// Plegado en dos pasadas (revisión §3.1): dígitos antes que letras, y los
// confusables ambiguos como clases, no como reemplazo único.
import { test } from "node:test";
import assert from "node:assert/strict";
import { base, clase, letrasADigitos, normalizarOriginal, palabrasADigitos, plegar, resolverSeparadores } from "./plegado.ts";

test("normalizarOriginal: NFC, saltos de línea unificados y bordes recortados", () => {
  assert.equal(normalizarOriginal("  éxito\r\nfinal\r  "), "éxito\nfinal");
});

test("base: ancho completo, mayúsculas, acentos, invisibles y espacios", () => {
  assert.equal(base("ＨＯＬＡ １１"), "hola 11");
  assert.equal(base("Película   ÉPICA"), "pelicula epica");
  assert.equal(base("11​55​66"), "115566");
  assert.equal(base("a‮b"), "ab");
});

test("palabras-número: sólo se convierten dentro de una corrida de 3 o más piezas", () => {
  assert.equal(palabrasADigitos("once cinco cinco"), "11 5 5");
  assert.equal(palabrasADigitos("agendate 11 cinco 66 siete"), "agendate 11 5 66 7");
  assert.equal(palabrasADigitos("un clasico de los de antes"), "un clasico de los de antes");
  assert.equal(palabrasADigitos("dos o tres escenas"), "dos o tres escenas");
  // Una letra en el medio corta la corrida.
  assert.equal(palabrasADigitos("uno x dos tres"), "uno x dos tres");
});

test("la pasada de dígitos corre antes y no la afectan los confusables de letras", () => {
  const p = plegar("Uno uno cuatro cuatro y la peli");
  assert.match(p.digitos, /1 1 4 4/);
  // La copia de letras parte de `base`: ahí siguen siendo palabras.
  assert.match(p.letras, /uno uno cuatro cuatro/);
});

test("letras por dígitos: sólo en piezas que ya tienen un dígito y sólo letras de la familia", () => {
  assert.equal(letrasADigitos("11 5o5o 1234"), "11 5050 1234");
  assert.equal(letrasADigitos("1l 44 5s"), "11 44 55");
  // Sin dígito o con otra letra, no se toca.
  assert.equal(letrasADigitos("solo bis oso"), "solo bis oso");
  assert.equal(letrasADigitos("se7en m3gan 2do t3e8"), "se7en m3gan 2do t3e8");
  assert.match(plegar("Escribime al 11 5O5O 1234").digitos, /11 5050 1234/);
});

test("separadores ofuscados de dominios y correos", () => {
  assert.equal(resolverSeparadores("pelis punto com"), "pelis.com");
  assert.equal(resolverSeparadores("bit(.)ly/abc"), "bit.ly/abc");
  assert.equal(resolverSeparadores("bit[punto]ly"), "bit.ly");
  assert.equal(resolverSeparadores("juan arroba gmail"), "juan@gmail");
  assert.equal(resolverSeparadores("juan (at) hotmail (dot) com"), "juan@hotmail.com");
  assert.equal(resolverSeparadores("mail: j u a n @ g m a i l . c o m"), "mail: juan@gmail.com");
  assert.equal(resolverSeparadores("cine-oscuro . blogspot . com"), "cine-oscuro.blogspot.com");
});

test("la puntuación no se convierte en dominio", () => {
  assert.equal(resolverSeparadores("buenisima. me encanto"), "buenisima. me encanto");
  assert.equal(resolverSeparadores("y a la noche"), "y a la noche");
});

test("confusables ambiguos como clases; cirílicas no ambiguas mapeadas", () => {
  assert.equal(clase("com"), "c[o0]m");
  assert.equal(clase("ig"), "[i1l!\\|][g9]");
  assert.equal(plegar("сinemania").letras, "cinemania");
  // E1.1: la м cirílica, el ı sin punto y una versalita.
  assert.equal(plegar("ejemplo.coм").letras, "ejemplo.com");
  assert.equal(plegar("verpelıs.ɴet").letras, "verpelis.net");
});

test("plegar lanza si no recibe un string", () => {
  assert.throws(() => plegar(42 as unknown as string), TypeError);
});
