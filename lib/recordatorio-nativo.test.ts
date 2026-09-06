// "Recordarme" en el contenedor: Google Calendar, sin `.ics`.
//
// ============================================================================
// QUÉ SE MIDIÓ, Y POR QUÉ SE CAMBIA
// ============================================================================
// En el teléfono, el 2026-09-06, con `ar.yump.app`: la fila "Apple Calendar /
// Outlook" del menú funciona a medias. El `fetch` de validación devuelve 200 y
// el CORS es exacto, pero el `window.location.href = ics` que viene después NO
// navega la WebView: Android le pasa la URL a **Chrome**, que ofrece bajar
// `futurama.ics` a la carpeta Descargas. O sea que el usuario sale de Yump, pasa
// por un tercer programa y termina con un archivo suelto que todavía tiene que
// encontrar y abrir a mano.
//
// Es exactamente el problema que `calendar-links.ts` ya describe para el
// escritorio: *"un .ics bajado se queda en la carpeta de Descargas sin hacer
// nada"*. En Android ni siquiera hace falta, porque el otro camino —Google
// Calendar— es el que corresponde ahí: abre la pantalla de "crear evento" ya
// completa y el usuario decide si guarda o cancela.
//
// 🔴 NO SE DUPLICA NADA. En nativo se usa el MISMO `googleCalendarUrl` con el
// mismo `resumen` y la misma `fecha` que en web; lo único que cambia es que no
// se ofrece la segunda fila. Si se armara una URL aparte, la fecha del evento
// podría separarse de la que habilita el botón, que es el bug que el comentario
// de `DetailView` marca como ya cometido una vez.
//
// 🔴 EN LA WEB NO CAMBIA NADA: siguen las dos opciones, el `.ics` sigue vivo, el
// endpoint no se toca y `googleCalendarUrl` conserva sus parámetros.
//
// La bandera es `ES_NATIVO` (build), no el user-agent: el HTML exportado tiene
// que nacer ya con la forma correcta, no corregirse al hidratar.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { googleCalendarUrl, icsUrl } from "./calendar-links.ts";

const raiz = path.resolve(import.meta.dirname, "..");
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");
const existe = (p: string) => fs.existsSync(path.join(raiz, p));
const sinComentarios = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

function archivos(dir: string): string[] {
  const abs = path.join(raiz, dir);
  if (!fs.existsSync(abs)) return [];
  const salida: string[] = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true, recursive: true }) as fs.Dirent[]) {
    if (e.isFile()) salida.push(path.join(e.parentPath ?? abs, e.name));
  }
  return salida;
}

/** La etiqueta de la fila del `.ics`: es la marca inequívoca de que se ofreció. */
const FILA_ICS = "Apple Calendar / Outlook";

// -------------------------------------------- 1. el constructor NO se duplicó

