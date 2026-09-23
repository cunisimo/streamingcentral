import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CUPO, MINIMO, rotuloEmpezar, lineaGente, reciénLlegados, avisoDeLlegada } from "./lobby-nucleo.ts";

test("el botón dice el ESTADO, no sólo la acción: bloqueado explica qué falta", () => {
  assert.equal(rotuloEmpezar(1), "Falta que se sume alguien");
  assert.equal(rotuloEmpezar(2), "Empezar con 2");
  assert.equal(rotuloEmpezar(6), "Empezar con 6");
  // El caso que reportó el dueño: con una sola persona el botón no hacía nada y
  // no decía por qué, y se leyó como que servía para obtener el enlace.
  assert.notEqual(rotuloEmpezar(1), rotuloEmpezar(2));
});

test("la línea de arriba del botón repite la cuenta que está fuera de pantalla", () => {
  assert.match(lineaGente(1), /sólo vos \(1 de 6\)/);
  assert.match(lineaGente(2), /Están 2 de 6/);
  assert.match(lineaGente(2), /seguir sumándose/, "empezar con 2 no cierra la puerta");
  assert.match(lineaGente(6), /la sala está llena/);
  assert.doesNotMatch(lineaGente(6), /seguir sumándose/, "con la sala llena no pueden sumarse más");
});

test("los recién llegados se calculan como multiconjunto: dos nombres iguales son dos personas", () => {
  assert.deepEqual(reciénLlegados(["Facu"], ["Facu", "Ana"]), ["Ana"]);
  assert.deepEqual(reciénLlegados(["Facu", "Ana"], ["Facu", "Ana"]), [], "una relectura sin cambios no avisa");
  assert.deepEqual(reciénLlegados(["Facu"], ["Facu", "Ana", "Beto"]), ["Ana", "Beto"]);
  assert.deepEqual(reciénLlegados(["Facu", "Ana"], ["Facu", "Ana", "Ana"]), ["Ana"], "la segunda Ana es alguien nuevo");
  // Que alguien desaparezca no inventa llegadas (no pasa hoy —nadie se va— pero
  // el cálculo no debe romperse si algún día se puede salir de la sala).
  assert.deepEqual(reciénLlegados(["Facu", "Ana"], ["Facu"]), []);
});

test("el aviso nombra a quien llegó y se corta en 3", () => {
  assert.equal(avisoDeLlegada([]), null, "sin llegadas no se muestra nada");
  assert.equal(avisoDeLlegada(["Ana"]), "Se sumó Ana.");
  assert.equal(avisoDeLlegada(["Ana", "Beto"]), "Se sumaron Ana y Beto.");
  assert.equal(avisoDeLlegada(["Ana", "Beto", "Cami"]), "Se sumaron 3 personas.");
});

test("las constantes son las de la base, no números sueltos en la vista", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/009_salas.sql"), "utf8");
  assert.equal(CUPO, 6);
  assert.equal(MINIMO, 2);
  assert.match(sql, /if n < 2 then raise exception 'sala_sin_quorum'/, "el mínimo lo exige la base");
  const lobby = readFileSync(join(process.cwd(), "components/sala/Lobby.tsx"), "utf8");
  assert.match(lobby, /rotuloEmpezar\(estado\.n\)/, "el rótulo sale del módulo puro");
  assert.match(lobby, /lineaGente\(estado\.n\)/);
  assert.doesNotMatch(lobby, /estado\.n < 2/, "el mínimo no se repite escrito a mano en la vista");
});
