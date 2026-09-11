// Una escritura de caché que falla NO puede tumbar el request.
//
// ============================================================================
// EL BUG, TAL CUAL SE REPRODUJO EL 2026-09-10
// ============================================================================
// `guardar` (lib/cache.ts) era `try { await redis.set(...) } finally {…}` —sin
// `catch`— y `resolverConCache` espera la escritura antes de devolver. Un
// rechazo de `redis.set` subía por `cachedIf` → `homePayload` → el `catch` del
// handler, y salía como **500 con `hero: []` y `rails: []`**.
//
// Corrido contra el resolver real con un backend cuyo `escribir()` rechazaba:
//
//     RECHAZO: Redis caido
//     -> el payload era correcto y el usuario no lo recibe
//     control (degradado, no escribe): {"hero":["payload DEGRADADO"]}
//
// 🔴 Esa última línea es la parte indefendible: un payload DEGRADADO se servía
// bien —porque nunca intenta escribir— y uno COMPLETO se perdía.
//
// Decisión del dueño (2026-09-10): **si el payload se produjo correctamente y
// sólo falla la escritura, se entrega igual y se registra el error.**
//
// ============================================================================
// CÓMO ESTÁ ARMADO ESTE ARCHIVO, Y POR QUÉ ASÍ
// ============================================================================
// Los tests no prueban la política aislada y se van contentos: la componen con
// `resolverConCache` REAL —la misma función que corre en producción— usando un
// backend que se comporta como `guardar`. Es el mismo criterio de
// `lib/cache-delega.test.ts`: un test que corre sobre código que producción no
// ejecuta no prueba nada, y así se colaron tres bugs antes.
//
// `lib/cache.ts` no se puede importar desde `node --test` (arrastra Upstash),
// así que el enchufe se vigila leyendo el fuente, al final.
//
// ⚠️ **LEER ESTO ANTES DE CONFIAR EN LOS ESCENARIOS.** Los siete escenarios
// prueban la POLÍTICA compuesta con el resolver real, y **pasan también contra
// el `lib/cache.ts` viejo** — se verificó corriéndolos contra `main:lib/cache.ts`
// el 2026-09-10 (los cinco primeros) y el 2026-09-11 (el 6 y el 7): no importan
// `lib/cache.ts`, así que no pueden verlo. Eso no los invalida: lo que prueban
// es que la política es correcta, y cada uno lleva un CONTROL que corre el mismo
// recorrido con el `guardar` viejo y exige que rechace. **Lo que ata producción
// a esa política son los guards del final**, y esos SÍ fallan con el código
// viejo (3 de 3). Los dos grupos se necesitan; ni uno solo alcanza. Es el mismo reparto que en `lib/cache-delega.test.ts`, y la
// regla de `docs/MANTENIMIENTO.md` 8.b: un test que pasa con la implementación
// vieja y con la nueva no está probando el arreglo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guardarSinRomper } from "./escritura-cache.ts";
import { resolverConCache, type BackendCache } from "./reparar-y-cachear.ts";

// ---------------------------------------------------------------------------
// Un backend que se comporta como `guardar`: la escritura pasa por la política.
// ---------------------------------------------------------------------------

interface Banco {
  backend: BackendCache;
  guardado: Map<string, unknown>;
  avisos: { clave: string; error: unknown }[];
  intentosDeEscritura: number;
  lecturas: number;
  /** Lecturas que Redis rechazó y `leer` convirtió en MISS, como `getSuelto`. */
  lecturasFallidas: number;
  /** El estado de "Redis" se puede cambiar ENTRE requests: es lo que hace falta para modelar una caída y una recuperación. */
  redis: { lecturaFalla: boolean; escrituraFalla: boolean };
}

