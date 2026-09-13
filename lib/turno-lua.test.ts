// Los scripts que corren en producción son EXACTAMENTE los que se verificaron
// contra la base real (Etapa 2, §14). Si alguien toca uno, este test lo manda
// a verificar de nuevo antes de creerle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LUA } from "./turno-lua.ts";

// CRLF → LF: el checkout de Windows puede convertir los finales de línea del
// archivo de evidencia; los scripts se comparan con `\n`.
const verificado = readFileSync("docs/medidas/2026-09-13-etapa2-precondicion-upstash.route.ts.txt", "utf8")
  .split("\r\n").join("\n");

test("los cuatro scripts son byte a byte los de la precondición verificada contra Upstash", () => {
  for (const [nombre, texto] of Object.entries(LUA)) {
    const m = verificado.match(new RegExp(`const ${nombre} = \`([\\s\\S]*?)\`;`));
    assert.ok(m, `${nombre} no está en el texto de la precondición`);
    assert.equal(texto, m![1], `${nombre} difiere del script verificado`);
  }
});

test("ningún script tiene DEL sin comprobar el propietario ni SET … XX", () => {
  for (const [nombre, texto] of Object.entries(LUA)) {
    assert.doesNotMatch(texto, /'XX'/, nombre);
    // Todo DEL viene después de comprobar `GET KEYS[1] == ARGV[1]`.
    if (/DEL/.test(texto)) assert.match(texto, /redis\.call\('GET', KEYS\[1\]\) (==|~=) ARGV\[1\]/, nombre);
  }
});
