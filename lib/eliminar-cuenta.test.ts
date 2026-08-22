import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAVES_CONSERVADAS, CLAVES_PERSONALES, clavesABorrar, esPersonal, esSesionSupabase,
} from "./limpieza-local.ts";
import {
  MAX_INTENTOS, VENTANA_MS, bloqueado, minutosRestantes, registrarFallo,
} from "./intentos-eliminar.ts";

// ============================================================================
// LIMPIEZA LOCAL — qué se va con la cuenta y qué se queda en el dispositivo
// ============================================================================

test("las plataformas SE CONSERVAN: la persona sigue como invitada", () => {
  // El criterio de producto. Borrarlas la obligaría a reconfigurar todo, que es
  // castigarla por irse.
  assert.equal(esPersonal("sc:platforms"), false);
  assert.deepEqual(clavesABorrar(["sc:platforms"]), []);
});

test("las preferencias del dispositivo se conservan", () => {
  for (const k of CLAVES_CONSERVADAS) {
    assert.equal(esPersonal(k), false, k);
  }
  assert.deepEqual(clavesABorrar([...CLAVES_CONSERVADAS]), []);
});

test("el estado personal se borra", () => {
  for (const k of CLAVES_PERSONALES) {
    assert.equal(esPersonal(k), true, k);
  }
  assert.equal(clavesABorrar([...CLAVES_PERSONALES]).length, CLAVES_PERSONALES.length);
});

test("lo que la ruleta ya te mostró es PERSONAL, aunque parezca paginación", () => {
  // El caso menos obvio: es historial de uso de esa cuenta, no una preferencia.
  assert.equal(esPersonal("yump:ruleta-mostrados"), true);
});

test("la sesión de Supabase se borra aunque su clave dependa del proyecto", () => {
  assert.equal(esSesionSupabase("sb-abcdefgh-auth-token"), true);
  assert.equal(esSesionSupabase("sb-otroproyecto-auth-token"), true);
  assert.equal(esSesionSupabase("sc:platforms"), false);
  assert.equal(esSesionSupabase("sb-algo-otracosa"), false);
});

test("una mezcla real deja exactamente lo que corresponde", () => {
  const presentes = [
    "sc:platforms", "sc:theme", "sc:pais", "sc:visits", "yump:shelf-type",
    "yump:ruleta-mostrados", "yump:hero-estado", "yump:lista-paginada",
    "yump:lista-vuelta", "yump:track-scroll", "sb-xyz-auth-token",
    "otra-cosa-de-otra-app",
  ];
  const borrar = clavesABorrar(presentes);
  assert.deepEqual(borrar.sort(), [
    "sb-xyz-auth-token", "yump:hero-estado", "yump:lista-paginada",
    "yump:lista-vuelta", "yump:ruleta-mostrados", "yump:track-scroll",
  ].sort());
  assert.ok(!borrar.includes("otra-cosa-de-otra-app"), "no se toca lo que no es nuestro");
});

test("con el storage vacío no rompe", () => {
  assert.deepEqual(clavesABorrar([]), []);
});

// ============================================================================
// LÍMITE DE INTENTOS
// ============================================================================

const T0 = 1_000_000;

test("sin intentos previos no hay bloqueo", () => {
  assert.equal(bloqueado(null, T0), false);
});

test("bloquea recién al llegar al máximo", () => {
  let i = null as ReturnType<typeof registrarFallo> | null;
  for (let n = 1; n < MAX_INTENTOS; n++) {
    i = registrarFallo(i, T0);
    assert.equal(bloqueado(i, T0), false, `${n} fallos todavía no bloquean`);
  }
  i = registrarFallo(i, T0);
  assert.equal(bloqueado(i, T0), true, `${MAX_INTENTOS} fallos bloquean`);
});

test("la ventana corre desde el PRIMER fallo, no desde el último", () => {
  // Si corriera desde el último, cinco intentos espaciados reabrirían el cupo
  // indefinidamente y el límite no serviría de nada.
  let i = registrarFallo(null, T0);
  for (let n = 0; n < 4; n++) i = registrarFallo(i, T0 + n * 60_000);
  assert.equal(i.desde, T0, "la tanda sigue anclada al primero");
  assert.equal(bloqueado(i, T0 + 4 * 60_000), true);
});

test("pasada la ventana, se empieza de cero", () => {
  let i = null as ReturnType<typeof registrarFallo> | null;
  for (let n = 0; n < MAX_INTENTOS; n++) i = registrarFallo(i, T0);
  assert.equal(bloqueado(i, T0 + VENTANA_MS + 1), false);
  const nuevo = registrarFallo(i, T0 + VENTANA_MS + 1);
  assert.equal(nuevo.fallidos, 1, "la tanda vieja no se arrastra");
});

test("dice cuántos minutos faltan, no solo que está bloqueado", () => {
  let i = null as ReturnType<typeof registrarFallo> | null;
  for (let n = 0; n < MAX_INTENTOS; n++) i = registrarFallo(i, T0);
  assert.equal(minutosRestantes(i, T0), 15);
  assert.equal(minutosRestantes(i, T0 + 14 * 60_000), 1);
  assert.equal(minutosRestantes(null, T0), 0, "sin bloqueo, no hay espera");
});

test("nunca dice 0 minutos estando bloqueado", () => {
  // Un "probá en 0 minutos" es peor que no decir nada.
  let i = null as ReturnType<typeof registrarFallo> | null;
  for (let n = 0; n < MAX_INTENTOS; n++) i = registrarFallo(i, T0);
  assert.equal(minutosRestantes(i, T0 + VENTANA_MS - 1), 1);
});
