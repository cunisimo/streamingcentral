// Acceso al dashboard /admin (informe del dueño, 17/10): "al abrir /admin/top
// muchas veces termino en el Yump público", también en incógnito.
//
// La causa: `ready` llegaba antes que el perfil y el layout trataba "perfil
// todavía no cargado" igual que "no es administrador" → `router.replace("/")`.
// Además la lectura del perfil no distinguía un error de "sin permisos", las
// respuestas fuera de orden podían pisar a la cuenta actual y el login siempre
// volvía a /admin, perdiendo /admin/top.
//
// Las lecturas de perfil son promesas CONTROLADAS: el test decide cuándo y cómo
// responde Supabase.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conDestino, crearSesionPerfil, decidirAccesoAdmin, destinoSeguro,
  type EntradaAcceso, type LecturaPerfil,
} from "./admin-acceso.ts";

type Perfil = { id: string; is_admin: boolean };
const tick = () => new Promise((r) => setImmediate(r));

const base: EntradaAcceso = { ready: true, usuario: true, estadoPerfil: "listo", esAdmin: true, mfa: "listo", ruta: "/admin/top" };
const decidir = (cambios: Partial<EntradaAcceso>) => decidirAccesoAdmin({ ...base, ...cambios });

// --- La decisión del layout ---------------------------------------------------

test("entrada directa a /admin/top con el perfil todavía cargando: ESPERA, no manda al Yump público", () => {
  const a = decidir({ estadoPerfil: "pendiente", esAdmin: false });
  assert.deepEqual(a, { tipo: "esperar", motivo: "perfil" });
});

test("error al leer el perfil: no concede acceso ni redirige; muestra el error para reintentar", () => {
  assert.deepEqual(decidir({ estadoPerfil: "error", esAdmin: false }), { tipo: "error-perfil" });
  // Ni aunque el estado anterior dijera admin: un error nunca da acceso.
  assert.deepEqual(decidir({ estadoPerfil: "error", esAdmin: true }), { tipo: "error-perfil" });
});

test("cuenta sin permisos (perfil leído, is_admin falso): sin acceso, con su mensaje", () => {
  assert.deepEqual(decidir({ esAdmin: false }), { tipo: "sin-permisos" });
});

test("sin sesión en /admin/top: va al login CONSERVANDO el destino", () => {
  assert.deepEqual(decidir({ usuario: false, esAdmin: false }), { tipo: "ir", a: "/admin/login?destino=%2Fadmin%2Ftop" });
});

test("admin sin la sesión elevada: va al MFA conservando el destino", () => {
  assert.deepEqual(decidir({ mfa: "falta-verificar" }), { tipo: "ir", a: "/admin/mfa?destino=%2Fadmin%2Ftop" });
  assert.deepEqual(decidir({ mfa: "falta-respaldo" }), { tipo: "ir", a: "/admin/mfa?destino=%2Fadmin%2Ftop" });
  assert.deepEqual(decidir({ mfa: "cargando" }), { tipo: "esperar", motivo: "mfa" });
});

test("en la página del MFA con el perfil pendiente también espera", () => {
  assert.deepEqual(decidir({ ruta: "/admin/mfa", estadoPerfil: "pendiente", esAdmin: false }), { tipo: "esperar", motivo: "perfil" });
});

test("admin con MFA completo: muestra el panel", () => {
  assert.deepEqual(decidir({}), { tipo: "mostrar" });
});

// --- El destino ---------------------------------------------------------------

test("destino seguro: sólo rutas del panel; nada externo ni las pantallas de entrada", () => {
  assert.equal(destinoSeguro("/admin/top"), "/admin/top");
  assert.equal(destinoSeguro("/admin"), "/admin");
  assert.equal(destinoSeguro("/admin/resena/123"), "/admin/resena/123");
  for (const malo of [null, undefined, "", "/", "/cuenta", "https://evil.example/admin", "//evil.example/admin",
    "/admin/login", "/admin/mfa", "/admin/login?destino=/admin", "/admin\\..\\x", "/adminx", "/admin/../cuenta"]) {
    assert.equal(destinoSeguro(malo), "/admin", `aceptó ${String(malo)}`);
  }
  assert.equal(conDestino("/admin/login", "/admin/top"), "/admin/login?destino=%2Fadmin%2Ftop");
  assert.equal(conDestino("/admin/mfa", "/admin"), "/admin/mfa");
});

// --- La carga del perfil --------------------------------------------------------

function lecturas() {
  const pendientes = new Map<string, (r: LecturaPerfil<Perfil>) => void>();
  const leer = (userId: string) => new Promise<LecturaPerfil<Perfil>>((fin) => { pendientes.set(userId, fin); });
  const responder = (userId: string, r: LecturaPerfil<Perfil>) => { pendientes.get(userId)!(r); pendientes.delete(userId); };
  return { leer, responder };
}

test("perfil lento: mientras Supabase no responde el estado es PENDIENTE, no 'sin perfil'", async () => {
  const l = lecturas();
  const s = crearSesionPerfil<Perfil>(l.leer, () => {});
  const p = s.cambio("A");
  assert.equal(s.estado().estadoPerfil, "pendiente");
  assert.equal(s.estado().userId, "A");
  l.responder("A", { perfil: { id: "A", is_admin: true }, error: null });
  await p;
  assert.deepEqual(s.estado(), { userId: "A", estadoPerfil: "listo", perfil: { id: "A", is_admin: true } });
});

