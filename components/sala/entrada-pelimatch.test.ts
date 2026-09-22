// El nombre visible de la funcionalidad es **Pelimatch** (decisión del dueño,
// 22/09) y las rutas técnicas NO cambian. Barrido textual sobre las dos
// entradas: la del Home (debajo de "Ruleta Yump") y la del hub de la cuenta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const HOME = leer("components/sala/CrearSalaEntrada.tsx");
const HUB = leer("components/sala/PelimatchTile.tsx");
const USERHUB = leer("components/UserHub.tsx");

// El texto visible, LITERAL (decisión del dueño, 22/09). Si alguien lo cambia
// sin que él lo pida, este test falla.
const EMOJI = "🍿";
const NOMBRE = "Pelimatch";
const BAJADA = "Cada uno vota en su teléfono. Sale una sola película.";
const BOTON = "Matcheá";

test("el banner del Home lleva el texto EXACTO: emoji, nombre, bajada y botón", () => {
  assert.ok(HOME.includes(`<span className="dsmp-banner-ico" aria-hidden>${EMOJI}</span>`), "el emoji");
  assert.ok(HOME.includes(`<span className="dsmp-banner-title">${NOMBRE}</span>`), "el nombre");
  assert.ok(HOME.includes(`<span className="dsmp-banner-sub">${BAJADA}</span>`), "la bajada");
  assert.ok(/dsmp-banner-cta">\s*Matcheá/.test(HOME), "el botón");
});

test("la entrada del hub dice lo mismo y NO conserva la bajada provisoria", () => {
  assert.ok(HUB.includes(`<span className="lock" aria-hidden>${EMOJI}</span>`), "el emoji");
  assert.ok(HUB.includes(`<span>${NOMBRE}</span>`), "el nombre");
  assert.ok(HUB.includes(`<small>${BAJADA}</small>`), "la bajada definitiva");
  // Se mira el JSX, no los comentarios: el del tile nombra la bajada vieja para
  // explicar el cambio, y eso no es texto visible.
  assert.ok(!/<small>Elegir entre varios<\/small>/.test(HUB), "el tile ya no la muestra");
  assert.ok(!/banner-sub">Elegir entre varios/.test(HOME), "el banner tampoco");
  assert.ok(USERHUB.includes("<PelimatchTile />"), "el hub monta la entrada");
});

test("las rutas técnicas siguen siendo /sala/nueva y /cuenta; nadie renombró carpetas ni endpoints", () => {
  assert.match(HOME, /"\/sala\/nueva"/);
  assert.match(HOME, /"\/cuenta"/, "sin sesión va a la cuenta");
  assert.match(HUB, /href="\/sala\/nueva"/);
  // Una RUTA renombrada, no cualquier mención: los comentarios citan el archivo
  // PelimatchTile.tsx y eso no es una ruta.
  for (const src of [HOME, HUB]) assert.ok(!/href="\/pelimatch/i.test(src), "la ruta no se renombró");
});

test("la entrada del Home es un LINK (no despliega nada en el Home) y va debajo de la ruleta", () => {
  assert.match(HOME, /<Link/);
  assert.ok(!/useState\(\s*(false|true)\s*\)[^]*abierto/i.test(HOME), "sin acordeón");
  const catalog = leer("components/CatalogView.tsx");
  const iRuleta = catalog.indexOf("<RuletaBanner />");
  const iSala = catalog.indexOf("<CrearSalaEntrada />");
  assert.ok(iRuleta >= 0 && iSala > iRuleta, "la entrada va inmediatamente después de RuletaBanner");
  assert.match(catalog.slice(iRuleta, iSala), /^\s*<RuletaBanner \/>\s*$/m);
});

test("las dos entradas NAVEGAN EN LA MISMA PESTAÑA: sin target, sin ventana flotante", () => {
  // Decisión del dueño (22/09): Pelimatch se abre como el "Ver todas" de los
  // rieles. Una pasada anterior había puesto target=_blank con un módulo de
  // apertura; se sacó entero.
  for (const src of [HOME, HUB]) {
    assert.ok(!/target=/.test(src), "sin target");
    assert.ok(!/window.open/.test(src), "sin ventana flotante");
    assert.ok(!/apertura/.test(src), "sin lógica especial de apertura");
  }
  assert.ok(!existsSync(join(process.cwd(), "lib/sala/apertura.ts")), "el módulo de apertura ya no existe");
});
