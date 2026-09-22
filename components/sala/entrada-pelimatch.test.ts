// El nombre visible de la funcionalidad es **Pelimatch** (decisión del dueño,
// 22/09) y las rutas técnicas NO cambian. Barrido textual sobre las dos
// entradas: la del Home (debajo de "Ruleta Yump") y la del hub de la cuenta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const HOME = leer("components/sala/CrearSalaEntrada.tsx");
const HUB = leer("components/sala/PelimatchTile.tsx");
const USERHUB = leer("components/UserHub.tsx");

test("las dos entradas dicen Pelimatch", () => {
  assert.match(HOME, /className="dsmp-banner-title">Pelimatch</);
  assert.match(HUB, /<span>Pelimatch<\/span>/);
  assert.ok(USERHUB.includes("<PelimatchTile />"), "el hub monta la entrada");
});

test("las rutas técnicas siguen siendo /sala/nueva y /cuenta; nadie renombró carpetas ni endpoints", () => {
  assert.match(HOME, /"\/sala\/nueva"/);
  assert.match(HOME, /"\/cuenta"/, "sin sesión va a la cuenta");
  assert.match(HUB, /href="\/sala\/nueva"/);
  for (const src of [HOME, HUB]) assert.ok(!/\/pelimatch/i.test(src), "la ruta no se renombró");
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

test("el target de pestaña nueva sale de lib/sala/apertura.ts, no escrito a mano", () => {
  for (const src of [HOME, HUB]) {
    assert.match(src, /atributosEnlace\(contextoDelNavegador\(ES_NATIVO\)\)/);
    assert.ok(!/target="_blank"/.test(src), "no se fija a mano: en PWA/nativo no corresponde");
  }
});