test("error de lectura: queda en ERROR (no 'sin permisos') y reintentar lo resuelve", async () => {
  const l = lecturas();
  const s = crearSesionPerfil<Perfil>(l.leer, () => {});
  const p = s.cambio("A");
  l.responder("A", { perfil: null, error: "fetch failed" });
  await p;
  assert.deepEqual(s.estado(), { userId: "A", estadoPerfil: "error", perfil: null });
  const r = s.reintentar();
  assert.equal(s.estado().estadoPerfil, "pendiente");
  l.responder("A", { perfil: { id: "A", is_admin: true }, error: null });
  await r;
  assert.equal(s.estado().estadoPerfil, "listo");
  assert.equal(s.estado().perfil?.is_admin, true);
});

test("cambio de cuenta con respuestas fuera de orden: gana la cuenta ACTUAL", async () => {
  const l = lecturas();
  const s = crearSesionPerfil<Perfil>(l.leer, () => {});
  const pa = s.cambio("A");                    // A pide su perfil (lento)…
  const pb = s.cambio("B");                    // …y la sesión ya es de B
  l.responder("B", { perfil: { id: "B", is_admin: false }, error: null });
  await pb;
  l.responder("A", { perfil: { id: "A", is_admin: true }, error: null }); // A llega TARDE
  await pa;
  assert.deepEqual(s.estado(), { userId: "B", estadoPerfil: "listo", perfil: { id: "B", is_admin: false } });
});

test("cerrar sesión con la lectura en vuelo: la respuesta tardía no revive el perfil", async () => {
  const l = lecturas();
  const s = crearSesionPerfil<Perfil>(l.leer, () => {});
  const pa = s.cambio("A");
  await s.cambio(null);
  l.responder("A", { perfil: { id: "A", is_admin: true }, error: null });
  await pa;
  assert.deepEqual(s.estado(), { userId: null, estadoPerfil: "listo", perfil: null });
});

test("el mismo usuario dos veces (INITIAL_SESSION + TOKEN_REFRESHED): no vuelve a 'pendiente' si ya está listo", async () => {
  const l = lecturas();
  const s = crearSesionPerfil<Perfil>(l.leer, () => {});
  const p = s.cambio("A");
  l.responder("A", { perfil: { id: "A", is_admin: true }, error: null });
  await p;
  const p2 = s.cambio("A");
  assert.equal(s.estado().estadoPerfil, "listo", "un refresco de token no puede sacar al admin del panel");
  await tick();
  l.responder("A", { perfil: { id: "A", is_admin: true }, error: null });
  await p2;
  assert.equal(s.estado().estadoPerfil, "listo");
});

// --- Recorrido completo: login → perfil → MFA → /admin/top ----------------------

test("login + MFA conservan /admin/top y ningún paso intermedio manda al Yump público", async () => {
  const l = lecturas();
  const s = crearSesionPerfil<Perfil>(l.leer, () => {});
  const pasos: string[] = [];
  const ver = (ruta: string, mfa: EntradaAcceso["mfa"]) => {
    const e = s.estado();
    const a = decidirAccesoAdmin({ ready: true, usuario: !!e.userId, estadoPerfil: e.estadoPerfil, esAdmin: !!e.perfil?.is_admin, mfa, ruta });
    pasos.push(a.tipo === "ir" ? `ir ${a.a}` : a.tipo);
    return a;
  };
  // 1. Entrada directa sin sesión.
  const a1 = ver("/admin/top", "sin-factor");
  assert.deepEqual(a1, { tipo: "ir", a: "/admin/login?destino=%2Fadmin%2Ftop" });
  // 2. Login: SIGNED_IN llega, el login navega al destino guardado.
  const p = s.cambio("A");
  const destino = destinoSeguro(new URLSearchParams("destino=%2Fadmin%2Ftop").get("destino"));
  assert.equal(destino, "/admin/top");
  ver(destino, "cargando");                       // perfil pendiente
  // 3. Llega el perfil de admin; la sesión es aal1 → MFA con destino.
  l.responder("A", { perfil: { id: "A", is_admin: true }, error: null });
  await p;
  const a3 = ver(destino, "falta-verificar");
  assert.deepEqual(a3, { tipo: "ir", a: "/admin/mfa?destino=%2Fadmin%2Ftop" });
  // 4. Verificado el TOTP, la página del MFA vuelve al destino.
  const tras = destinoSeguro(new URLSearchParams("destino=%2Fadmin%2Ftop").get("destino"));
  assert.equal(ver(tras, "listo").tipo, "mostrar");
  assert.ok(!pasos.includes("ir /"), `algún paso mandó al Yump público: ${pasos.join(" → ")}`);
  assert.deepEqual(pasos, ["ir /admin/login?destino=%2Fadmin%2Ftop", "esperar", "ir /admin/mfa?destino=%2Fadmin%2Ftop", "mostrar"]);
});
