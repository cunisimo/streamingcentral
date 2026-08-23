// `cachedIf` tiene que DELEGAR en `resolverConCache`, no reimplementarla.
//
// Por qué existe este test: `lib/reparar-y-cachear.test.ts` prueba la decisión
// de leer/escribir llamando a `resolverConCache` con un backend en memoria. Eso
// solo vale si producción entra por la MISMA función. Mientras `cachedIf`
// tenía su propio `leer → fetcher → vale → guardar`, los tests pasaban en
// verde sobre código que producción no ejecutaba — que es exactamente cómo se
// colaron los tres bugs anteriores.
//
// No se puede importar `lib/cache.ts` desde `node --test` (arrastra Upstash),
// así que se inspecciona el fuente. Es un chequeo estructural, no de estilo:
// falla si alguien vuelve a escribir la lógica a mano adentro de `cachedIf`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** El cuerpo de una función exportada, por llaves balanceadas. */
function cuerpoDe(src: string, firma: string): string {
  const i = src.indexOf(firma);
  assert.notEqual(i, -1, `no se encontró «${firma}» en lib/cache.ts`);
  const abre = src.indexOf("{", src.indexOf("): Promise<T> {", i));
  let nivel = 0;
  for (let j = abre; j < src.length; j++) {
    if (src[j] === "{") nivel++;
    else if (src[j] === "}") {
      nivel--;
      if (nivel === 0) return src.slice(abre + 1, j);
    }
  }
  throw new Error(`no se pudo delimitar el cuerpo de «${firma}»`);
}

const fuente = readFileSync("lib/cache.ts", "utf8");

test("cachedIf DELEGA en resolverConCache", () => {
  const cuerpo = cuerpoDe(fuente, "export async function cachedIf");
  assert.match(cuerpo, /resolverConCache\s*</,
    "cachedIf tiene que llamar a resolverConCache");
  assert.match(cuerpo, /backend:\s*backendCache/,
    "tiene que pasarle el backend REAL");
});

test("cachedIf NO reimplementa el leer/escribir", () => {
  const cuerpo = cuerpoDe(fuente, "export async function cachedIf");
  // Estas dos son las primitivas del backend: si aparecen adentro de `cachedIf`
  // es porque volvió a hacer el trabajo por su cuenta.
  assert.doesNotMatch(cuerpo, /\bbatchGet\s*</,
    "cachedIf no puede leer por su cuenta: eso lo hace el backend");
  assert.doesNotMatch(cuerpo, /\bawait\s+guardar\s*\(/,
    "cachedIf no puede escribir por su cuenta: eso lo decide resolverConCache");
});

test("el adaptador entre contratos es solo dar vuelta el predicado", () => {
  const cuerpo = cuerpoDe(fuente, "export async function cachedIf");
  // `vale(v) === true` significa "guardalo"; `resolverConCache` guarda cuando
  // NO hubo `fallo`. La única traducción admitida es la negación.
  assert.match(cuerpo, /fallo:\s*!vale\(/,
    "el puente entre `vale` y `fallo` tiene que ser la negación, sin lógica extra");
});

test("el backend real expone leer y escribir", () => {
  assert.match(fuente, /export const backendCache: BackendCache/);
  assert.match(fuente, /leer:\s*<T>\(clave: string\) => batchGet<T>\(clave\)/);
  assert.match(fuente, /escribir:.*guardar\(clave, valor, ttl\)/);
});

test("el detector funciona: reconocería una reimplementación", () => {
  // Un test estructural que nunca se vio en rojo no está probado.
  const reimplementado = [
    "export async function cachedIf<T>(",
    "  key: string, ttl: number, fetcher: () => Promise<T>, vale: (v: T) => boolean,",
    "): Promise<T> {",
    "  const hit = await batchGet<T>(key);",
    "  if (hit !== null) return hit;",
    "  const data = await fetcher();",
    "  if (vale(data)) await guardar(key, data, ttl);",
    "  return data;",
    "}",
  ].join("\n");
  const cuerpo = cuerpoDe(reimplementado, "export async function cachedIf");
  assert.match(cuerpo, /\bbatchGet\s*</, "el detector tiene que ver la lectura a mano");
  assert.match(cuerpo, /\bawait\s+guardar\s*\(/, "y la escritura a mano");
  assert.doesNotMatch(cuerpo, /resolverConCache\s*</, "y la ausencia de delegación");
});