test("el enlace de Google Calendar lo sigue armando `googleCalendarUrl`", () => {
  const src = sinComentarios("components/RecordarButton.tsx");
  assert.match(src, /googleCalendarUrl\(/, "el componente dejó de usar el constructor");
  // Una sola construcción: si hubiera dos, una podría quedar con otra fecha.
  const veces = (src.match(/googleCalendarUrl\(/g) ?? []).length;
  assert.equal(veces, 1, `se arma el enlace ${veces} veces; tiene que ser una sola`);
  // Y nadie arma la URL de Google a mano en ningún lado.
  assert.doesNotMatch(src, /calendar\.google\.com/,
    "hay una URL de Google escrita a mano: tiene que salir del constructor");
});

test("no se reimplementó lógica de fechas fuera de `calendar-links`", () => {
  const src = sinComentarios("components/RecordarButton.tsx");
  for (const prohibido of [/new Date\(/, /toISOString/, /getUTCDate/, /timeZone/]) {
    assert.doesNotMatch(src, prohibido,
      `el componente calcula fechas por su cuenta (${prohibido}); eso vive en calendar-links.ts`);
  }
});

test("`googleCalendarUrl` conserva sus parámetros", () => {
  // Control de la web: el contrato del enlace no cambia con esta tanda.
  const u = new URL(googleCalendarUrl({ titulo: "X — estreno en Y", fecha: "2026-09-07", detalle: "D" }));
  assert.equal(u.origin + u.pathname, "https://calendar.google.com/calendar/render");
  assert.equal(u.searchParams.get("action"), "TEMPLATE");
  assert.equal(u.searchParams.get("dates"), "20260907/20260908", "el fin exclusivo se movió");
  assert.equal(u.searchParams.get("text"), "X — estreno en Y");
  assert.equal(u.searchParams.get("details"), "D");
});

test("el endpoint del `.ics` no cambió", () => {
  assert.equal(icsUrl("tv", 615, "d"), "/api/recordatorio?tipo=tv&id=615&plataforma=d");
  assert.equal(icsUrl("movie", 278), "/api/recordatorio?tipo=movie&id=278");
});

// ------------------------------------------------------ 2. el gate es de build

test("la decisión pasa por ES_NATIVO, no por user-agent", () => {
  const src = sinComentarios("components/RecordarButton.tsx");
  assert.match(src, /ES_NATIVO/, "el componente no consulta la bandera de build");
  assert.doesNotMatch(src, /isNativePlatform|userAgent|navigator\.platform/,
    "el gate tiene que ser la bandera de build, no una detección en runtime");
});

test("en nativo no se ofrece la fila del `.ics`", () => {
  const src = sinComentarios("components/RecordarButton.tsx");
  // La fila tiene que estar del lado NO nativo de la bandera.
  assert.match(src, new RegExp(`!ES_NATIVO[\\s\\S]{0,600}${FILA_ICS.replace(/[/]/g, "\\/")}`),
    "la fila del .ics no quedó detrás de !ES_NATIVO");
});

// ------------------------------------------- 3. los artefactos, no el código

test("en nativo el botón es un enlace directo, sin menú", () => {
  const src = sinComentarios("components/RecordarButton.tsx");
  // El camino nativo tiene que cortar ANTES del menú y devolver un <a> al mismo
  // `google`. Si devolviera el menú, volvería a aparecer la fila del .ics.
  const m = /if \(ES_NATIVO\) \{([\s\S]*?)\n    \}/.exec(src);
  assert.ok(m, "no hay un corte `if (ES_NATIVO)` en la variante de texto");
  assert.match(m![1], /href=\{google\}/, "el camino nativo no enlaza al `google` ya armado");
  assert.doesNotMatch(m![1], /\{menu\}|prow|bajarIcs/, "el camino nativo todavía llega al menú o al .ics");
  // Y el corte va ANTES del return con el menú.
  assert.ok(src.indexOf("if (ES_NATIVO)") < src.indexOf("{open && menu}"),
    "el corte por bandera está después del menú: no lo evita");
});

// ⚠️ ACÁ NO SE COMPRUEBA QUE LA CADENA DESAPAREZCA DEL BUNDLE NATIVO, y no es
// conformismo: `RecordarButton` es un componente de cliente y webpack no plega
// `ES_NATIVO` a través del módulo que lo exporta, así que la rama muerta sigue
// empaquetada. Medido: la etiqueta aparece en los mismos 3 chunks antes y
// después del cambio. Lo que importa —que la fila no se ofrezca y que no se
// pida `/api/recordatorio`— se comprueba arriba en el código y, sobre todo, en
// el teléfono contando los pedidos.

const HAY_WEB = existe(".next/static");

test("el bundle de la web SIGUE ofreciendo el `.ics`", { skip: !HAY_WEB }, () => {
  // El control: este cambio no puede tocar la web.
  const hay = archivos(".next/static")
    .filter((f) => f.endsWith(".js"))
    .some((f) => fs.readFileSync(f, "utf8").includes(FILA_ICS));
  assert.ok(hay, "la web perdió la opción Apple Calendar / Outlook");
});