function banco(opts: {
  contenido?: Map<string, unknown>;
  escrituraFalla?: boolean;
  lecturaFalla?: boolean;
} = {}): Banco {
  const guardado = opts.contenido ?? new Map<string, unknown>();
  const avisos: { clave: string; error: unknown }[] = [];
  const b: Banco = {
    guardado, avisos, intentosDeEscritura: 0, lecturas: 0, lecturasFallidas: 0,
    redis: { lecturaFalla: opts.lecturaFalla ?? false, escrituraFalla: opts.escrituraFalla ?? false },
    backend: {
      async leer<T>(clave: string): Promise<T | null> {
        b.lecturas++;
        // El camino de lectura ya capturaba desde siempre (`getSuelto`,
        // lib/cache.ts): el cliente rechaza, se registra y se devuelve `null`,
        // o sea "no estaba". Se modela con la misma forma —lanzar y capturar—
        // para que "lectura fallida" sea un rechazo real, no un `null` a mano.
        try {
          if (b.redis.lecturaFalla) throw new Error("Redis caído");
          return (guardado.get(clave) as T) ?? null;
        } catch {
          b.lecturasFallidas++;
          return null;
        }
      },
      async escribir<T>(clave: string, valor: T): Promise<void> {
        b.intentosDeEscritura++;
        await guardarSinRomper({
          clave,
          escribir: async () => {
            if (b.redis.escrituraFalla) throw new Error("Redis caído");
            guardado.set(clave, valor);
          },
          avisar: (f) => { avisos.push(f); },
        });
      },
    },
  };
  return b;
}

/**
 * Cómo era `guardar` ANTES del arreglo, sobre el mismo banco: la escritura
 * rechaza y nadie la captura. Sirve de control en los escenarios compuestos —
 * si con este backend el mismo recorrido no rechaza, el test no distingue el
 * arreglo de su ausencia (docs/MANTENIMIENTO.md 8.b).
 */
function backendViejoSobre(b: Banco): BackendCache {
  return {
    leer: (clave) => b.backend.leer(clave),
    async escribir<T>(clave: string, valor: T): Promise<void> {
      b.intentosDeEscritura++;
      if (b.redis.escrituraFalla) throw new Error("Redis caído");
      b.guardado.set(clave, valor);
    },
  };
}

const PAYLOAD_BUENO = { hero: ["algo"], degradado: false };
const PAYLOAD_DEGRADADO = { hero: [], degradado: true };

/** Como lo arma `cachedIf`: `fallo` es lo contrario del predicado `vale`. */
const producir = (valor: unknown, fallo = false) => async () => ({ valor, fallo });

// ===========================================================================
// LOS CINCO ESCENARIOS PEDIDOS
// ===========================================================================

test("🔴 1. payload correcto + escritura fallida → SE ENTREGA el payload", async () => {
  const b = banco({ escrituraFalla: true });
  // Antes de este arreglo, esta línea RECHAZABA y el usuario recibía un 500.
  const v = await resolverConCache({
    clave: "home:x", ttl: 60, backend: b.backend, producir: producir(PAYLOAD_BUENO),
  });
  assert.deepEqual(v, PAYLOAD_BUENO, "el usuario no recibió el payload que ya estaba bien armado");
  assert.equal(b.intentosDeEscritura, 1, "tiene que haber INTENTADO guardar");
  assert.equal(b.guardado.has("home:x"), false, "no pudo guardar, y está bien: falló");
});

test("🔴 2. el error de escritura queda REGISTRADO", async () => {
  const b = banco({ escrituraFalla: true });
  await resolverConCache({
    clave: "home:x", ttl: 60, backend: b.backend, producir: producir(PAYLOAD_BUENO),
  });
  assert.equal(b.avisos.length, 1, "el fallo de escritura pasó en silencio");
  assert.equal(b.avisos[0].clave, "home:x", "el aviso no dice QUÉ clave no se pudo guardar");
  assert.match(String((b.avisos[0].error as Error).message), /Redis caído/,
    "el aviso perdió el error original");
});

