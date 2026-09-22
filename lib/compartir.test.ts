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
import { SITIO_PUBLICO, urlDeTitulo, mensajeCompartir, mensajeMatch, enlaceWhatsapp } from "./compartir.ts";

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

test("el ejemplo de entorno documenta el dominio canónico como el de producción", () => {
  // No es cosmético: este archivo es lo que alguien copia para configurar el
  // proyecto. Documentaba el dominio ANTERIOR como "la URL real", así que la
  // próxima persona que siguiera las instrucciones volvía a dejar
  // `NEXT_PUBLIC_SITE_URL` apuntando al dominio viejo — y de ahí sale el mail
  // de recuperación de contraseña.
  const src = fuente(".env.local.example");
  const bloque = src.slice(src.indexOf("URL pública del sitio"), src.indexOf("NEXT_PUBLIC_SITE_URL="));
  assert.ok(bloque.length > 0, "no se encontró el bloque de NEXT_PUBLIC_SITE_URL");
  assert.match(bloque, /https:\/\/app\.yump\.ar/,
    "el ejemplo no documenta el dominio canónico");
  // El dominio viejo puede seguir NOMBRADO, pero sólo como advertencia: nunca
  // presentado como el valor a usar.
  assert.doesNotMatch(bloque, /real \(https:\/\/streamingcentral\.vercel\.app\)/,
    "el ejemplo todavía presenta el dominio viejo como la URL real");
});

test("no queda ningún dominio viejo escrito a mano en el código", () => {
  for (const f of [
    path.join("components", "DetailView.tsx"),
    path.join("app", "api", "recordatorio", "route.ts"),
  ]) {
    assert.doesNotMatch(fuente(f), new RegExp(DOMINIO_VIEJO), `${f} todavía nombra el dominio viejo`);
  }
});

// --- Etapa 5: el mensaje propio de Pelimatch --------------------------------
// El texto lo fija el plan (Tarea 5.1) y es distinto del de la ficha: acá se
// comparte un MATCH, no un descubrimiento suelto.

test("mensajeMatch arma el texto exacto del plan y la url canónica", () => {
  const m = mensajeMatch({ title: "Seven", type: "movie", id: 807 }, ["Netflix", "Max"]);
  assert.equal(m.texto, "¡Nuestro match!\nDisponible en Netflix, Max\nVer ficha en Yump:");
  assert.equal(m.url, "https://app.yump.ar/titulo/movie/807");
  assert.equal(m.titulo, "Seven");
});

test("sin plataformas, el mensaje no queda con un 'Disponible en' vacío", () => {
  const m = mensajeMatch({ title: "Seven", type: "movie", id: 807 }, []);
  assert.ok(!/Disponible en\s*$/m.test(m.texto), m.texto);
  assert.equal(m.texto, "¡Nuestro match!\nVer ficha en Yump:");
  assert.equal(m.url, "https://app.yump.ar/titulo/movie/807");
});

test("una serie usa /titulo/tv/<id>", () => {
  assert.equal(mensajeMatch({ title: "X", type: "tv", id: 1 }, ["Netflix"]).url, "https://app.yump.ar/titulo/tv/1");
});

test("el mensaje del match NUNCA sale del dominio canónico", () => {
  const m = mensajeMatch({ title: "X", type: "movie", id: 1 }, ["Netflix"]);
  assert.ok(m.url.startsWith(SITIO_PUBLICO + "/"));
  assert.ok(!m.url.includes(DOMINIO_VIEJO));
});

// --- La acción de compartir, compartida con la ficha ------------------------

test("compartir: en nativo usa el plugin; si falla, cae a WhatsApp", async () => {
  const { compartir } = await import("./compartir-accion.ts");
  const m = mensajeMatch({ title: "Seven", type: "movie", id: 807 }, ["Netflix"]);
  const log: string[] = [];
  await compartir(m, {
    esNativo: true,
    plugin: async () => { log.push("plugin"); },
    abrir: (u) => log.push("abrir " + u.slice(0, 20)),
  });
  assert.deepEqual(log, ["plugin"]);
  log.length = 0;
  await compartir(m, {
    esNativo: true,
    plugin: async () => { throw new Error("sin plugin"); },
    abrir: (u) => log.push("abrir " + u.slice(0, 20)),
  });
  assert.deepEqual(log, ["abrir https://wa.me/?text="]);
});

test("compartir: en web usa navigator.share si existe", async () => {
  const { compartir } = await import("./compartir-accion.ts");
  const m = mensajeMatch({ title: "Seven", type: "movie", id: 807 }, ["Netflix"]);
  const log: string[] = [];
  await compartir(m, {
    esNativo: false,
    share: async (d) => { log.push(`share ${d.title} | ${d.url}`); },
    abrir: () => log.push("abrir"),
  });
  assert.deepEqual(log, ["share Seven | https://app.yump.ar/titulo/movie/807"]);
});

test("compartir: sin navigator.share cae a WhatsApp con texto y url", async () => {
  const { compartir } = await import("./compartir-accion.ts");
  const m = mensajeMatch({ title: "Seven", type: "movie", id: 807 }, ["Netflix"]);
  let abierta = "";
  await compartir(m, { esNativo: false, share: undefined, abrir: (u) => { abierta = u; } });
  assert.equal(abierta, enlaceWhatsapp(m));
  assert.ok(decodeURIComponent(abierta).includes("¡Nuestro match!"));
});

test("compartir: cancelar la hoja (AbortError) NO abre WhatsApp; otro error sí", async () => {
  const { compartir } = await import("./compartir-accion.ts");
  const m = mensajeMatch({ title: "X", type: "movie", id: 1 }, []);
  let abrio = 0;
  const abortar = Object.assign(new Error("cancelado"), { name: "AbortError" });
  await compartir(m, { esNativo: false, share: async () => { throw abortar; }, abrir: () => { abrio++; } });
  assert.equal(abrio, 0, "cancelar es una decisión del usuario");
  await compartir(m, { esNativo: false, share: async () => { throw new Error("otra cosa"); }, abrir: () => { abrio++; } });
  assert.equal(abrio, 1);
});

test("DetailView usa la acción compartida y NO rearma el comportamiento", () => {
  const src = fuente("components", "DetailView.tsx");
  assert.match(src, /from "@\/lib\/compartir-accion"/);
  assert.match(src, /compartirMensaje\(mensajeCompartir\(/, "arma el mensaje de la ficha y delega la acción");
  assert.ok(!/@capacitor\/share/.test(src), "el plugin ahora vive en la acción");
  assert.ok(!/navigator\.share/.test(src), "idem navigator.share");
  const sala = fuente("components", "sala", "CompartirMatch.tsx");
  assert.match(sala, /mensajeMatch/);
  assert.match(sala, /from "@\/lib\/compartir-accion"/);
});

// --- Tarea 5.2: metadata de la ficha ----------------------------------------

test("la ficha exporta generateMetadata y revalida cada 6 h", () => {
  const src = fuente("app", "titulo", "[tipo]", "[id]", "page.tsx");
  assert.match(src, /export const revalidate = 21600/);
  assert.match(src, /export async function generateMetadata/);
  assert.match(src, /openGraph/);
  assert.match(src, /twitter/);
  assert.match(src, /metadataBase/);
  assert.match(src, /urlDeTitulo\(/, "la url canónica sale de lib/compartir.ts");
  assert.ok(!/window\.location/.test(src));
});
