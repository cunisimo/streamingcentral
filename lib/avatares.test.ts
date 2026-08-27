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
  // efecto colateral de tocar el archivo. Don Tito conserva su posición aunque
  // su categoría sea otra.
  assert.deepEqual(
    AVATARES.slice(0, 10).map((a) => a.id),
    ["buitracio", "buitracia", "coco", "dontito", "fini", "jipi", "juanpalomo", "lola", "pocho", "rico"],
  );
});

test("son NUEVE los personajes de Pajaritos, no diez", () => {
  // Corrección editorial confirmada por el autor: de los diez personajes con
  // nombre, nueve son de la tira Pajaritos. Don Tito no.
  const pajaritos = AVATARES.filter((a) => a.categoria === "pajaritos");
  assert.equal(pajaritos.length, 9);
  assert.deepEqual(
    pajaritos.map((a) => a.id),
    ["buitracio", "buitracia", "coco", "fini", "jipi", "juanpalomo", "lola", "pocho", "rico"],
  );
  assert.ok(!pajaritos.some((a) => a.id === "dontito"), "Don Tito no es de Pajaritos");
});

test("Don Tito es la mascota de Yump: categoría propia y nombre con espacio", () => {
  const dt = AVATARES.find((a) => a.id === "dontito");
  assert.ok(dt, "desapareció Don Tito del catálogo");
  assert.equal(dt.categoria, "yump");
  assert.equal(dt.nombre, "Don Tito");
  // El id TÉCNICO no cambia: vive en `profiles.avatar_seed` y en LEGADO_V1.
  assert.equal(dt.id, "dontito");
  assert.equal(dt.src, "/avatars/avatar-dontito.webp");
  // Y es el único de su categoría.
  assert.deepEqual(AVATARES.filter((a) => a.categoria === "yump").map((a) => a.id), ["dontito"]);
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

// EL CONTRATO DEL MAPEO LEGADO, CLAVADO A VALORES EXACTOS.
//
// La versión anterior de este test sólo fijaba `hashCadena("")`, y eso no
// alcanzaba: se podía cambiar el algoritmo, el módulo, el orden de `LEGADO_V1` o
// la correspondencia final y el test seguía verde mientras a todos los perfiles
// viejos les cambiaba el dibujo.
//
// Cada fila fija LAS DOS PUNTAS: el número exacto del hash y el id exacto que
// sale. Con las dos, no hay cambio silencioso posible en ningún eslabón de la
// cadena `semilla → hash → índice → id`.
//
// Las ocho semillas caen en OCHO POSICIONES DISTINTAS y separadas
// (1, 3, 5, 6, 12, 14, 16, 22), así que un reordenamiento parcial de
// `LEGADO_V1` tampoco pasa desapercibido. Hay cinco uuids realistas —incluidos
// los dos extremos, todo ceros y todo efes—, el valor por defecto viejo del
// helper y el nombre del estilo de DiceBear.
const CASOS: [semilla: string, hash: number, indice: number, id: string][] = [
  ["8f14e45f-ceea-467a-9f61-6c7b8b0a1d2e", 787400601, 12, "witch"],
  ["3c9a1e77-2b4d-4f8a-9c15-7ad0e6b3f102", 104246909, 16, "reproductor"],
  ["d41d8cd9-8f00-b204-e980-0998ecf8427e", 3822259300, 3, "dontito"],
  ["a1b2c3d4-e5f6-4708-9a0b-1c2d3e4f5061", 358666378, 5, "jipi"],
  ["00000000-0000-0000-0000-000000000000", 3192360657, 1, "buitracia"],
  ["ffffffff-ffff-ffff-ffff-ffffffffffff", 654879633, 14, "astronauta"],
  ["streamingcentral", 1540129544, 6, "juanpalomo"],
  ["adventurer-neutral", 3457507181, 22, "auriculares"],
];

test("el hash da EXACTAMENTE estos números", () => {
  // Primer eslabón: el algoritmo. Cambiarlo rompe acá.
  assert.equal(hashCadena(""), 2166136261);
  for (const [semilla, hash] of CASOS) {
    assert.equal(hashCadena(semilla), hash, `cambió el hash de "${semilla}"`);
  }
});

test("el índice sale del módulo sobre LEGADO_V1, y da EXACTAMENTE estos", () => {
  // Segundo eslabón: el módulo. Si `LEGADO_V1` cambiara de tamaño, rompe acá.
  for (const [semilla, hash, indice] of CASOS) {
    assert.equal(hash % LEGADO_V1.length, indice, `cambió el índice de "${semilla}"`);
    assert.equal(LEGADO_V1[indice], CASOS.find((c) => c[0] === semilla)![3]);
  }
});

test("cada semilla vieja resuelve al MISMO avatar de siempre", () => {
  // Tercer eslabón: la correspondencia final. Es lo que ve la persona.
  for (const [semilla, , , id] of CASOS) {
    const r = resolverAvatar({ avatar_style: "adventurer-neutral", avatar_seed: semilla });
    assert.equal(r.id, id, `"${semilla}" ahora resuelve a "${r.id}" en vez de "${id}"`);
    assert.equal(r.src, `/avatars/avatar-${id}.webp`);
  }
});

test("el estilo no cambia el resultado del mapeo legado", () => {
  // Un perfil de DiceBear, uno con estilo desconocido y uno sin estilo tienen
  // que ver lo MISMO si comparten la semilla: el estilo sólo decide si es una
  // elección explícita, no a qué dibujo cae el que no eligió.
  for (const [semilla, , , id] of CASOS) {
    for (const style of ["adventurer-neutral", "pixel-art", "", null]) {
      assert.equal(resolverAvatar({ avatar_style: style, avatar_seed: semilla }).id, id);
    }
  }
});

test("las ocho semillas cubren ocho posiciones distintas", () => {
  // Si todas cayeran en el mismo índice, el test de arriba no detectaría un
  // reordenamiento parcial de la lista.
  const indices = new Set(CASOS.map((c) => c[2]));
  assert.equal(indices.size, CASOS.length, "hay semillas que comparten posición");
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

// ============================================================================
// Resolución POR PERTENENCIA: la semilla manda, el estilo no
// ============================================================================

// El cambio de contrato: una elección nueva se guarda con el estilo compatible
// `adventurer-neutral`, no con `yump` (ver `lib/avatares-persistencia.test.ts` y
// docs/AVATARES.md). Para que eso funcione, el primer criterio de resolución
// tiene que ser LA PERTENENCIA DE LA SEMILLA AL CATÁLOGO, sin mirar el estilo.
//
// No hay ambigüedad posible porque los ids del catálogo NO tienen formato uuid y
// todas las semillas heredadas SÍ lo tienen: `crypto.randomUUID()` en el
// selector viejo y `gen_random_uuid()::text` en el trigger.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test("NINGÚN id del catálogo tiene formato uuid", () => {
  // Si un id lo tuviera, podría chocar con una semilla heredada y le cambiaría
  // el dibujo a un perfil viejo. Es la condición que hace segura la regla de
  // pertenencia.
  for (const a of AVATARES) {
    assert.doesNotMatch(a.id, UUID, `${a.id} tiene formato uuid`);
  }
});

test("todas las semillas heredadas de los casos fijados SÍ son uuid o texto suelto", () => {
  // La otra mitad de la condición: ninguna de las semillas legadas es un id del
  // catálogo, así que la regla de pertenencia no las toca.
  const ids = new Set(AVATARES.map((a) => a.id));
  for (const [semilla] of CASOS) {
    assert.ok(!ids.has(semilla), `la semilla legada "${semilla}" es un id del catálogo`);
  }
});

test("una semilla que es un id del catálogo resuelve a ESE avatar, con cualquier estilo", () => {
  for (const style of ["adventurer-neutral", ESTILO_YUMP, "pixel-art", "", null, undefined]) {
    const r = resolverAvatar({ avatar_style: style, avatar_seed: "pocho" });
    assert.equal(r.id, "pocho", `con estilo ${JSON.stringify(style)} resolvió a ${r.id}`);
    assert.equal(r.src, "/avatars/avatar-pocho.webp");
  }
});

test("la pertenencia vale para los 31, no sólo para uno", () => {
  for (const a of AVATARES) {
    assert.equal(resolverAvatar({ avatar_style: "adventurer-neutral", avatar_seed: a.id }).id, a.id);
  }
});

test("LECTURA DEFENSIVA: un perfil con estilo `yump` e id válido sigue resolviendo bien", () => {
  // PROTECCIÓN, no descripción de la base. Consultada Producción el 27/08/2026,
  // sobre 10 perfiles hay CERO con `yump`. Pero el valor pudo escribirse mientras
  // el código nuevo estuvo sólo en Preview sobre la base compartida, y podría
  // aparecer si alguien guarda desde un despliegue viejo. Se lee igual, aunque
  // ninguna ruta activa lo escriba.
  for (const a of AVATARES) {
    assert.equal(resolverAvatar({ avatar_style: ESTILO_YUMP, avatar_seed: a.id }).id, a.id);
  }
});

test("la semilla se compara sin espacios de sobra", () => {
  assert.equal(resolverAvatar({ avatar_style: "adventurer-neutral", avatar_seed: "  pocho  " }).id, "pocho");
});