test("🔴 3. payload degradado → se entrega y NO se intenta guardar (igual que hoy)", async () => {
  const b = banco({ escrituraFalla: true });
  const v = await resolverConCache({
    clave: "home:x", ttl: 60, backend: b.backend, producir: producir(PAYLOAD_DEGRADADO, true),
  });
  assert.deepEqual(v, PAYLOAD_DEGRADADO, "cambió lo que recibe el usuario con un payload degradado");
  // Lo importante: NI SIQUIERA lo intenta. Un degradado no se guarda, y esa
  // regla es anterior a este arreglo y no se tocó.
  assert.equal(b.intentosDeEscritura, 0, "intentó guardar un payload degradado");
  assert.equal(b.avisos.length, 0, "avisó de una escritura que nunca ocurrió");
});

test("🔴 4. lectura fallida → conserva el comportamiento actual", async () => {
  // Un fallo de lectura ya era un MISS, no una excepción (lib/cache.ts:189-195).
  // Con la caché "caída" para leer pero sana para escribir, el resultado es el
  // de siempre: se produce y se guarda.
  const b = banco({ lecturaFalla: true });
  const v = await resolverConCache({
    clave: "home:x", ttl: 60, backend: b.backend, producir: producir(PAYLOAD_BUENO),
  });
  assert.deepEqual(v, PAYLOAD_BUENO);
  assert.equal(b.lecturas, 1, "dejó de leer");
  assert.equal(b.guardado.get("home:x"), PAYLOAD_BUENO, "no guardó lo que produjo");
  assert.equal(b.avisos.length, 0, "una lectura fallida no es un fallo de escritura");
});

test("🔴 5. escritura correcta → conserva el comportamiento actual", async () => {
  const b = banco();
  const v = await resolverConCache({
    clave: "home:x", ttl: 60, backend: b.backend, producir: producir(PAYLOAD_BUENO),
  });
  assert.deepEqual(v, PAYLOAD_BUENO);
  assert.equal(b.guardado.get("home:x"), PAYLOAD_BUENO, "no guardó");
  assert.equal(b.avisos.length, 0, "avisó de un fallo que no existió");
});

// ===========================================================================
// LOS DOS ESCENARIOS QUE FALTABAN PARA EL CRITERIO DE CIERRE DEL #21
// ===========================================================================
// "Probados por separado: sólo lectura caída, sólo escritura caída, Redis
// entero caído, y recuperación." Los dos primeros son el 4 y el 1 de arriba;
// estos son los otros dos. Mismo criterio: la política compuesta con
// `resolverConCache` REAL, y cada uno con su control contra el backend viejo.

test("🔴 6. Redis ENTERO caído (lectura Y escritura fallan en el mismo recorrido)", async () => {
  const b = banco({ lecturaFalla: true, escrituraFalla: true });
  let producciones = 0;
  const v = await resolverConCache({
    clave: "home:x", ttl: 60, backend: b.backend,
    producir: async () => { producciones++; return { valor: PAYLOAD_BUENO, fallo: false }; },
  });
  // El payload correcto se entrega.
  assert.deepEqual(v, PAYLOAD_BUENO, "con Redis entero caído el usuario no recibió el payload correcto");
  assert.equal(producciones, 1, "tuvo que producir exactamente una vez (la lectura era un MISS)");
  // La lectura falló y fue un MISS, como siempre; la escritura falló y quedó
  // REGISTRADA como escritura, no como lectura.
  assert.equal(b.lecturas, 1);
  assert.equal(b.lecturasFallidas, 1, "la lectura tenía que fallar en este recorrido");
  assert.equal(b.intentosDeEscritura, 1, "tenía que INTENTAR guardar: el payload era bueno");
  assert.equal(b.avisos.length, 1, "el fallo de escritura no quedó registrado");
  assert.equal(b.avisos[0].clave, "home:x");
  // Y no quedó nada guardado.
  assert.equal(b.guardado.size, 0, "quedó algo guardado con Redis caído");
});

