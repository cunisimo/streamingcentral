import { test } from "node:test";
import assert from "node:assert/strict";
import { permiteRearmar, ttlDePayload, type EstadoPayload } from "./home-refresco.ts";

const sano: EstadoPayload = { degradado: false };
const roto: EstadoPayload = { degradado: true };
const sinPlataformas: EstadoPayload = { degradado: false, sinPlataformas: true };

const TTL = { home: 60 * 60 * 26, homeDegradado: 60 * 8 };

// --- El agujero que esto cierra ---------------------------------------------
// El bypass lo decidía el cliente con `?fresh=1`. Cualquiera podía pedir esa URL
// en bucle y forzar un rearmado completo por request: ~558 comandos de Upstash y
// ~516 llamadas a TMDB cada vez, o sea las dos cuotas vaciadas en minutos desde
// una pestaña y sin autenticar. Estos tests son la defensa, no cobertura.

test("fresh NO puede saltear un payload sano — el agujero de cuota", () => {
  assert.equal(
    permiteRearmar({ pedido: true, guardado: sano, turno: true }),
    false,
    "un payload sano se sirve aunque pidan fresh y haya turno",
  );
});

test("fresh sobre un payload degradado sí rearma, que es para lo que existe", () => {
  assert.equal(permiteRearmar({ pedido: true, guardado: roto, turno: true }), true);
});

test("sin turno no se rearma, aunque esté degradado y lo pidan", () => {
  // Es el freno a la estampida: durante una caída de TMDB, mil personas
  // apretando "Reintentar" no pueden ser mil rearmados contra el servicio caído.
  assert.equal(permiteRearmar({ pedido: true, guardado: roto, turno: false }), false);
});

test("sin pedirlo no se rearma, ni siquiera con lo guardado degradado", () => {
  // Una visita normal durante una caída sirve la foto corta y no paga el rearmado.
  assert.equal(permiteRearmar({ pedido: false, guardado: roto, turno: true }), false);
});

test("sin nada guardado no hay nada que saltear", () => {
  // El camino normal ya arma; devolver true acá haría pedir el turno al pedo.
  assert.equal(permiteRearmar({ pedido: true, guardado: null, turno: true }), false);
});

// --- Cuánto vive cada resultado ---------------------------------------------

test("el payload sano vive el día entero", () => {
  assert.equal(ttlDePayload(sano, TTL), TTL.home);
});

test("el degradado se guarda, pero poco", () => {
  // Guardarlo es lo que corta la estampida durante una caída; que sea corto es
  // lo que impide que el problema quede congelado.
  assert.equal(ttlDePayload(roto, TTL), TTL.homeDegradado);
  assert.ok(ttlDePayload(roto, TTL)! < TTL.home / 10, "tiene que ser MUY corto comparado con el sano");
});

test("sin plataformas no se guarda", () => {
  assert.equal(ttlDePayload(sinPlataformas, TTL), null);
});
