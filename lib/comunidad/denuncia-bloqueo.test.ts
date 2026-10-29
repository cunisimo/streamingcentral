// A2 de la auditoría de E3b: denuncia recibida y bloqueo pendiente. Prueba el
// estado puro del diálogo (`trasDenuncia`, `trasReintentoBloqueo`) y un MODELO
// del diálogo contra un servidor simulado que cuenta envíos; no monta React.
// El recorrido real en navegador está en el informe de A1/A2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BLOQUEO_ERROR, BLOQUEO_HECHO, BLOQUEO_SIN_CONFIRMAR, DENUNCIA_COLA_LLENA, DENUNCIA_RECIBIDA, DENUNCIA_SIN_CONFIRMAR,
  ESTADO_DENUNCIA_INICIAL, trasDenuncia, trasReintentoBloqueo,
} from "./menu-nucleo.ts";

const REG = { resultado: "denuncia_registrada" };

test("éxito / éxito: denunciada y bloqueada, nada pendiente", () => {
  const e = trasDenuncia({ ...REG, bloqueo: { resultado: "bloqueado" } }, true);
  assert.deepEqual(e, {
    msg: { tono: "exito", texto: DENUNCIA_RECIBIDA }, msgBloqueo: { tono: "exito", texto: BLOQUEO_HECHO },
    denunciada: true, bloqueado: true, cerrada: true, bloqueoPendiente: null,
  });
});

test("éxito / incierto: la denuncia queda recibida y se ofrece reintentar el bloqueo (incierto)", () => {
  const e = trasDenuncia({ ...REG, bloqueo: { resultado: "sin_confirmar" } }, true);
  assert.equal(e.msg?.texto, DENUNCIA_RECIBIDA);
  assert.equal(e.msgBloqueo?.texto, BLOQUEO_SIN_CONFIRMAR);
  assert.equal(e.denunciada, true);
  assert.equal(e.bloqueado, false);
  assert.equal(e.cerrada, true, "el formulario de la denuncia no se ofrece de nuevo");
  assert.equal(e.bloqueoPendiente, "incierto");
});

test("éxito / error confirmado: se ofrece reintentar el bloqueo, distinto del incierto", () => {
  const e = trasDenuncia({ ...REG, bloqueo: { resultado: "error" } }, true);
  assert.equal(e.msgBloqueo?.texto, BLOQUEO_ERROR);
  assert.equal(e.bloqueoPendiente, "fallido");
  assert.equal(e.denunciada, true);
});

test("éxito / rechazo definitivo del bloqueo: no se ofrece reintento", () => {
  for (const b of [{ resultado: "rechazo_cuenta", motivo: "limite_diario" }, { resultado: "rechazo_cuenta", motivo: "propio" }, { resultado: "baja_en_curso" }]) {
    const e = trasDenuncia({ ...REG, bloqueo: b }, true);
    assert.equal(e.cerrada, true);
    assert.equal(e.bloqueoPendiente, null, JSON.stringify(b));
    assert.equal(e.msgBloqueo?.tono, "rechazo");
  }
});

test("denuncia rechazada / bloqueo permitido: bloqueado, no denunciada", () => {
  const e = trasDenuncia({ resultado: "rechazo_cuenta", motivo: "cola_denuncias_llena", bloqueo: { resultado: "bloqueado" } }, true);
  assert.equal(e.msg?.texto, DENUNCIA_COLA_LLENA);
  assert.deepEqual([e.denunciada, e.bloqueado, e.cerrada, e.bloqueoPendiente], [false, true, true, null]);
});

test("denuncia rechazada / bloqueo incierto: reintento sólo del bloqueo (la denuncia ya tuvo respuesta)", () => {
  const e = trasDenuncia({ resultado: "rechazo_cuenta", motivo: "cola_denuncias_llena", bloqueo: { resultado: "sin_confirmar" } }, true);
  assert.deepEqual([e.denunciada, e.cerrada, e.bloqueoPendiente], [false, true, "incierto"]);
});

test("denuncia incierta: el formulario sigue y el reintento es el pedido completo", () => {
  assert.equal(trasDenuncia("sin-confirmar", true).cerrada, false);
  assert.equal(trasDenuncia("sin-confirmar", true).msg?.texto, DENUNCIA_SIN_CONFIRMAR);
  const e = trasDenuncia({ resultado: "sin_confirmar", bloqueo: { resultado: "sin_confirmar" } }, true);
  assert.deepEqual([e.cerrada, e.bloqueoPendiente], [false, null]);
});