test("🔴 CONTROL del 6: el mismo recorrido con el `guardar` viejo RECHAZA", async () => {
  const b = banco({ lecturaFalla: true, escrituraFalla: true });
  await assert.rejects(
    () => resolverConCache({
      clave: "home:x", ttl: 60, backend: backendViejoSobre(b), producir: producir(PAYLOAD_BUENO),
    }),
    /Redis caído/,
    "con Redis entero caído el código viejo tendría que rechazar; si no, el 6 no prueba nada",
  );
  assert.equal(b.lecturasFallidas, 1, "la lectura también falló en el control");
  assert.equal(b.guardado.size, 0);
});

test("🔴 7. RECUPERACIÓN: caído → vuelve → la siguiente rearma y guarda → la tercera es HIT sin productor", async () => {
  const b = banco({ lecturaFalla: true, escrituraFalla: true });
  let producciones = 0;
  const pedir = () => resolverConCache({
    clave: "home:x", ttl: 60, backend: b.backend,
    producir: async () => { producciones++; return { valor: { ...PAYLOAD_BUENO, n: producciones }, fallo: false }; },
  });

  // 1. Redis caído: no puede leer ni guardar, pero entrega el payload.
  const primera = await pedir();
  assert.deepEqual(primera, { ...PAYLOAD_BUENO, n: 1 }, "la primera solicitud no entregó el payload");
  assert.equal(producciones, 1);
  assert.equal(b.lecturasFallidas, 1);
  assert.equal(b.avisos.length, 1, "la escritura fallida de la primera no quedó registrada");
  assert.equal(b.guardado.size, 0, "no tenía que quedar nada guardado mientras Redis estaba caído");

  // 2. Redis vuelve. La siguiente lee (MISS: nunca se guardó), rearma y guarda.
  b.redis = { lecturaFalla: false, escrituraFalla: false };
  const segunda = await pedir();
  assert.deepEqual(segunda, { ...PAYLOAD_BUENO, n: 2 }, "la segunda solicitud no rearmó");
  assert.equal(producciones, 2, "la segunda tenía que ejecutar el productor: no había nada guardado");
  assert.equal(b.lecturasFallidas, 1, "la lectura de la segunda no tenía que fallar");
  assert.deepEqual(b.guardado.get("home:x"), { ...PAYLOAD_BUENO, n: 2 }, "la segunda no guardó");
  assert.equal(b.avisos.length, 1, "la segunda avisó de un fallo que no existió");

  // 3. La tercera es un HIT: devuelve lo guardado y NO vuelve a producir.
  const tercera = await pedir();
  assert.deepEqual(tercera, { ...PAYLOAD_BUENO, n: 2 }, "la tercera no devolvió lo guardado por la segunda");
  assert.equal(producciones, 2, "🔴 la tercera volvió a ejecutar el productor: no hubo HIT");
  assert.equal(b.intentosDeEscritura, 2, "la tercera intentó guardar en un HIT");
  assert.equal(b.lecturas, 3);
});

test("🔴 CONTROL del 7: con el `guardar` viejo la primera solicitud RECHAZA y no hay recorrido", async () => {
  const b = banco({ lecturaFalla: true, escrituraFalla: true });
  await assert.rejects(
    () => resolverConCache({
      clave: "home:x", ttl: 60, backend: backendViejoSobre(b), producir: producir(PAYLOAD_BUENO),
    }),
    /Redis caído/,
  );
  // Lo que el arreglo cambia es SÓLO la primera solicitud. Después de volver,
  // el código viejo también rearma y guarda: eso no es mérito del arreglo y por
  // eso el 7 no lo reclama como tal.
  b.redis = { lecturaFalla: false, escrituraFalla: false };
  const v = await resolverConCache({
    clave: "home:x", ttl: 60, backend: backendViejoSobre(b), producir: producir(PAYLOAD_BUENO),
  });
  assert.deepEqual(v, PAYLOAD_BUENO);
  assert.deepEqual(b.guardado.get("home:x"), PAYLOAD_BUENO);
});

