// La intención de volver desde una ficha abierta por la ruleta.
//
// Lo que se fija acá es que el fallback de "Volver" (`router.push("/")`) marque
// la vuelta SÓLO cuando la ficha se abrió desde la ruleta, y una sola vez. Es la
// diferencia entre arreglar el bug y romper algo peor: con una marca
// incondicional, una ficha abierta desde WhatsApp resucitaría una sesión vieja.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  registrarIntencion, consumirIntencion, olvidarIntencion, decidirVuelta,
  VENTANA_INTENCION_MS,
} from "./intencion-vuelta.ts";

class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}
beforeEach(() => {
  (globalThis as unknown as { sessionStorage: FakeStorage; window: unknown }).sessionStorage = new FakeStorage();
  (globalThis as unknown as { window: unknown }).window = globalThis;
});

const DESDE_RULETA = { origen: "ruleta" as const, tipo: "movie", id: 353070, ruta: "/" };

// ------------------------------------------------- registrar y consumir

test("🔴 la ficha abierta desde la ruleta trae su intención de volver", () => {
  registrarIntencion(DESDE_RULETA);
  assert.equal(consumirIntencion("movie", 353070), "/");
});

test("🔴 una intención de OTRA ficha no sirve, y no se toca", () => {
  registrarIntencion(DESDE_RULETA);
  assert.equal(consumirIntencion("movie", 999), null, "sirvió para una ficha que no es la suya");
  assert.equal(consumirIntencion("tv", 353070), null, "el tipo también tiene que coincidir");
  // Y sigue disponible para la ficha que sí la generó: dos fichas abiertas en la
  // misma pestaña no se pisan.
  assert.equal(consumirIntencion("movie", 353070), "/");
});

test("🔴 una intención consumida no sirve una segunda vez", () => {
  registrarIntencion(DESDE_RULETA);
  assert.equal(consumirIntencion("movie", 353070), "/");
  assert.equal(consumirIntencion("movie", 353070), null, "se pudo reutilizar");
});

test("🔴 una intención vencida no sirve, y queda consumida igual", () => {
  const t0 = 1_000_000;
  registrarIntencion(DESDE_RULETA, t0);
  assert.equal(consumirIntencion("movie", 353070, t0 + VENTANA_INTENCION_MS + 1), null);
  assert.equal(consumirIntencion("movie", 353070, t0 + 1), null, "quedó dando vueltas");
});

test("sin intención no hay nada que consumir", () => {
  assert.equal(consumirIntencion("movie", 353070), null);
});

test("una intención rota o de otro origen se ignora", () => {
  sessionStorage.setItem("yump:intencion-vuelta", "{no es json");
  assert.equal(consumirIntencion("movie", 353070), null);
  sessionStorage.setItem("yump:intencion-vuelta", JSON.stringify({ origen: "otro", tipo: "movie", id: "353070", ruta: "/", t: Date.now() }));
  assert.equal(consumirIntencion("movie", 353070), null);
});

test("el id se normaliza: la tarjeta lo tiene como número y la ficha como texto", () => {
  registrarIntencion(DESDE_RULETA);
  assert.equal(consumirIntencion("movie", "353070"), "/");
});

test("olvidarIntencion la borra", () => {
  registrarIntencion(DESDE_RULETA);
  olvidarIntencion();
  assert.equal(consumirIntencion("movie", 353070), null);
});

// ------------------------------------------------------ los tres caminos

test("🔴 con historial nuestro atrás manda el back del navegador", () => {
  // El mecanismo de siempre: el `popstate` escribe la marca y la ruleta restaura.
  assert.deepEqual(decidirVuelta(true, "/"), { tipo: "back" });
  assert.deepEqual(decidirVuelta(true, null), { tipo: "back" });
});

test("🔴 sin historial, con intención de la ruleta: se emula la vuelta", () => {
  // Es el caso de la recarga completa sobre la ficha.
  assert.deepEqual(decidirVuelta(false, "/"), { tipo: "push", ruta: "/", marcarVuelta: true });
});

test("🔴 sin historial y sin intención: al Home LIMPIO, sin marcar la vuelta", () => {
  // Link de WhatsApp, buscador de Google, URL escrita a mano. Marcar la vuelta
  // acá haría que una ficha ajena resucite una sesión vieja de la ruleta.
  assert.deepEqual(decidirVuelta(false, null), { tipo: "push", ruta: "/", marcarVuelta: false });
});
