import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { debeReiniciar, guardarPosicion, olvidarTrack, posicionDe } from "./track-scroll-store.ts";

class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
beforeEach(() => {
  (globalThis as unknown as { sessionStorage: FakeStorage }).sessionStorage = new FakeStorage();
});

// --- el bug del `if (guardado)` ----------------------------------------------

test("una clave nueva vale 0, no undefined", () => {
  // Es el arreglo central. El hook hacía `if (guardado) el.scrollLeft = guardado`
  // y con una clave nueva no asignaba NADA: el contenedor se quedaba donde
  // estaba, o sea heredaba la posición del contenido anterior. Pasaba cada vez
  // que un riel cambiaba de chip, de tanda o de tipo.
  assert.equal(posicionDe("riel-que-no-existe"), 0);
});

test("un 0 guardado se devuelve como 0 y no se pierde por falsy", () => {
  guardarPosicion("accion", 0);
  assert.equal(posicionDe("accion"), 0);
});

test("guarda y devuelve la posición, redondeada", () => {
  guardarPosicion("accion", 354.4);
  assert.equal(posicionDe("accion"), 354);
});

test("cada riel guarda la suya, sin pisarse", () => {
  guardarPosicion("accion", 100);
  guardarPosicion("upcoming", 250);
  guardarPosicion("hero:terror:1", 40);
  assert.equal(posicionDe("accion"), 100);
  assert.equal(posicionDe("upcoming"), 250);
  assert.equal(posicionDe("hero:terror:1"), 40);
});

// --- olvidar, que es lo que hace funcionar el toggle -------------------------

test("olvidar deja el riel en 0", () => {
  // Sin esto, el toggle Películas/Series no puede arrancar del principio en los
  // rieles `refetch`: al llegar el contenido nuevo el hook restaura lo guardado
  // y deshace el reset de `scrollLeft`.
  guardarPosicion("accion", 800);
  olvidarTrack("accion");
  assert.equal(posicionDe("accion"), 0);
});

test("olvidar un riel no toca a los demás", () => {
  guardarPosicion("accion", 800);
  guardarPosicion("terror", 300);
  olvidarTrack("accion");
  assert.equal(posicionDe("terror"), 300);
});

test("olvidar algo que no existe no rompe", () => {
  olvidarTrack("nunca-existio");
  olvidarTrack(undefined);
  assert.equal(posicionDe("nunca-existio"), 0);
});

// --- lo guardado no se cree a ciegas ----------------------------------------

test("un sessionStorage corrupto no rompe: todo vale 0", () => {
  sessionStorage.setItem("yump:track-scroll", "{ roto");
  assert.equal(posicionDe("accion"), 0);
});

test("un valor no numérico se trata como 0", () => {
  sessionStorage.setItem("yump:track-scroll", JSON.stringify({ accion: "mucho" }));
  assert.equal(posicionDe("accion"), 0);
});

// --- el toggle que YA está activo es un no-op --------------------------------

test("tocar el toggle activo no reinicia nada", () => {
  // El borde: sin esta comprobación, tocar "Películas" estando en Películas
  // olvidaba la posición y mandaba el riel al principio. Ningún contenido
  // cambia, así que no hay nada que reiniciar.
  //
  // En `Shelf` este falso corta el handler ENTERO con un return, no solo el
  // reset: `onTypeChange` es lo caro —en el Home rearma el payload con una
  // clave de cache nueva— y un clic que no cambia nada no tiene por qué pagarlo.
  assert.equal(debeReiniciar("movie", "movie"), false);
  assert.equal(debeReiniciar("tv", "tv"), false);
});

test("cambiar de tipo sí reinicia, en las dos direcciones", () => {
  assert.equal(debeReiniciar("movie", "tv"), true);
  assert.equal(debeReiniciar("tv", "movie"), true);
});

test("el no-op deja intacta la posición guardada", () => {
  // Las dos mitades juntas: lo que protege el guard es esto.
  guardarPosicion("accion", 640);
  if (debeReiniciar("movie", "movie")) olvidarTrack("accion");
  assert.equal(posicionDe("accion"), 640);

  if (debeReiniciar("movie", "tv")) olvidarTrack("accion");
  assert.equal(posicionDe("accion"), 0);
});