// ===========================================================================
// EL CONTROL QUE HACE VÁLIDOS A LOS CINCO
// ===========================================================================

test("🔴 CONTROL: sin el arreglo, el escenario 1 FALLA", async () => {
  // Si este test pasara con la implementación vieja Y con la nueva, no estaría
  // probando el arreglo. Es la regla de docs/MANTENIMIENTO.md 8.b, y el mismo
  // recurso que usa lib/fecha.test.ts: incluir la versión vieja y exigir que
  // se rompa.
  const backendViejo: BackendCache = {
    async leer() { return null; },
    // Así era `guardar`: sin catch, el rechazo se propaga.
    async escribir() { throw new Error("Redis caído"); },
  };
  await assert.rejects(
    () => resolverConCache({
      clave: "home:x", ttl: 60, backend: backendViejo, producir: producir(PAYLOAD_BUENO),
    }),
    /Redis caído/,
    "la implementación VIEJA tendría que rechazar; si no, este archivo no prueba nada",
  );
});

test("un acierto de caché no escribe ni avisa", async () => {
  const b = banco({ contenido: new Map([["home:x", PAYLOAD_BUENO]]), escrituraFalla: true });
  let produjo = false;
  const v = await resolverConCache({
    clave: "home:x", ttl: 60, backend: b.backend,
    producir: async () => { produjo = true; return { valor: PAYLOAD_DEGRADADO, fallo: false }; },
  });
  assert.deepEqual(v, PAYLOAD_BUENO, "un HIT dejó de devolver lo guardado");
  assert.equal(produjo, false, "un HIT ejecutó el fetcher");
  assert.equal(b.intentosDeEscritura, 0);
});

// ===========================================================================
// LA POLÍTICA, DIRECTA
// ===========================================================================

test("guardarSinRomper devuelve true cuando guardó y false cuando no", async () => {
  const avisos: unknown[] = [];
  assert.equal(
    await guardarSinRomper({ clave: "k", escribir: async () => {}, avisar: (f) => avisos.push(f) }),
    true,
  );
  assert.equal(avisos.length, 0);
  assert.equal(
    await guardarSinRomper({
      clave: "k", escribir: async () => { throw new Error("x"); }, avisar: (f) => avisos.push(f),
    }),
    false,
  );
  assert.equal(avisos.length, 1);
});

test("también captura si `escribir` lanza de forma SÍNCRONA", async () => {
  // Un cliente puede lanzar antes de devolver la promesa (una URL mal formada,
  // por ejemplo). Sin el `await` adentro del `try`, ese caso se escapaba.
  const avisos: unknown[] = [];
  const ok = await guardarSinRomper({
    clave: "k",
    escribir: (() => { throw new Error("sincrono"); }) as () => Promise<void>,
    avisar: (f) => avisos.push(f),
  });
  assert.equal(ok, false);
  assert.equal(avisos.length, 1);
});

test("no se traga nada que no sea la escritura", async () => {
  // Este módulo NO es un try/catch de propósito general. Si el error nace fuera
  // de `escribir`, tiene que seguir su camino.
  await assert.rejects(async () => {
    await guardarSinRomper({ clave: "k", escribir: async () => {}, avisar: () => {} });
    throw new Error("de afuera");
  }, /de afuera/);
});

// ===========================================================================
// QUE PRODUCCIÓN ENTRE POR ACÁ
// ===========================================================================
// lib/cache.ts no se puede importar desde node --test (arrastra Upstash), así
// que se inspecciona el fuente — mismo recurso y mismo motivo que
// lib/cache-delega.test.ts.

const fuente = readFileSync("lib/cache.ts", "utf8");

