// El nombre visible de la funcionalidad es **Yumpeá** (decisión del dueño,
// 26/09; antes se llamó "Pelimatch") y las rutas técnicas NO cambian. Barrido
// textual sobre las dos entradas: la del Home (debajo de "Ruleta Yump") y la del
// hub de la cuenta.
//
// El archivo y el componente del tile SIGUEN llamándose PelimatchTile: un
// cambio de rótulo no renombra archivos, rutas ni contratos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const HOME = leer("components/sala/CrearSalaEntrada.tsx");
const HUB = leer("components/sala/PelimatchTile.tsx");
const USERHUB = leer("components/UserHub.tsx");

// El texto visible, LITERAL (decisión del dueño, 26/09). Si alguien lo cambia
// sin que él lo pida, este test falla.
const EMOJI = "🍿";
const NOMBRE = "Yumpeá";
const BAJADA = "Cada uno vota en su teléfono. Sale una sola película.";
const BOTON = "Hacé match";

test("el banner del Home lleva el texto EXACTO: emoji, nombre, bajada y botón", () => {
  assert.ok(HOME.includes(`<span className="dsmp-banner-ico" aria-hidden>${EMOJI}</span>`), "el emoji");
  assert.ok(HOME.includes(`<span className="dsmp-banner-title">${NOMBRE}</span>`), "el nombre");
  assert.ok(HOME.includes(`<span className="dsmp-banner-sub sala-bajada">${BAJADA}</span>`), "la bajada");
  assert.ok(new RegExp(`dsmp-banner-cta">\\s*${BOTON}`).test(HOME), "el botón");
});

test("la entrada del hub dice lo mismo y NO conserva la bajada provisoria", () => {
  assert.ok(HUB.includes(`<span className="lock" aria-hidden>${EMOJI}</span>`), "el emoji");
  assert.ok(HUB.includes(`<span>${NOMBRE}</span>`), "el nombre");
  assert.ok(HUB.includes(`<small className="sala-bajada">${BAJADA}</small>`), "la bajada definitiva");
  // Se mira el JSX, no los comentarios: el del tile nombra la bajada vieja para
  // explicar el cambio, y eso no es texto visible.
  assert.ok(!/<small>Elegir entre varios<\/small>/.test(HUB), "el tile ya no la muestra");
  assert.ok(!/banner-sub">Elegir entre varios/.test(HOME), "el banner tampoco");
  assert.ok(USERHUB.includes("<PelimatchTile />"), "el hub monta la entrada");
  // El nombre anterior no quedó suelto en el JSX (los comentarios lo citan para
  // explicar el cambio, y eso no es texto visible).
  for (const [n, src] of [["banner", HOME], ["tile", HUB]] as const) {
    const jsx = src.slice(src.indexOf("return ("));
    assert.ok(!/Pelimatch|Matcheá/.test(jsx), `${n}: quedó el nombre viejo a la vista`);
  }
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
  // Decisión del dueño (22/09): se abre como el "Ver todas" de los
  // rieles. Una pasada anterior había puesto target=_blank con un módulo de
  // apertura; se sacó entero.
  for (const src of [HOME, HUB]) {
    assert.ok(!/target=/.test(src), "sin target");
    assert.ok(!/window.open/.test(src), "sin ventana flotante");
    assert.ok(!/apertura/.test(src), "sin lógica especial de apertura");
  }
  assert.ok(!existsSync(join(process.cwd(), "lib/sala/apertura.ts")), "el módulo de apertura ya no existe");
});

// --- La bajada, sólo en navegador de escritorio (dueño, 28/09) ----------------
import { MEDIA_ESCRITORIO, bajadaVisible } from "../../lib/sala/entrada.ts";

test("bajada: visible en escritorio; oculta en navegador móvil, PWA standalone y app Android", () => {
  const escritorio = { nativo: false, displayModeBrowser: true, hover: true, punteroFino: true };
  assert.equal(bajadaVisible(escritorio), true, "navegador de escritorio");
  assert.equal(bajadaVisible({ ...escritorio, hover: false, punteroFino: false }), false, "navegador móvil (táctil)");
  assert.equal(bajadaVisible({ ...escritorio, displayModeBrowser: false }), false, "PWA instalada (standalone), aun en escritorio");
  assert.equal(bajadaVisible({ ...escritorio, nativo: true }), false, "app Android, con cualquier pantalla y puntero");
  assert.equal(bajadaVisible({ ...escritorio, punteroFino: false }), false, "tablet táctil con hover emulado");
});

test("bajada: el CSS usa EXACTAMENTE la media query de la función, y la oculta por defecto", () => {
  const css = leer("app/globals.css");
  assert.equal(MEDIA_ESCRITORIO, "(display-mode: browser) and (hover: hover) and (pointer: fine)");
  const i = css.indexOf(`@media ${MEDIA_ESCRITORIO}{`);
  assert.ok(i > 0, "falta la media query de escritorio");
  const bloque = css.slice(i, css.indexOf("}", css.indexOf("{", i) + 1) + 1);
  assert.ok(bloque.includes(".sala-banner .dsmp-banner-sub.sala-bajada,.hub-tile small.sala-bajada{display:block}"), bloque);
  const antes = css.slice(0, i);
  assert.ok(antes.includes(".sala-banner .dsmp-banner-sub.sala-bajada,.hub-tile small.sala-bajada{display:none}"), "oculta por defecto");
  // Ya no se fuerza en teléfono (la regla del 22/09 se retiró).
  assert.ok(!css.includes(".sala-banner .dsmp-banner-sub{display:block}"));
});

test("bajada: en la app Android ni se dibuja; nombre, emoji, botón, destino y los 'Próximamente' no cambian", () => {
  assert.ok(HOME.includes(`{!ES_NATIVO && <span className="dsmp-banner-sub sala-bajada">`));
  assert.ok(HUB.includes(`{!ES_NATIVO && <small className="sala-bajada">`));
  assert.ok(HOME.includes(`<span className="dsmp-banner-title">${NOMBRE}</span>`));
  assert.ok(HUB.includes(`<span>${NOMBRE}</span>`));
  // Los otros tiles del hub conservan su "Próximamente", sin la clase nueva.
  assert.equal(USERHUB.split("<small>Próximamente</small>").length - 1, 2);
  assert.ok(!USERHUB.includes("sala-bajada"));
});
