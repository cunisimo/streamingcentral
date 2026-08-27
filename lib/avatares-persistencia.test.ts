// EL CONTRATO DE PERSISTENCIA, y la evidencia del rollback.
//
// `lib/avatares.test.ts` cubre el catálogo y la resolución. Acá se prueba la
// otra mitad: QUÉ SE ESCRIBE en `profiles` cuando alguien elige un avatar, y qué
// haría con esos valores el código anterior si mañana hubiera que volver atrás.
//
// EL PROBLEMA QUE ESTE CONTRATO RESUELVE. La versión anterior de esta tanda
// guardaba `avatar_style = "yump"`. El lector histórico —`lib/avatar.ts` en
// `origin/main`— interpola ese valor en una URL de DiceBear, así que un rollback
// dejaba a todo el que hubiera elegido un avatar pidiendo `/10.x/yump/svg`, que
// no existe: imagen rota, no un avatar distinto. Guardar el estilo compatible
// cierra ese agujero sin migración, sin backfill y sin tocar la base.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  AVATARES, ESTILO_PERSISTIDO, ESTILO_YUMP, eleccionAvatar, resolverAvatar,
} from "./avatares.ts";

// ============================================================================
// Qué se escribe
// ============================================================================

test("elegir `pocho` escribe EXACTAMENTE el id y el estilo compatible", () => {
  // El caso puntual, clavado a valores literales: es el contrato, no un detalle.
  assert.deepEqual(eleccionAvatar("pocho"), {
    avatar_seed: "pocho",
    avatar_style: "adventurer-neutral",
  });
});

test("el estilo que se persiste es el compatible con el lector histórico", () => {
  assert.equal(ESTILO_PERSISTIDO, "adventurer-neutral");
});

test("todo id del catálogo produce su propio id como semilla", () => {
  for (const a of AVATARES) {
    const e = eleccionAvatar(a.id);
    assert.ok(e, `${a.id}: el constructor devolvió null`);
    assert.equal(e.avatar_seed, a.id);
    assert.equal(e.avatar_style, ESTILO_PERSISTIDO);
  }
});

test("NINGUNA elección nueva escribe `yump`", () => {
  // La regla que hace segura la ventana en que conviven las dos versiones.
  for (const a of AVATARES) {
    assert.notEqual(eleccionAvatar(a.id)?.avatar_style, ESTILO_YUMP);
    assert.notEqual(eleccionAvatar(a.id)?.avatar_style, "yump");
  }
});

test("un id que no está en el catálogo NO produce ninguna escritura", () => {
  // Devolver un valor por defecto guardaría en la base algo que la persona no
  // eligió. `null` deja que el llamador aborte, que es lo que hace el modal.
  for (const id of ["", "   ", "no-existe", "../../x", "yump", "adventurer-neutral"]) {
    assert.equal(eleccionAvatar(id), null, `"${id}" produjo una elección`);
  }
  assert.equal(eleccionAvatar(null as unknown as string), null);
  assert.equal(eleccionAvatar(undefined as unknown as string), null);
});

// ============================================================================
// Ida y vuelta: lo que se escribe es lo que se lee
// ============================================================================

test("lo que escribe una elección se lee como EL MISMO avatar", () => {
  // Esto es lo que garantiza que al volver al código nuevo reaparezca la
  // elección exacta, sin migración de por medio.
  for (const a of AVATARES) {
    const e = eleccionAvatar(a.id);
    assert.ok(e);
    const leido = resolverAvatar(e);
    assert.equal(leido.id, a.id, `${a.id} se leyó como ${leido.id}`);
    assert.equal(leido.src, `/avatars/avatar-${a.id}.webp`);
  }
});

test("elegir `pocho` se lee como el WebP local de Pocho", () => {
  const e = eleccionAvatar("pocho");
  assert.ok(e);
  assert.equal(resolverAvatar(e).src, "/avatars/avatar-pocho.webp");
});

// ============================================================================
// El lector histórico: qué pasaría con un rollback
// ============================================================================

