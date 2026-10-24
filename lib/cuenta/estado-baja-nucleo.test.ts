import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESTADO_INICIAL, TEXTO_PENDIENTE, alResponder, consultar, mensajeEliminar, trasIntento, type EstadoBaja,
} from "./estado-baja-nucleo.ts";

const ok = (cuerpo: unknown) => ({ status: 200, cuerpo });

test("con marcador, la pantalla queda en 'pendiente'; sin marcador, 'sin-baja'", () => {
  const c = consultar(ESTADO_INICIAL, "u-1");
  assert.equal(c.fase, "consultando");
  assert.equal(alResponder(c, c.gen, "u-1", ok({ pendiente: true, intentos: 1 })).fase, "pendiente");
  assert.equal(alResponder(c, c.gen, "u-1", ok({ pendiente: false })).fase, "sin-baja");
});

test("un error de la consulta NUNCA se lee como 'no hay baja pendiente'", () => {
  const c = consultar(ESTADO_INICIAL, "u-1");
  for (const r of ["sin-red", { status: 503, cuerpo: { error: "no-disponible" } }, { status: 401, cuerpo: {} },
    ok({}), ok(null), ok({ pendiente: "no" })] as const) {
    assert.equal(alResponder(c, c.gen, "u-1", r).fase, "error", JSON.stringify(r));
  }
});

test("la respuesta de OTRA cuenta se descarta (cambio de cuenta en el medio)", () => {
  const a = consultar(ESTADO_INICIAL, "u-a");
  const b = consultar(a, "u-b");               // la persona cambió de cuenta
  const tarde = alResponder(b, a.gen, "u-a", ok({ pendiente: true }));
  assert.deepEqual(tarde, b, "el pendiente de u-a no aparece en u-b");
  assert.equal(alResponder(b, b.gen, "u-b", ok({ pendiente: false })).fase, "sin-baja");
});

test("una respuesta vieja de la MISMA cuenta tampoco pisa a la nueva", () => {
  const c1 = consultar(ESTADO_INICIAL, "u-1");
  const c2 = consultar(c1, "u-1");
  assert.deepEqual(alResponder(c2, c1.gen, "u-1", ok({ pendiente: true })), c2);
});

test("cerrar sesión limpia el estado y descarta lo que estaba en camino", () => {
  const c = consultar(ESTADO_INICIAL, "u-1");
  const fuera = consultar(c, null);
  assert.equal(fuera.fase, "sin-sesion");
  assert.deepEqual(alResponder(fuera, c.gen, "u-1", ok({ pendiente: true })), fuera);
});

test("tras un intento parcial o sin verificar, pasa a pendiente sin otra consulta", () => {
  const c = alResponder(consultar(ESTADO_INICIAL, "u-1"), 1, "u-1", ok({ pendiente: false }));
  assert.equal(trasIntento(c, "u-1", "baja-parcial").fase, "pendiente");
  assert.equal(trasIntento(c, "u-1", "baja-sin-verificar").fase, "pendiente");
  for (const codigo of ["password-invalida", "no-se-pudo", "demasiados-intentos", "sin-sesion", undefined]) {
    assert.deepEqual(trasIntento(c, "u-1", codigo), c, String(codigo));
  }
  assert.deepEqual(trasIntento(c, "otra", "baja-parcial"), c, "no se aplica a otra cuenta");
  const sin: EstadoBaja = consultar(c, null);
  assert.deepEqual(trasIntento(sin, "u-1", "baja-parcial"), sin);
});

test("los textos del contrato, literales", () => {
  assert.equal(mensajeEliminar("baja-parcial"), "Borramos tus datos de comunidad, pero no pudimos eliminar la cuenta. Probá de nuevo.");
  assert.equal(mensajeEliminar("baja-sin-verificar"), "No pudimos verificar si tu cuenta se eliminó. Probá de nuevo.");
  assert.equal(TEXTO_PENDIENTE.titulo, "Eliminación pendiente");
  // Ninguno de los dos dice que la cuenta se eliminó.
  for (const c of ["baja-parcial", "baja-sin-verificar"]) assert.ok(!/se elimin[óo] tu cuenta|cuenta eliminada/i.test(mensajeEliminar(c)));
});

test("los textos de antes no cambiaron", () => {
  assert.equal(mensajeEliminar("password-invalida"), "La contraseña no es correcta.");
  assert.equal(mensajeEliminar("demasiados-intentos", 1), "Demasiados intentos. Probá de nuevo en 1 minuto.");
  assert.equal(mensajeEliminar("demasiados-intentos", 7), "Demasiados intentos. Probá de nuevo en 7 minutos.");
  assert.equal(mensajeEliminar("demasiados-intentos"), "Demasiados intentos. Probá de nuevo en 15 minutos.");
  assert.equal(mensajeEliminar("sin-sesion"), "Se cerró tu sesión. Volvé a entrar e intentá de nuevo.");
  assert.equal(mensajeEliminar("no-se-pudo"), "No pudimos eliminar la cuenta. Probá de nuevo en un rato.");
});
