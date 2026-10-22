// Transformaciones del MISMO caso (E1.2, punto 5): comillas, separadores,
// formas de dígitos, confusables y contacto repartido. Un pedido de contacto
// transformado nunca debe pasar a "publicar"; un control legítimo
// transformado nunca debe pasar a "rechazo". Así un arreglo no crea una
// exención general (comillas) ni rechazos indiscriminados (separadores,
// dígitos). Casos sintéticos conocidos: no miden eficacia.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarResena } from "./decision.ts";
import type { ContextoResena } from "./tipos.ts";

const PREFIJO = "La película tiene buenos actores y una historia que mantiene el interés hasta el final. ";
const sinCtx: ContextoResena = { textosRecientes: [] };
const evaluar = (t: string, ctx = sinCtx) => evaluarResena(PREFIJO + t, ctx).resultado;

const MALICIOSOS = [
  "Escribime al 1144556677 para comentar.",
  "Escribime a ana.demo@gmail.com para comentar.",
  "Mirala en verpelis.com sin cortes.",
  "Escribime por Instagram a cine_amigo.",
];
const LEGITIMOS = [
  "La vi en 1985 y en 2026, siempre en el cine del barrio.",
  "Dura 2 h 47 min y el episodio 8 es el mejor de la temporada.",
  "Ella mira Instagram todo el día y la serie se ríe de eso.",
  "Cuenta la burbuja de las punto com con mucho humor.",
  "Recaudó 1.155.512.345 dólares en todo el mundo.",
];

// ---------------------------------------------------------------- comillas

const COMILLAS: [string, string][] = [["«", "»"], ["\"", "\""], ["“", "”"], ["'", "'"], ["‹", "›"]];

test("comillas: un pedido entre comillas nunca se publica; un legítimo entre comillas nunca se rechaza", () => {
  for (const [a, c] of COMILLAS) {
    for (const m of MALICIOSOS) assert.notEqual(evaluar(`${a}${m}${c}`), "publicar", `${a}${m}${c}`);
    for (const l of LEGITIMOS) assert.notEqual(evaluar(`${a}${l}${c}`), "rechazo_contenido", `${a}${l}${c}`);
  }
});

// ---------------------------------------------------------------- separadores

const SEPARADORES = [" ", ".", "-", "·", "–", "—", "•", "‧", "−", " . ", " - "];
const partir = (digitos: string, sep: string) => digitos.match(/.{1,2}/g)!.join(sep);

test("separadores: el teléfono con cualquier separador se rechaza; años separados así no", () => {
  for (const sep of SEPARADORES) {
    assert.equal(evaluar(`Escribime al ${partir("1144556677", sep)} para comentar.`), "rechazo_contenido", JSON.stringify(sep));
    assert.equal(evaluar(`Las fechas son ${["1985", "2026", "2030"].join(sep)} según la saga.`), "publicar", JSON.stringify(sep));
  }
});

// ---------------------------------------------------------------- formas de dígitos

const FORMAS: Record<string, (d: string) => string> = {
  ascii: (d) => d,
  ancho_completo: (d) => [...d].map((c) => String.fromCodePoint(0xff10 + Number(c))).join(""),
  arabigo_indico: (d) => [...d].map((c) => String.fromCodePoint(0x0660 + Number(c))).join(""),
  persa: (d) => [...d].map((c) => String.fromCodePoint(0x06f0 + Number(c))).join(""),
  devanagari: (d) => [...d].map((c) => String.fromCodePoint(0x0966 + Number(c))).join(""),
  bengali: (d) => [...d].map((c) => String.fromCodePoint(0x09e6 + Number(c))).join(""),
  matematico: (d) => [...d].map((c) => String.fromCodePoint(0x1d7ce + Number(c))).join(""),
  letras: (d) => d.replace(/0/g, "O").replace(/1/g, "l"),
};

test("formas de dígitos: el teléfono se rechaza en cualquier forma; los años en cualquier forma publican", () => {
  for (const [nombre, f] of Object.entries(FORMAS)) {
    assert.equal(evaluar(`Escribime al ${f("1104556677")} para comentar.`), "rechazo_contenido", nombre);
    if (nombre !== "letras") {
      assert.equal(evaluar(`La vi en ${f("1985")} y en ${f("2026")}, siempre en el cine.`), "publicar", nombre);
    }
  }
});

// ---------------------------------------------------------------- confusables

const CIRILICO: Record<string, string> = { a: "а", c: "с", e: "е", o: "о", p: "р", m: "м" };
const confundir = (t: string, letras: string) => [...t].map((c) => (letras.includes(c) ? CIRILICO[c] ?? c : c)).join("");

test("confusables: dominio y correo con letras cirílicas se rechazan; un texto con esas letras sin dominio publica", () => {
  for (const letras of ["o", "c", "m", "ae", "com", "acemop"]) {
    assert.equal(evaluar(`Mirala en ${confundir("verpelis.com", letras)} sin cortes.`), "rechazo_contenido", letras);
    assert.equal(evaluar(`Escribime a ${confundir("ana.demo@gmail.com", letras)} para comentar.`), "rechazo_contenido", letras);
  }
  assert.equal(evaluar("Левиафан es una película rusa durísima y muy recomendable."), "publicar");
});

// ---------------------------------------------------------------- contacto repartido

test("contacto repartido: número o correo partidos entre reseñas no se publican; números legítimos repartidos sí", () => {
  assert.notEqual(evaluar("El resto: 55 66 77.", { textosRecientes: ["Mi número arranca con 11 44, lo sigo en otra."] }), "publicar");
  assert.notEqual(evaluar("Sigue con gmail, la terminación es com.", { textosRecientes: ["Para charlar: ana.demo arroba"] }), "publicar");
  assert.notEqual(evaluar("El final de mi usuario es _cine, sumalo.", { textosRecientes: ["Me encontrás como @tito"] }), "publicar");
  assert.equal(evaluar("La temporada 3 tiene 12 episodios.", { textosRecientes: ["La vi en 2019 y en 2023.", "La temporada 1 tiene 10 episodios."] }), "publicar");
  assert.equal(evaluar("El final de la segunda es mejor.", { textosRecientes: ["Muy buena la primera temporada."] }), "publicar");
});
