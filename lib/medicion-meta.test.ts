// Los textos que el dueño fijó el 30/10/2026: el aviso del registro y la opción
// de Meta en Sobre Yump. La parte nativa la vigila lib/meta-sdk.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AVISO_REGISTRO } from "./legal.ts";
import { MEDICION_META, hayMedicionMeta, leerMedicionMeta, cambiarMedicionMeta } from "./medicion-meta.ts";

const leer = (rel: string) => readFileSync(new URL("../" + rel, import.meta.url), "utf8");

test("el aviso del registro dice exactamente lo acordado y enlaza las dos páginas", () => {
  const a = AVISO_REGISTRO;
  assert.equal(
    a.ANTES + a.TERMINOS.texto + a.ENTRE + a.PRIVACIDAD.texto + a.DESPUES,
    "Al continuar, aceptás nuestros Términos y Condiciones y la Política de Privacidad sobre el uso de datos para medición y mejora de la app.",
  );
  assert.equal(a.TERMINOS.href, "https://yump.ar/terminos/");
  assert.equal(a.PRIVACIDAD.href, "https://yump.ar/privacidad/");
});

test("el aviso va sólo en el registro y con el mecanismo de enlaces externos", () => {
  const pagina = leer("app/cuenta/page.tsx");
  assert.match(pagina, /\{esRegistro && \(\s*<p className="aviso-registro">/);
  const enlaces = pagina.match(/<a href=\{AVISO_REGISTRO\.(TERMINOS|PRIVACIDAD)\.href\} target="_blank" rel="noopener noreferrer">/g) ?? [];
  assert.equal(enlaces.length, 2);
});

test("la opción de Meta: título y explicación acordados", () => {
  assert.equal(MEDICION_META.TITULO, "Medición de campañas con Meta");
  assert.equal(
    MEDICION_META.EXPLICACION,
    "Permite medir instalaciones y aperturas relacionadas con nuestras campañas de Facebook e Instagram. Podés desactivarla sin afectar el funcionamiento de Yump.",
  );
});

test("🔴 la opción está en Sobre Yump, fuera de toda condición de sesión", () => {
  // Sobre Yump se monta también en /cuenta sin sesión: ahí tiene que poder
  // desactivarse sin cuenta.
  const sy = leer("components/legal/SobreYump.tsx");
  assert.match(sy, /<MedicionMetaOpcion \/>/);
  assert.doesNotMatch(sy, /useAuth|user\b/);
  const cuenta = leer("app/cuenta/page.tsx");
  assert.match(cuenta, /\)\}\s*\{\/\*[\s\S]*?\*\/\}\s*<div className="admin" style=\{\{ maxWidth: 480 \}\}>\s*<SobreYump \/>/);
});

test("en la web no hay SDK de Meta: la opción no aparece y no se llama al puente", async () => {
  assert.equal(hayMedicionMeta(false), false);
  assert.equal(hayMedicionMeta(true), true);
  // En este proceso ES_NATIVO es false: no intenta cargar @capacitor/core.
  assert.equal(await leerMedicionMeta(), null);
  assert.equal(await cambiarMedicionMeta(false), null);
});
