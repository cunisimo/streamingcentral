// `/t` y `/p` no se indexan.
//
// ============================================================================
// POR QUÉ, Y POR QUÉ NO ES CANONICAL
// ============================================================================
// `/t` y `/p` existen sólo para el contenedor: el export estático no puede
// enumerar `/titulo/[tipo]/[id]` ni `/persona/[id]`, que cubren todo TMDB. En la
// web **nadie las enlaza** —`hrefTitulo` sigue devolviendo `/titulo/movie/278`—
// pero se despliegan igual porque el build es uno solo.
//
// El riesgo es que un buscador las descubra y las trate como una segunda versión
// del mismo contenido. Decisión del dueño: **`noindex`, no `canonical`**.
// Un canonical le pediría a Google que consolide señales hacia `/titulo/...`, y
// eso sólo tiene sentido si la página es una alternativa legítima que se quiere
// servir; acá no lo es. `noindex` dice lo que realmente pasa: esta URL no es para
// la web.
//
// 🔴 SE VERIFICA EL HTML GENERADO, NO EL CÓDIGO. Un `export const metadata` en un
// archivo no prueba que Next lo emita: `/t` y `/p` eran Client Components, y un
// componente de cliente NO puede exportar metadata. El test de código pasaría y
// el `<meta>` no existiría.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");
const existe = (p: string) => fs.existsSync(path.join(raiz, p));

/** El `<meta name="robots">` que emitió Next, o null. */
function robotsDe(html: string): string | null {
  const m = /<meta name="robots" content="([^"]*)"/.exec(html);
  return m ? m[1] : null;
}

// --------------------------------------------------- 1. estructura del código

test("`/t` y `/p` pueden declarar metadata: la página NO es de cliente", () => {
  // `"use client"` en el page hace imposible exportar `metadata`. La parte que
  // lee la query tiene que vivir en un hijo.
  for (const f of ["app/t/page.tsx", "app/p/page.tsx"]) {
    const src = leer(f);
    assert.doesNotMatch(src, /^"use client"/, `${f} es de cliente: no puede exportar metadata`);
    assert.match(src, /export const metadata/, `${f} no declara metadata`);
    assert.match(src, /index:\s*false/, `${f} no declara noindex`);
  }
});

test("no se agregó canonical: la decisión fue noindex", () => {
  // Sin comentarios: los dos archivos EXPLICAN por qué no usan canonical, y esa
  // explicación no puede hacer fallar al guard que vigila que no se use.
  for (const f of ["app/t/page.tsx", "app/p/page.tsx"]) {
    const codigo = leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ 	]*\/\/.*$/gm, "");
    assert.doesNotMatch(codigo, /canonical/, `${f} declara canonical, y la decisión fue noindex`);
  }
});

// ------------------------------------------------ 2. el HTML que Next emitió

test("el HTML de `/t` y `/p` lleva robots noindex", { skip: !existe(".next/server/app/t.html") }, () => {
  for (const f of [".next/server/app/t.html", ".next/server/app/p.html"]) {
    const r = robotsDe(leer(f));
    assert.ok(r, `${f} no emitió <meta name="robots">`);
    assert.match(r!, /noindex/, `${f} emitió robots="${r}" y falta noindex`);
  }
});

test("las rutas públicas NO se marcaron noindex por arrastre", { skip: !existe(".next/server/app/t.html") }, () => {
  // El riesgo real de este cambio: que el noindex se filtre al layout y se lleve
  // puesta media app. Se comprueba contra páginas que sí tienen que indexarse.
  for (const f of ["index.html", "top.html", "buscar.html", "proximamente.html"]) {
    const p = path.join(".next/server/app", f);
    if (!existe(p)) continue;
    const r = robotsDe(leer(p));
    assert.ok(r === null || !/noindex/.test(r), `${f} quedó con robots="${r}"`);
  }
});

// ---------------------------------------- 3. el artefacto nativo no se rompió

test("en el artefacto nativo `/t/` y `/p/` siguen presentes", { skip: !existe("out-capacitor/t/index.html") }, () => {
  for (const f of ["out-capacitor/t/index.html", "out-capacitor/p/index.html"]) {
    const html = leer(f);
    assert.ok(html.length > 2000, `${f} quedó vacío: el noindex rompió el export`);
    // El fallback del Suspense tiene que seguir viajando en el HTML: es lo que
    // se ve hasta que hidrata.
    assert.match(html, /<body/, `${f} no parece una página completa`);
  }
});
