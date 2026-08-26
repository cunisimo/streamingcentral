import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  AVATARES, AVATAR_POR_DEFECTO, ESTILO_YUMP, LEGADO_V1, hashCadena,
  resolverAvatar, rutaAvatar, type Avatar,
} from "./avatares.ts";

const DIR = path.join(process.cwd(), "public", "avatars");

// ============================================================================
// Catálogo y archivos, sincronizados
// ============================================================================

// Los archivos se DESCUBREN del disco. No hay una lista de nombres escrita a
// mano en este test: una lista así se desactualiza sola y deja de probar lo que
// dice probar. Si mañana aparece un `.webp` nuevo en `public/avatars/` y nadie
// lo agrega al catálogo, este test se pone rojo.
const archivos = fs.readdirSync(DIR).filter((f) => f.endsWith(".webp")).sort();

test("cada archivo de public/avatars está en el catálogo", () => {
  const enCatalogo = new Set(AVATARES.map((a) => path.basename(a.src)));
  const huerfanos = archivos.filter((f) => !enCatalogo.has(f));
  assert.deepEqual(huerfanos, [], "hay archivos sin entrada en el catálogo");
});

test("cada entrada del catálogo tiene su archivo en disco", () => {
  const enDisco = new Set(archivos);
  const faltantes = AVATARES
    .map((a) => path.basename(a.src))
    .filter((f) => !enDisco.has(f));
  assert.deepEqual(faltantes, [], "hay entradas del catálogo sin archivo");
});

test("son exactamente 31, y el conteo sale del disco", () => {
  assert.equal(AVATARES.length, archivos.length);
  assert.equal(archivos.length, 31);
});

test("todos los archivos son WebP de verdad, no otra cosa renombrada", () => {
  for (const a of AVATARES) {
    const buf = fs.readFileSync(path.join(DIR, path.basename(a.src)));
    assert.equal(buf.toString("ascii", 0, 4), "RIFF", `${a.id}: no arranca con RIFF`);
    assert.equal(buf.toString("ascii", 8, 12), "WEBP", `${a.id}: no declara WEBP`);
  }
});

// ============================================================================
// Identificadores y rutas
// ============================================================================

