// Los errores de las RPC y de la ruta de preparación, traducidos (Tarea 3.3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { codigoDe, mensajeDeError, mensajeDePreparar, GENERICO, SIN_RED } from "./mensajes.ts";

test("codigoDe reconoce el código al principio, con o sin detalle; lo desconocido es null", () => {
  assert.equal(codigoDe("sala_llena"), "sala_llena");
  assert.equal(codigoDe("sala_plataforma_desconocida: zz,yy"), "sala_plataforma_desconocida");
  assert.equal(codigoDe("  sala_no_admite_ingresos"), "sala_no_admite_ingresos");
  assert.equal(codigoDe("sala_inventado"), null);
  assert.equal(codigoDe("permission denied for function sala_barrido"), null);
  assert.equal(codigoDe(null), null);
});

test("cada código conocido tiene texto propio, distinto del genérico y en castellano", () => {
  const codigos = ["sala_sin_sesion", "sala_desactivadas", "sala_ya_tiene_activa", "sala_inexistente", "sala_no_admite_ingresos", "sala_llena", "sala_no_participa", "sala_token_invalido", "sala_nombre_invalido", "sala_sin_plataformas", "sala_no_es_host", "sala_preparando"];
  const vistos = new Set<string>();
  for (const c of codigos) {
    const t = mensajeDeError(c);
    assert.notEqual(t, GENERICO, c);
    assert.ok(!t.includes("sala_"), `${c}: el código crudo no va a la pantalla`);
    vistos.add(t);
  }
  assert.equal(vistos.size, codigos.length, "sin textos repetidos");
});

test("fallo de red → SIN_RED; desconocido → GENERICO", () => {
  assert.equal(mensajeDeError("TypeError: Failed to fetch"), SIN_RED);
  assert.equal(mensajeDeError("NetworkError when attempting to fetch resource."), SIN_RED);
  assert.equal(mensajeDeError("algo raro"), GENERICO);
  assert.equal(mensajeDeError(undefined), GENERICO);
});

test("preparar: insuficientes nombra los tamaños alcanzables; sin ninguno, lo dice", () => {
  assert.match(mensajeDePreparar(409, { motivo: "insuficientes", alcanzables: [5] }), /tanda de 5/);
  assert.match(mensajeDePreparar(409, { motivo: "insuficientes", alcanzables: [5, 10] }), /5 o de 10/);
  assert.match(mensajeDePreparar(409, { motivo: "insuficientes", alcanzables: [] }), /ni para una tanda de 5/);
  assert.match(mensajeDePreparar(409, { motivo: "sin_quorum" }), /2 personas/);
  assert.match(mensajeDePreparar(503, { motivo: "desactivado" }), /desactivadas/);
  assert.match(mensajeDePreparar(401, { motivo: "sin_sesion" }), /ingresar/);
  assert.equal(mensajeDePreparar(500, { motivo: "fallo" }), GENERICO);
  assert.equal(mensajeDePreparar(500, null), GENERICO);
});
