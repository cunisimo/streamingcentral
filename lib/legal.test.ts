// Los contratos de la sección legal. Son pocos y puntuales a propósito.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PAGINAS_LEGALES, TMDB } from "./legal.ts";

// ============================================================================
// Las cuatro páginas
// ============================================================================

test("son las cuatro acordadas, en yump.ar y por https", () => {
  assert.deepEqual(
    PAGINAS_LEGALES.map((p) => p.href),
    [
      "https://yump.ar/acerca-de/",
      "https://yump.ar/privacidad/",
      "https://yump.ar/terminos/",
      "https://yump.ar/eliminar-cuenta/",
    ],
  );
});

test("la de baja de cuenta está, y es la que Play exige poder abrir sin la app", () => {
  const baja = PAGINAS_LEGALES.find((p) => p.href.includes("eliminar-cuenta"));
  assert.ok(baja, "desapareció el enlace de eliminar cuenta");
  assert.match(baja.texto, /eliminar/i);
});

test("todas tienen texto visible y ninguna apunta a la app", () => {
  for (const p of PAGINAS_LEGALES) {
    assert.ok(p.texto.trim().length > 3, `${p.href}: sin texto`);
    // Si alguna vez apuntaran a `app.yump.ar`, esa ruta tendría que ser pública
    // antes de autenticarse y quedar exenta del OnboardingGate. Ver
    // docs/PLAY-STORE.md §3.d.
    assert.doesNotMatch(p.href, /app\.yump\.ar/, `${p.href} apunta a la app`);
  }
});

// ============================================================================
// La atribución de TMDB
// ============================================================================

test("el texto de TMDB es LITERAL, palabra por palabra", () => {
  // Si esto cambia, cambió la atribución que exige la sección 3 de sus términos
  // — y eso es una decisión, no un retoque de redacción.
  assert.equal(
    TMDB.TEXTO,
    "This application uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.",
  );
});

test("el texto NO está traducido ni parafraseado", () => {
  // Las tres piezas que la sección 3 exige nombrar.
  for (const parte of ["TMDB and the TMDB APIs", "not endorsed", "certified"]) {
    assert.ok(TMDB.TEXTO.includes(parte), `falta "${parte}"`);
  }
  assert.doesNotMatch(TMDB.TEXTO, /respald|aprob|certific(a|ó)/i, "está traducido");
});

test("el logo se sirve LOCAL y el archivo existe", () => {
  assert.ok(TMDB.LOGO.startsWith("/"), "el logo no es una ruta local");
  assert.doesNotMatch(TMDB.LOGO, /^https?:/, "el logo sale a un dominio de terceros");
  const archivo = path.join(process.cwd(), "public", TMDB.LOGO.replace(/^\//, ""));
  assert.ok(fs.existsSync(archivo), `no está ${archivo}`);
  assert.match(fs.readFileSync(archivo, "utf8").slice(0, 200), /^<svg/, "no es un SVG");
});

// ============================================================================
// Dónde se muestra: tiene que llegarse SIN sesión
// ============================================================================

// ⚠️ Comprobación sobre el TEXTO de los archivos, no sobre la app montada: este
// proyecto no tiene arnés de DOM. Fija lo único que puede fijar —que las dos
// pantallas monten la sección— y es la regresión que de verdad puede pasar:
// `/cuenta/perfil` redirige a `/cuenta` sin sesión, así que si la sección
// viviera sólo ahí, nadie sin cuenta podría leer la información legal.
const fuente = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("la pestaña Cuenta monta la sección legal, y ésa se ve SIN sesión", () => {
  const src = fuente(path.join("app", "cuenta", "page.tsx"));
  assert.match(src, /<SobreYump/, "/cuenta no monta la sección legal");
});

test("Perfil también la monta: es su ubicación conceptual", () => {
  const src = fuente(path.join("app", "cuenta", "perfil", "page.tsx"));
  assert.match(src, /<SobreYump/, "/cuenta/perfil dejó de montar la sección legal");
});

test("el gate del onboarding no puede bloquear a quien no tiene sesión", () => {
  // `/cuenta` es la puerta legal sin cuenta. El gate sale temprano si no hay
  // usuario; si eso cambiara, esa puerta se cerraría sin que nadie lo note.
  const src = fuente(path.join("components", "onboarding", "OnboardingGate.tsx"));
  assert.match(src, /if \(!ready \|\| !user \|\| !profile\) return;/,
    "cambió la guarda del gate: revisar que /cuenta siga siendo pública");
});