function cuerpoDeGuardar(): string {
  const i = fuente.indexOf("async function guardar(");
  assert.notEqual(i, -1, "no se encontró `guardar` en lib/cache.ts");
  const abre = fuente.indexOf("{", i);
  let nivel = 0;
  for (let j = abre; j < fuente.length; j++) {
    if (fuente[j] === "{") nivel++;
    else if (fuente[j] === "}") { nivel--; if (nivel === 0) return fuente.slice(abre + 1, j); }
  }
  throw new Error("no se pudo delimitar `guardar`");
}

test("🔴 `guardar` DELEGA en guardarSinRomper y no reimplementa la política", () => {
  const cuerpo = cuerpoDeGuardar();
  assert.match(cuerpo, /guardarSinRomper\(/, "guardar dejó de usar la política probada");
  assert.match(cuerpo, /avisar:/, "guardar no pasa el aviso: un fallo quedaría en silencio");
  assert.match(fuente, /import \{ guardarSinRomper \} from "\.\/escritura-cache"/,
    "cambió el import de la política");
});

test("🔴 el `redis.set` está ADENTRO de la política, no suelto en un try", () => {
  // ⚠️ La primera versión de este test miraba que no hubiera un `throw` en
  // `guardar`. Era VACUA: el código viejo tampoco tenía un `throw` literal —el
  // rechazo se propagaba solo, por el `await` sin `catch`— así que pasaba con el
  // bug adentro. Se comprobó corriéndolo contra `main:lib/cache.ts`.
  //
  // Lo que de verdad distingue una versión de la otra es DÓNDE vive el
  // `redis.set`: antes colgaba directo del `try`, ahora está adentro del
  // callback `escribir` que la política envuelve.
  const cuerpo = cuerpoDeGuardar();
  const iPolitica = cuerpo.indexOf("guardarSinRomper(");
  // `redis!.set(`, no `.set(` a secas: el branch sin Redis usa `mem.set(` y
  // aparece ANTES en el cuerpo.
  const iSet = cuerpo.indexOf("redis!.set(");
  assert.notEqual(iSet, -1, "desapareció el redis.set de guardar");
  assert.notEqual(iPolitica, -1, "guardar dejó de usar la política");
  assert.ok(iPolitica < iSet,
    "el redis.set quedó fuera de guardarSinRomper: su rechazo volvería a propagarse");
  assert.match(cuerpo.slice(iPolitica, iSet), /escribir:\s*async \(\) => \{/,
    "el redis.set no está dentro del callback `escribir` de la política");
  // El `finally` de las métricas se conserva: mide el tiempo pase lo que pase.
  // (El campo se llamaba `msCache`; desde la Etapa 0 es `redis.ms`, en
  // lib/metricas.ts.)
  assert.match(cuerpo, /finally \{[\s\S]*redis\.ms[\s\S]*\}/,
    "se perdió la medición de tiempo del caché");
});

test("el camino de LECTURA quedó intacto", () => {
  // El arreglo es de escritura. Si alguien tocó los catch de lectura mientras
  // tanto, esto lo caza.
  assert.match(fuente, /console\.error\("\[cache\] get falló, sigue sin cache:", err\)/,
    "cambió el manejo de un GET fallido");
  assert.match(fuente, /console\.error\("\[cache\] mget falló, sigue sin cache:", err\)/,
    "cambió el manejo de un MGET fallido");
});

test("el aviso distingue una escritura fallida de una lectura fallida", () => {
  // No es cosmético: una lectura caída es un MISS y ya; una escritura caída
  // significa además que el próximo request va a rearmar.
  const cuerpo = cuerpoDeGuardar();
  assert.match(cuerpo, /\[cache\] set falló/, "el mensaje no identifica la escritura");
  assert.match(cuerpo, /se entrega igual/, "el mensaje no dice qué recibió el usuario");
});