// COPIA CONGELADA del lector que corre hoy en Producción
// (`origin/main:lib/avatar.ts`). Está transcripto acá, y no leído con `git show`
// ni pedido por red, por dos razones: un test no puede depender de que exista un
// remoto, y lo que se quiere fijar es EL COMPORTAMIENTO QUE HUBO, que no cambia
// aunque la rama se mueva.
//
// Este archivo es `.test.ts`, así que está exento del barrido de DiceBear — por
// eso puede contener la URL entera sin romperlo.
const ESTILO_HISTORICO_POR_DEFECTO = "adventurer-neutral";

function lectorHistorico(p: { avatar_style?: string | null; avatar_seed?: string | null }): string {
  const style = p?.avatar_style || ESTILO_HISTORICO_POR_DEFECTO;
  const seed = p?.avatar_seed || "streamingcentral";
  return `https://api.dicebear.com/10.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

test("EL ROLLBACK: el lector histórico arma una URL bajo /adventurer-neutral/", () => {
  const e = eleccionAvatar("pocho");
  assert.ok(e);
  assert.equal(
    lectorHistorico(e),
    "https://api.dicebear.com/10.x/adventurer-neutral/svg?seed=pocho",
  );
});

test("EL ROLLBACK: ninguna elección puede producir una URL bajo /yump/", () => {
  // La URL `/10.x/yump/svg` devuelve 404 — es la imagen rota que este contrato
  // elimina. Comprobado una sola vez, a mano, contra la API; deliberadamente NO
  // se convierte en un test dependiente de red. Ver docs/AVATARES.md.
  for (const a of AVATARES) {
    const url = lectorHistorico(eleccionAvatar(a.id)!);
    assert.ok(url.includes("/10.x/adventurer-neutral/"), `${a.id}: ${url}`);
    assert.doesNotMatch(url, /\/yump\//, `${a.id} produciría una URL rota: ${url}`);
  }
});

test("EL ROLLBACK: la URL histórica lleva el id como semilla, sin escapes raros", () => {
  // Los ids son `[a-z0-9]+`, así que `encodeURIComponent` los deja intactos: la
  // URL que arma el código viejo es legible y estable, no una cadena escapada.
  for (const a of AVATARES) {
    assert.equal(
      lectorHistorico(eleccionAvatar(a.id)!),
      `https://api.dicebear.com/10.x/adventurer-neutral/svg?seed=${a.id}`,
    );
  }
});

// ============================================================================
// El componente usa el constructor central
// ============================================================================

// ⚠️ Es un test SOBRE EL TEXTO DEL ARCHIVO, no sobre el componente montado. Este
// proyecto no tiene arnés de DOM (ver docs/AVATARES.md), así que `AvatarModal`
// no se monta en ningún test. Lo que se fija acá es que el componente no arme
// los valores a mano — que es exactamente la regresión posible.
const fuente = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

test("AvatarModal construye la elección con `eleccionAvatar`", () => {
  const src = fuente(path.join("components", "avatar", "AvatarModal.tsx"));
  assert.match(src, /\beleccionAvatar\b/, "el modal no usa el constructor central");
});

test("AvatarModal NO escribe el nombre del estilo a mano", () => {
  const src = fuente(path.join("components", "avatar", "AvatarModal.tsx"));
  assert.doesNotMatch(src, /adventurer-neutral/, "el estilo está hardcodeado en el componente");
  assert.doesNotMatch(src, /["']yump["']/, "el modal escribe el estilo viejo");
  assert.doesNotMatch(src, /\bESTILO_YUMP\b/, "el modal sigue usando el estilo que rompe el rollback");
});

test("NINGÚN componente pasa `ESTILO_YUMP` a una escritura", () => {
  // `ESTILO_YUMP` queda como lectura defensiva de los perfiles que alcanzaron a
  // guardarse desde el Preview. Ninguna ruta activa lo escribe.
  const dir = path.join(process.cwd(), "components");
  const archivos: string[] = [];
  (function recorrer(d: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) archivos.push(p);
    }
  })(dir);

  for (const f of archivos) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(
      src,
      /updateAvatar\([^)]*ESTILO_YUMP/,
      `${path.relative(process.cwd(), f)} escribe el estilo viejo`,
    );
  }
});
