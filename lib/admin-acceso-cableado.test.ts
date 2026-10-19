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
  assert.match(s, /if \(ready && user\) router\.replace\(destinoPedido\(\)\);/);
  assert.match(s, /destinoSeguro\(new URLSearchParams\(window\.location\.search\)\.get\("destino"\)\)/);
  assert.ok(!/router\.push\("\/admin"\)/.test(s), "volvía siempre a /admin");
});

// Prueba manual del dueño (19/10): entrando por /admin/top terminaba en /admin.
// En una navegación interna del App Router la página nueva se DIBUJA antes de
// que Next actualice la barra: leer `window.location` al dibujar (por ejemplo
// en el inicializador de `useState`) ve la URL ANTERIOR, sin `?destino`. Hay
// que leerla en un efecto, que corre con la barra ya actualizada.
test("login y MFA: el destino se lee de la barra en un EFECTO, nunca al dibujar", () => {
  const login = fuente("app/admin/login/page.tsx");
  assert.ok(!/useState\(destinoPedido\)/.test(login), "el login calculaba el destino al dibujar, con la URL anterior");
  assert.ok(!/useState\([^)]*window\.location/.test(login));
  const efecto = login.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
  assert.ok(efecto.some((e) => /destinoPedido\(\)/.test(e)), "el destino tiene que leerse dentro del efecto que navega");
  const mfa = fuente("app/admin/mfa/page.tsx");
  const efectoMfa = mfa.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
  assert.ok(efectoMfa.some((e) => /window\.location\.search/.test(e)), "el MFA lee el destino en su efecto");
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