test("sin pedir bloqueo, un `bloqueo` en la respuesta se ignora", () => {
  const e = trasDenuncia({ ...REG, bloqueo: { resultado: "sin_confirmar" } }, false);
  assert.deepEqual([e.msgBloqueo, e.bloqueoPendiente, e.cerrada], [null, null, true]);
});

test("reintento del bloqueo: conserva la denuncia; incierto → error → bloqueado; rechazo cierra", () => {
  let e = trasDenuncia({ ...REG, bloqueo: { resultado: "sin_confirmar" } }, true);
  e = trasReintentoBloqueo(e, "sin-confirmar");
  assert.equal(e.bloqueoPendiente, "incierto");
  e = trasReintentoBloqueo(e, { resultado: "error" });
  assert.equal(e.bloqueoPendiente, "fallido");
  const ok = trasReintentoBloqueo(e, { resultado: "bloqueado", repetido: true });
  assert.deepEqual([ok.denunciada, ok.bloqueado, ok.bloqueoPendiente, ok.msg?.texto], [true, true, null, DENUNCIA_RECIBIDA]);
  const no = trasReintentoBloqueo(e, { resultado: "rechazo_cuenta", motivo: "limite_diario" });
  assert.deepEqual([no.bloqueado, no.bloqueoPendiente], [false, null]);
  assert.deepEqual(ESTADO_DENUNCIA_INICIAL.cerrada, false);
});

// Modelo del diálogo contra un servidor que cuenta: el reintento del bloqueo
// no vuelve a llamar a la ruta de denuncias (ni suma excedente) y el bloqueo
// idempotente no crea otro.
test("modelo: éxito/incierto + dos reintentos → 1 denuncia, 1 bloqueo, sin excedente extra", async () => {
  const srv = { denuncias: 0, excedente: 0, bloqueos: new Set<string>(), llamadasBloqueo: 0 };
  const respuestasBloqueo = ["sin_confirmar", "error", "bloqueado"];
  const enviar = async (ruta: string, cuerpo: Record<string, unknown>) => {
    if (ruta === "/api/comunidad/denuncias") {
      srv.denuncias++;
      if (srv.denuncias > 1) srv.excedente++;
      srv.bloqueos.add("A→autor"); // la base sí lo guardó: se perdió la respuesta
      return { ...REG, bloqueo: { resultado: "sin_confirmar" } };
    }
    assert.equal(ruta, "/api/comunidad/bloqueos");
    assert.deepEqual(cuerpo, { accion: "bloquear", version_id: 9 });
    srv.llamadasBloqueo++;
    const r = respuestasBloqueo.shift()!;
    if (r === "bloqueado") srv.bloqueos.add("A→autor");
    return { resultado: r, ...(r === "bloqueado" ? { repetido: true } : {}) };
  };
  let e = trasDenuncia(await enviar("/api/comunidad/denuncias", { version_id: 9, categoria: "spam", bloquear: true }), true);
  while (e.bloqueoPendiente) e = trasReintentoBloqueo(e, await enviar("/api/comunidad/bloqueos", { accion: "bloquear", version_id: 9 }));
  assert.deepEqual([srv.denuncias, srv.excedente, srv.bloqueos.size, srv.llamadasBloqueo], [1, 0, 1, 3]);
  assert.deepEqual([e.denunciada, e.bloqueado], [true, true]);
});

test("barrido: el diálogo reintenta el bloqueo contra la ruta de bloqueos, nunca reenvía la denuncia", () => {
  const s = readFileSync(new URL("../../components/comunidad/MenuResena.tsx", import.meta.url), "utf8");
  const f = s.slice(s.indexOf("async function reintentarBloqueo"), s.indexOf("return (", s.indexOf("async function reintentarBloqueo")));
  assert.match(f, /enviar\("\/api\/comunidad\/bloqueos", \{ accion: "bloquear", version_id: versionId \}\)/);
  assert.doesNotMatch(f, /denuncias/);
  assert.match(s, /hecho && bloqueoPendiente &&/);
  // Con el diálogo abierto no se recarga: una recarga podría quitar la reseña (y el reintento).
  assert.match(s, /else if \(d\) recargarAlCerrar\.current = true;/);
  assert.match(s, /if \(recargarAlCerrar\.current\) \{ recargarAlCerrar\.current = false; alDenunciar\(\); \}/);
});
