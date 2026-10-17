// El cableado del acceso al dashboard: que las piezas USEN lib/admin-acceso.ts
// y que las salidas cierren lo que corresponde. Los componentes no se
// renderizan en esta suite: se lee el código fuente.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fuente = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");

test("layout de /admin: decide con decidirAccesoAdmin y NUNCA manda al Yump público", () => {
  const s = fuente("app/admin/layout.tsx");
  assert.match(s, /decidirAccesoAdmin\(\{/);
  assert.match(s, /estadoPerfil/);
  assert.ok(!/router\.(replace|push)\(\s*["']\/["']\s*\)/.test(s), "quedó una redirección a /");
  assert.match(s, /reintentarPerfil/, "un error de perfil se puede reintentar");
});

test("AuthContext: el perfil sale de crearSesionPerfil y los errores de lectura se informan", () => {
  const s = fuente("components/AuthContext.tsx");
  assert.match(s, /crearSesionPerfil<Profile>/);
  assert.match(s, /const \{ data, error \} = await supabaseBrowser\(\)/);
  assert.match(s, /if \(error\) return \{ perfil: null, error: error\.message \};/);
  // `sync` ya no espera el perfil para marcar al usuario: los dos cambian juntos.
  assert.ok(!/setProfile\(u \? await loadProfile/.test(s));
});

test("login: navega cuando el contexto tiene al usuario, al destino validado", () => {
  const s = fuente("app/admin/login/page.tsx");
  assert.match(s, /if \(ready && user\) router\.replace\(destino\);/);
  assert.match(s, /destinoSeguro\(new URLSearchParams\(window\.location\.search\)\.get\("destino"\)\)/);
  assert.ok(!/router\.push\("\/admin"\)/.test(s), "volvía siempre a /admin");
});

test("MFA: al completarse vuelve al destino validado, no siempre a /admin", () => {
  const s = fuente("app/admin/mfa/page.tsx");
  assert.match(s, /router\.replace\(destinoSeguro\(/);
  assert.ok(!/router\.replace\("\/admin"\)/.test(s));
});

test("salidas habituales: cierran SÓLO la sesión actual (scope local)", () => {
  for (const ruta of ["components/AuthContext.tsx", "app/admin/layout.tsx", "app/admin/page.tsx"]) {
    const s = fuente(ruta);
    assert.match(s, /auth\.signOut\(\{ scope: "local" \}\)/, ruta);
    assert.ok(!/auth\.signOut\(\)/.test(s), `${ruta}: quedó un signOut sin scope (global)`);
  }
});

test("eliminación de cuenta: sus cierres de sesión NO se tocaron", () => {
  // Después de borrar la cuenta, el cierre es el de siempre: la cuenta ya no
  // existe y no hay ninguna sesión que conservar.
  assert.match(fuente("components/cuenta/EliminarCuenta.tsx"), /await sb\.auth\.signOut\(\)\.catch\(/);
  // La revalidación de contraseña del servidor cierra la sesión que acaba de crear.
  assert.match(fuente("lib/eliminar-cuenta.ts"), /await sb\.auth\.signOut\(\);/);
});
