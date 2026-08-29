// Lo que sale de la app hacia afuera: el enlace público de una ficha y el texto
// con el que se comparte.
//
// Los dos bugs que fijan estas pruebas son de la misma familia —algo que el
// usuario ve FUERA de la app salió mal— y por eso van juntos en un archivo:
//
//   1. `metadata.description` estaba doblemente codificada y la vista previa de
//      WhatsApp mostraba basura donde va la "é" de "Qué ver en tus plataformas".
//   2. El enlace compartido se armaba con `window.location.origin`, así que una
//      PWA instalada desde el dominio viejo compartía
//      `streamingcentral.vercel.app`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SITIO_PUBLICO, urlDeTitulo, mensajeCompartir, enlaceWhatsapp } from "./compartir.ts";

const DOMINIO_VIEJO = "streamingcentral.vercel.app";
const fuente = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");

// ============================================================================
// Bug 1 — la codificación de los textos que se ven fuera de la app
// ============================================================================

// El daño es de bytes, no de caracteres: `é` (c3 a9) leído como Latin-1 y
// reescrito en UTF-8 da dos caracteres (c3 83 c2 a9). Buscar ese resultado es la
// única forma de detectarlo una vez que el archivo ya se decodificó.
//
// El patrón se arma con escapes y NO con los caracteres literales, para que
// este mismo archivo no se autodetecte como dañado.
const MOJIBAKE = new RegExp("[\u00c3\u00c2][\u0080-\u00bf]|\u00e2\u20ac");

test("la descripción del layout es la que tiene que leer WhatsApp", () => {
  const src = fuente("app", "layout.tsx");
  const m = src.match(/description:\s*"([^"]+)"/);
  assert.ok(m, "no se encontró metadata.description en app/layout.tsx");
  assert.equal(
    m[1],
    "Qué ver en tus plataformas de streaming, sin perder 45 minutos buscando.",
  );
});

test("ningún archivo de código tiene doble codificación", () => {
  // Recorre las cuatro carpetas de código. Si vuelve a pasar —un editor que
  // guarda el archivo leyéndolo como Latin-1— esto lo caza en el acto, sin
  // depender de que alguien mire la vista previa de un link.
  const raiz = process.cwd();
  const dañados: string[] = [];
  const mirar = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { mirar(full); continue; }
      if (!/\.(ts|tsx|css|js|mjs|json|html)$/.test(e.name)) continue;
      if (MOJIBAKE.test(fs.readFileSync(full, "utf8"))) {
        dañados.push(path.relative(raiz, full));
      }
    }
  };
  for (const d of ["app", "components", "lib", "hooks"]) mirar(path.join(raiz, d));
  assert.deepEqual(dañados, [], `archivos con mojibake: ${dañados.join(", ")}`);
});

test("el manifest y el layout dicen la misma frase", () => {
  // Son dos copias de la misma descripción y una se rompió sin la otra. Que
  // coincidan es lo que hace visible el problema si vuelve a pasar.
  const layout = fuente("app", "layout.tsx").match(/description:\s*"([^"]+)"/);
  const manifest = fuente("app", "manifest.ts").match(/description:\s*\n?\s*"([^"]+)"/);
  assert.ok(layout && manifest, "falta alguna de las dos descripciones");
  assert.equal(layout[1], manifest[1]);
});

// ============================================================================
// Bug 2 — el enlace público es SIEMPRE el dominio canónico
// ============================================================================

test("el sitio público es app.yump.ar, por https y sin barra final", () => {
  assert.equal(SITIO_PUBLICO, "https://app.yump.ar");
});

test("la url de una ficha se arma con el dominio canónico", () => {
  assert.equal(urlDeTitulo("movie", 278), "https://app.yump.ar/titulo/movie/278");
  assert.equal(urlDeTitulo("tv", 1396), "https://app.yump.ar/titulo/tv/1396");
});

test("NO depende del origen desde el que esté abierta la app", () => {
  // El caso real del bug: una PWA instalada cuando la app vivía en Vercel
  // conserva ese origen para siempre, porque el scope de una instalación es por
  // origen y no se migra.
  const previo = (globalThis as { window?: unknown }).window;
  try {
    (globalThis as { window?: unknown }).window = {
      location: { origin: `https://${DOMINIO_VIEJO}` },
    };
    assert.equal(urlDeTitulo("movie", 278), "https://app.yump.ar/titulo/movie/278");
  } finally {
    if (previo === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = previo;
  }
});

test("el mensaje que se comparte lleva la url canónica y nada del dominio viejo", () => {
  const m = mensajeCompartir({ title: "Coco", year: 2017, type: "movie", id: 354912 }, "Disney+");
  assert.equal(m.url, "https://app.yump.ar/titulo/movie/354912");
  assert.match(m.texto, /Coco/);
  assert.match(m.texto, /\(2017\)/);
  assert.match(m.texto, /Disney\+/);
  assert.doesNotMatch(`${m.texto} ${m.url}`, new RegExp(DOMINIO_VIEJO));
});

test("sin año y sin plataforma el mensaje sigue siendo legible", () => {
  const m = mensajeCompartir({ title: "Okupas", year: null, type: "tv", id: 92749 }, null);
  assert.equal(m.url, "https://app.yump.ar/titulo/tv/92749");
  assert.match(m.texto, /Okupas/);
  assert.doesNotMatch(m.texto, /\(\)|—\s*en\s*$/, "quedó un hueco de año o de plataforma");
});

test("el fallback de WhatsApp manda la misma url canónica, ya codificada", () => {
  const m = mensajeCompartir({ title: "Coco", year: 2017, type: "movie", id: 354912 }, null);
  const link = enlaceWhatsapp(m);
  assert.ok(link.startsWith("https://wa.me/?text="), `no es un link de wa.me: ${link}`);
  assert.match(link, /app\.yump\.ar%2Ftitulo%2Fmovie%2F354912/);
  assert.doesNotMatch(link, new RegExp(DOMINIO_VIEJO));
  // Lo que recibe WhatsApp, decodificado, tiene que contener la url entera.
  assert.match(decodeURIComponent(link.slice("https://wa.me/?text=".length)), /https:\/\/app\.yump\.ar\/titulo\/movie\/354912/);
});

// ============================================================================
// Que nadie vuelva a armar el enlace con el origen del navegador
// ============================================================================

// ⚠️ Comprobación sobre el TEXTO de los archivos, no sobre la app montada:
// este proyecto no tiene arnés de DOM (misma nota que `lib/legal.test.ts`).
// Fija la regresión que de verdad puede pasar: que alguien vuelva a usar
// `window.location.origin` para un enlace que sale de la app.

test("DetailView no arma el enlace compartido con el origen del navegador", () => {
  const src = fuente("components", "DetailView.tsx");
  assert.doesNotMatch(src, /window\.location\.origin/,
    "DetailView volvió a armar la url con el origen del navegador");
  assert.match(src, /from "@\/lib\/compartir"/,
    "DetailView no usa la fuente única del enlace público");
});

test("no queda ningún dominio viejo escrito a mano en el código", () => {
  for (const f of [
    path.join("components", "DetailView.tsx"),
    path.join("app", "api", "recordatorio", "route.ts"),
  ]) {
    assert.doesNotMatch(fuente(f), new RegExp(DOMINIO_VIEJO), `${f} todavía nombra el dominio viejo`);
  }
});