test("los identificadores son únicos", () => {
  const ids = AVATARES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("las rutas son únicas", () => {
  const srcs = AVATARES.map((a) => a.src);
  assert.equal(new Set(srcs).size, srcs.length);
});

test("las rutas son locales, absolutas y bajo /avatars/", () => {
  for (const a of AVATARES) {
    assert.match(a.src, /^\/avatars\/avatar-[a-z0-9]+\.webp$/, `${a.id}: ruta rara`);
  }
});

test("todos tienen nombre legible, apto para aria-label", () => {
  for (const a of AVATARES) {
    assert.ok(a.nombre.trim().length >= 2, `${a.id}: nombre demasiado corto`);
    // Sin comillas ni signos que rompan un atributo.
    assert.doesNotMatch(a.nombre, /["<>]/, `${a.id}: el nombre tiene caracteres de markup`);
  }
});

test("el orden es explícito y estable: los diez primeros son los personajes", () => {
  // Fija el contrato del orden. Reordenar la grilla es una decisión, no un
  // efecto colateral de tocar el archivo.
  assert.deepEqual(
    AVATARES.slice(0, 10).map((a) => a.id),
    ["buitracio", "buitracia", "coco", "dontito", "fini", "jipi", "juanpalomo", "lola", "pocho", "rico"],
  );
  assert.ok(AVATARES.slice(0, 10).every((a) => a.categoria === "pajaritos"));
});

// ============================================================================
// Resolución: elección explícita
// ============================================================================

test("estilo yump + id válido devuelve ese avatar", () => {
  const r = resolverAvatar({ avatar_style: ESTILO_YUMP, avatar_seed: "pocho" });
  assert.equal(r.id, "pocho");
  assert.equal(r.src, "/avatars/avatar-pocho.webp");
});

test("estilo yump + id desconocido NO explota: cae al mapeo legado", () => {
  const r = resolverAvatar({ avatar_style: ESTILO_YUMP, avatar_seed: "no-existe" });
  assert.ok(AVATARES.includes(r));
});

// ============================================================================
// Mapeo legado: perfiles de DiceBear
// ============================================================================

// Una semilla real de las que dejó DiceBear: un uuid.
const SEMILLA_VIEJA = "8f14e45f-ceea-467a-9f61-6c7b8b0a1d2e";

test("un perfil viejo de DiceBear recibe un avatar local", () => {
  const r = resolverAvatar({ avatar_style: "adventurer-neutral", avatar_seed: SEMILLA_VIEJA });
  assert.ok(AVATARES.includes(r), "devolvió algo que no está en el catálogo");
});

test("el mapeo legado es DETERMINÍSTICO: mil llamadas, el mismo avatar", () => {
  // Es lo que hace que la persona vea el mismo dibujo en el teléfono y en la
  // computadora sin que escribamos nada en la base.
  const primero = resolverAvatar({ avatar_style: "adventurer-neutral", avatar_seed: SEMILLA_VIEJA });
  for (let i = 0; i < 1000; i++) {
    assert.equal(
      resolverAvatar({ avatar_style: "adventurer-neutral", avatar_seed: SEMILLA_VIEJA }).id,
      primero.id,
    );
  }
});

test("semillas distintas se reparten entre varios avatares", () => {
  // Si el hash estuviera roto (siempre 0, por ejemplo) todos verían el mismo.
  const vistos = new Set<string>();
  for (let i = 0; i < 500; i++) {
    vistos.add(resolverAvatar({ avatar_style: "adventurer-neutral", avatar_seed: `uuid-${i}` }).id);
  }
  assert.ok(vistos.size > 20, `sólo se repartió entre ${vistos.size} avatares`);
});

test("AGREGAR AVATARES NO MUEVE A LOS USUARIOS VIEJOS", () => {
  // El test que protege la decisión de fondo. `LEGADO_V1` está congelada: el
  // mapeo NO usa `AVATARES.length`, así que sumar un avatar 32 al catálogo no
  // cambia el módulo del hash y nadie ve cambiar su dibujo.
  assert.equal(LEGADO_V1.length, 31, "cambió el tamaño del conjunto legado");
  assert.deepEqual(
    [...LEGADO_V1],
    ["buitracio", "buitracia", "coco", "dontito", "fini", "jipi", "juanpalomo",
      "lola", "pocho", "rico", "cat", "monster", "witch", "bot", "astronauta",
      "tv", "reproductor", "control", "claqueta", "ticket", "popcorn", "sillon",
      "auriculares", "book", "lupa", "brujula", "crown", "pocion", "rocket",
      "planet", "moon"],
    "LEGADO_V1 cambió: eso reasigna el avatar de TODOS los perfiles viejos",
  );
});

test("todo id de LEGADO_V1 existe en el catálogo", () => {
  const ids = new Set(AVATARES.map((a) => a.id));
  for (const id of LEGADO_V1) assert.ok(ids.has(id), `${id} está en el legado y no en el catálogo`);
});

test("el hash es estable frente a valores conocidos", () => {
  // Clava el algoritmo. Si alguien lo cambia, este test lo dice antes de que se
  // note en producción como "se me cambió el avatar solo".
  assert.equal(hashCadena(""), 2166136261);
  assert.equal(typeof hashCadena(SEMILLA_VIEJA), "number");
  assert.ok(hashCadena(SEMILLA_VIEJA) >= 0);
});

// ============================================================================
// Entradas rotas
// ============================================================================

test("estilo desconocido con semilla: mapeo legado", () => {
  const r = resolverAvatar({ avatar_style: "pixel-art-lo-que-sea", avatar_seed: "abc" });
  assert.ok(AVATARES.includes(r));
});

test("nulo, vacío y basura caen SIEMPRE en un avatar local", () => {
  const casos: (Parameters<typeof resolverAvatar>[0])[] = [
    null,
    undefined,
    {},
    { avatar_style: null, avatar_seed: null },
    { avatar_style: "", avatar_seed: "" },
    { avatar_style: "   ", avatar_seed: "   " },
    { avatar_style: ESTILO_YUMP, avatar_seed: null },
    { avatar_style: ESTILO_YUMP, avatar_seed: "" },
    // Tipos que TypeScript no deja pasar pero la base sí puede devolver.
    { avatar_seed: 12345 as unknown as string },
    { avatar_style: {} as unknown as string, avatar_seed: [] as unknown as string },
  ];
  for (const c of casos) {
    const r = resolverAvatar(c);
    assert.ok(AVATARES.includes(r), `caso ${JSON.stringify(c)} devolvió algo fuera del catálogo`);
  }
});

test("sin semilla utilizable devuelve el avatar por defecto", () => {
  assert.equal(resolverAvatar(null).id, AVATAR_POR_DEFECTO.id);
  assert.equal(resolverAvatar({ avatar_seed: "" }).id, AVATAR_POR_DEFECTO.id);
});

// ============================================================================
// Seguridad de rutas
// ============================================================================

test("NINGÚN texto de la base puede convertirse en una ruta", () => {
  // El punto entero de que la ruta salga del catálogo y no de la semilla.
  const maliciosos = [
    "../../../etc/passwd",
    "..%2F..%2Fsecret",
    "https://api.dicebear.com/10.x/adventurer-neutral/svg?seed=x",
    "//evil.com/x.webp",
    "/avatars/../../secreto.webp",
    "avatar-pocho.webp",
    "<script>alert(1)</script>",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "pocho/../../otro",
  ];
  const rutasValidas = new Set(AVATARES.map((a) => a.src));
  for (const seed of maliciosos) {
    for (const style of [ESTILO_YUMP, "adventurer-neutral", "", "cualquiera"]) {
      const src = rutaAvatar({ avatar_style: style, avatar_seed: seed });
      assert.ok(
        rutasValidas.has(src),
        `"${seed}" con estilo "${style}" produjo una ruta fuera del catálogo: ${src}`,
      );
      assert.doesNotMatch(src, /\.\./, "la ruta tiene ..");
      assert.doesNotMatch(src, /^https?:|^\/\/|^data:/, "la ruta es externa");
    }
  }
});

test("resolverAvatar devuelve SIEMPRE un objeto del catálogo, nunca una copia suelta", () => {
  // Identidad por referencia: no se puede construir un `Avatar` al vuelo con
  // datos de la base, porque el resultado sale del array congelado.
  const entradas: (Parameters<typeof resolverAvatar>[0])[] = [
    { avatar_style: ESTILO_YUMP, avatar_seed: "lola" },
    { avatar_style: "adventurer-neutral", avatar_seed: SEMILLA_VIEJA },
    null,
  ];
  for (const e of entradas) {
    const r: Avatar = resolverAvatar(e);
    assert.ok(AVATARES.some((a) => a === r), "devolvió un objeto que no es del catálogo");
  }
});

// ============================================================================
// Nada de DiceBear en el módulo
// ============================================================================

test("el catálogo no contiene ninguna URL externa", () => {
  const json = JSON.stringify(AVATARES);
  assert.doesNotMatch(json, /dicebear/i);
  assert.doesNotMatch(json, /https?:\/\//);
});
