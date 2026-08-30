// Un fallo de disponibilidad no puede quedar congelado en una caché exterior.
//
// 🔴 EL AGUJERO QUE ESTE ARCHIVO CIERRA. `disponibilidadDe` no guardaba su
// propio `disp:` cuando la evidencia fallaba — hasta ahí bien. Pero devolvía
// sólo el array de plataformas, así que la señal se perdía, y **más afuera sí se
// guardaba**: la card hasta 24 h (`TTL.catalog`), el Home 6 h (`TTL.home`) y
// "Últimos lanzamientos" con la lista incompleta. Una caída de Supabase de dos
// segundos dejaba títulos en gris durante un día entero.
//
// La señal viaja por contexto async, igual que `withCacheMetrics` y las métricas
// de idioma: si se pasara por parámetro habría que enhebrarla por `toUITitle` →
// `enrichRaw` → `listByCategory` → cada llamador, y alcanzaría con que UNO se la
// olvidara para volver al mismo bug.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hayFallosDisponibilidad, registrarFalloDisponibilidad, withFallosDisponibilidad,
} from "./fallos-disponibilidad.ts";
import { resolverConCache, type BackendCache } from "./reparar-y-cachear.ts";

function backend(): BackendCache & { escrituras: number; datos: Map<string, unknown> } {
  const datos = new Map<string, unknown>();
  return {
    datos,
    escrituras: 0,
    // `leer` devuelve el VALOR, no un envoltorio: es el contrato real de
    // `resolverConCache`, y equivocarlo hacía pasar los tests por el motivo
    // equivocado (todo era MISS).
    async leer(clave: string) {
      return datos.has(clave) ? datos.get(clave) : null;
    },
    async escribir(clave: string, valor: unknown) {
      this.escrituras++;
      datos.set(clave, valor);
    },
  } as BackendCache & { escrituras: number; datos: Map<string, unknown> };
}

// ============================================================================
// El contador
// ============================================================================

test("sin fallos, el contador queda en cero", async () => {
  const { fallos } = await withFallosDisponibilidad(async () => "ok");
  assert.equal(fallos, 0);
});

test("un fallo registrado se cuenta", async () => {
  const { res, fallos } = await withFallosDisponibilidad(async () => {
    registrarFalloDisponibilidad();
    return "ok";
  });
  assert.equal(res, "ok", "el resultado se devuelve igual: se responde con lo que hay");
  assert.equal(fallos, 1);
});

test("varios fallos se acumulan", async () => {
  const { fallos } = await withFallosDisponibilidad(async () => {
    registrarFalloDisponibilidad();
    registrarFalloDisponibilidad();
    registrarFalloDisponibilidad();
  });
  assert.equal(fallos, 3);
});

test("dos contextos no se mezclan, ni corriendo en paralelo", async () => {
  const [a, b] = await Promise.all([
    withFallosDisponibilidad(async () => {
      await new Promise((r) => setTimeout(r, 5));
      registrarFalloDisponibilidad();
    }),
    withFallosDisponibilidad(async () => "limpio"),
  ]);
  assert.equal(a.fallos, 1);
  assert.equal(b.fallos, 0, "un contexto limpio se contaminó con el fallo del otro");
});

test("registrar fuera de un contexto no explota", () => {
  // Pasa en cualquier camino que no envuelva: no puede tirar el request.
  assert.doesNotThrow(() => registrarFalloDisponibilidad());
  assert.equal(hayFallosDisponibilidad(), false);
});

test("el contador es visible DESDE ADENTRO, que es donde decide el predicado", async () => {
  await withFallosDisponibilidad(async () => {
    assert.equal(hayFallosDisponibilidad(), false);
    registrarFalloDisponibilidad();
    assert.equal(hayFallosDisponibilidad(), true);
  });
});

// ============================================================================
// Fallo → no se guarda → el siguiente pedido reintenta
// ============================================================================
//
// Se prueba contra `resolverConCache`, que es la MISMA función en la que
// delegan `cachedIf` y `cachedLocIf` en producción. Es el patrón que ya usa
// lib/top-plataformas.test.ts: inyectarle un backend en memoria en vez de
// reimplementar la semántica del cache.

/** Simula una superficie cacheada que consume disponibilidad. */
async function superficie(
  b: BackendCache, clave: string, producir: () => Promise<string>,
): Promise<string> {
  const { res, fallos } = await withFallosDisponibilidad(async () => {
    return resolverConCache<string>({
      clave, ttl: 60, backend: b,
      producir: async () => {
        const valor = await producir();
        // El predicado se evalúa DENTRO del contexto: es lo que hace que la
        // superficie sepa que su contenido puede estar incompleto.
        return { valor, fallo: hayFallosDisponibilidad() };
      },
    });
  });
  void fallos;
  return res;
}

for (const caso of ["card", "home", "lista-ultimos"]) {
  test(`${caso}: un fallo NO se guarda y el pedido siguiente reintenta`, async () => {
    const b = backend();
    let intentos = 0;

    // 1er pedido: la fuente de evidencia se cae.
    const primero = await superficie(b, `${caso}:x`, async () => {
      intentos++;
      registrarFalloDisponibilidad();
      return "incompleto";
    });
    assert.equal(primero, "incompleto", "tiene que responder con lo que hay");
    assert.equal(b.datos.has(`${caso}:x`), false, "guardó un resultado incompleto");

    // 2do pedido: se vuelve a intentar la fuente caída, y ahora anda.
    const segundo = await superficie(b, `${caso}:x`, async () => {
      intentos++;
      return "completo";
    });
    assert.equal(intentos, 2, "no reintentó: sirvió el incompleto desde el cache");
    assert.equal(segundo, "completo");
    assert.equal(b.datos.get(`${caso}:x`), "completo", "no guardó el resultado bueno");

    // 3er pedido: ahora sí es HIT y no vuelve a producir.
    const tercero = await superficie(b, `${caso}:x`, async () => {
      intentos++;
      return "no deberia llamarse";
    });
    assert.equal(intentos, 2, "produjo de nuevo teniendo un resultado bueno cacheado");
    assert.equal(tercero, "completo");
  });
}

test("un resultado SIN fallos se guarda a la primera", async () => {
  const b = backend();
  await superficie(b, "ok:1", async () => "completo");
  assert.equal(b.datos.get("ok:1"), "completo");
});

// ============================================================================
// Contextos ANIDADOS — el agujero que la primera versión no veía
// ============================================================================
//
// 🔴 EL BUG. `withFallosDisponibilidad` creaba un contador nuevo por llamada y
// `registrarFalloDisponibilidad` incrementaba SÓLO el más interno. En la
// composición real eso es fatal: `homePayload` envuelve, y adentro
// `titleCard`/`ultimosRegionalPagina` vuelven a envolver. El hijo no guardaba su
// caché —bien— pero el padre no se enteraba y **el Home sí se guardaba**, con el
// contenido incompleto adentro, por 6 horas.
//
// Los tests que había sólo miraban UN contexto, así que pasaban con el bug.

test("ANIDADO: un fallo del hijo llega al padre", async () => {
  const { fallos } = await withFallosDisponibilidad(async () => {
    const hijo = await withFallosDisponibilidad(async () => {
      registrarFalloDisponibilidad();
    });
    assert.equal(hijo.fallos, 1, "el hijo no contó su propio fallo");
  });
  assert.equal(fallos, 1, "el padre no recibió el fallo del hijo");
});

test("ANIDADO: se cuenta EXACTAMENTE una vez, no dos", async () => {
  const { fallos } = await withFallosDisponibilidad(async () => {
    await withFallosDisponibilidad(async () => registrarFalloDisponibilidad());
  });
  assert.equal(fallos, 1);
});

test("ANIDADO: varios hijos acumulan", async () => {
  const { fallos } = await withFallosDisponibilidad(async () => {
    await withFallosDisponibilidad(async () => registrarFalloDisponibilidad());
    await withFallosDisponibilidad(async () => { /* sano */ });
    await withFallosDisponibilidad(async () => {
      registrarFalloDisponibilidad();
      registrarFalloDisponibilidad();
    });
  });
  assert.equal(fallos, 3);
});

test("ANIDADO: hijos en PARALELO acumulan", async () => {
  const { fallos } = await withFallosDisponibilidad(async () => {
    await Promise.all([
      withFallosDisponibilidad(async () => registrarFalloDisponibilidad()),
      withFallosDisponibilidad(async () => registrarFalloDisponibilidad()),
      withFallosDisponibilidad(async () => { /* sano */ }),
    ]);
  });
  assert.equal(fallos, 2);
});

test("ANIDADO: tres niveles", async () => {
  const { fallos } = await withFallosDisponibilidad(async () => {
    await withFallosDisponibilidad(async () => {
      await withFallosDisponibilidad(async () => registrarFalloDisponibilidad());
    });
  });
  assert.equal(fallos, 1, "el fallo del nieto no llegó a la raíz");
});

test("ANIDADO: el padre lo ve DESPUÉS de que el hijo termina", async () => {
  await withFallosDisponibilidad(async () => {
    assert.equal(hayFallosDisponibilidad(), false);
    await withFallosDisponibilidad(async () => registrarFalloDisponibilidad());
    assert.equal(hayFallosDisponibilidad(), true,
      "el predicado del padre no vería el fallo del hijo");
  });
});

test("ANIDADO: dos contextos SUPERIORES en paralelo no se contaminan", async () => {
  const [a, b] = await Promise.all([
    withFallosDisponibilidad(async () => {
      await withFallosDisponibilidad(async () => {
        await new Promise((r) => setTimeout(r, 5));
        registrarFalloDisponibilidad();
      });
    }),
    withFallosDisponibilidad(async () => {
      await withFallosDisponibilidad(async () => { /* sano */ });
    }),
  ]);
  assert.equal(a.fallos, 1);
  assert.equal(b.fallos, 0, "un request limpio se contaminó con el fallo de otro");
});

test("ANIDADO: si el hijo LANZA, la excepción no se esconde", async () => {
  await assert.rejects(
    () => withFallosDisponibilidad(async () => {
      await withFallosDisponibilidad(async () => { throw new Error("boom"); });
    }),
    /boom/,
  );
});

test("ANIDADO: un hijo que lanza igual propaga lo que alcanzó a registrar", async () => {
  const { fallos } = await withFallosDisponibilidad(async () => {
    try {
      await withFallosDisponibilidad(async () => {
        registrarFalloDisponibilidad();
        throw new Error("boom");
      });
    } catch { /* el padre decide seguir */ }
  });
  assert.equal(fallos, 1, "se perdió el fallo del hijo que lanzó");
});

test("no hay estado de módulo compartido: dos raíces seguidas arrancan en cero", async () => {
  const a = await withFallosDisponibilidad(async () => registrarFalloDisponibilidad());
  const b = await withFallosDisponibilidad(async () => { /* sano */ });
  assert.equal(a.fallos, 1);
  assert.equal(b.fallos, 0);
});

// ============================================================================
// La COMPOSICIÓN real: caché exterior conteniendo cachés interiores
// ============================================================================
//
// Reproduce la forma exacta que tiene el código: `homePayload` envuelve con el
// contexto y llama a `cachedLocIf` (Home), y adentro `titleCard`,
// `ultimosRegionalPagina` y `ultimosExtrasPorRed` vuelven a envolver con SU
// propio contexto y SU propio `cachedLocIf`.
//
// ⚠️ No se reimplementa la semántica del cache: se usa `resolverConCache`, que
// es la MISMA función en la que delegan `cachedIf` y `cachedLocIf` en
// producción (`lib/cache.ts` no se puede importar acá porque es `server-only`,
// que es un guard de build por las credenciales de Upstash). Lo único simulado
// son los productores de datos.

/** Una superficie cacheada: envuelve con el contexto y decide con su resultado. */
async function superficieReal<T>(
  b: BackendCache, clave: string, producir: () => Promise<T>,
): Promise<T> {
  const { res, fallos } = await withFallosDisponibilidad(async () =>
    resolverConCache<T>({
      clave, ttl: 60, backend: b,
      producir: async () => ({ valor: await producir(), fallo: hayFallosDisponibilidad() }),
    }));
  // El fallo del hijo ya subió al contexto de ESTA superficie al salir; si esta
  // superficie está adentro de otra, su propio `finally` lo sube más arriba.
  void fallos;
  return res;
}

test("COMPOSICIÓN: un fallo adentro impide guardar la caché INTERNA y la EXTERNA", async () => {
  const b = backend();
  let veces = 0;

  const home = () => superficieReal(b, "home:x", async () => {
    // Dos tarjetas: una sana y una que se apoya en evidencia caída.
    const a = await superficieReal(b, "card:1", async () => "card-1");
    const c = await superficieReal(b, "card:2", async () => {
      veces++;
      if (veces === 1) registrarFalloDisponibilidad();
      return veces === 1 ? "card-2-incompleta" : "card-2-completa";
    });
    return `${a}|${c}`;
  });

  // 1er pedido: la evidencia se cae adentro de una card.
  assert.equal(await home(), "card-1|card-2-incompleta", "tiene que responder igual");
  assert.equal(b.datos.has("card:2"), false, "guardó la card incompleta");
  assert.equal(b.datos.has("home:x"), false,
    "guardó el HOME con la card incompleta adentro: es el bug que esto cierra");
  // La card sana sí se guarda: su contexto no vio ningún fallo.
  assert.equal(b.datos.get("card:1"), "card-1");

  // 2do pedido: se reintenta la card caída y ahora anda.
  assert.equal(await home(), "card-1|card-2-completa");
  assert.equal(veces, 2, "no reintentó la card caída");
  assert.equal(b.datos.get("card:2"), "card-2-completa");
  assert.equal(b.datos.get("home:x"), "card-1|card-2-completa", "no guardó el Home sano");

  // 3er pedido: HIT del Home, sin producir nada.
  assert.equal(await home(), "card-1|card-2-completa");
  assert.equal(veces, 2, "produjo de nuevo teniendo el Home cacheado");
});

test("COMPOSICIÓN: los dos tramos de la lista de últimos, adentro del Home", async () => {
  // `ultimosRegionalPagina` y `ultimosExtrasPorRed` son dos cachés hermanas
  // adentro del mismo Home. Un fallo en cualquiera tiene que frenar el Home.
  for (const queFalla of ["reg", "red"]) {
    const b = backend();
    const home = () => superficieReal(b, "home:y", async () => {
      const [reg, red] = await Promise.all([
        superficieReal(b, "ultimos:reg:p1", async () => {
          if (queFalla === "reg") registrarFalloDisponibilidad();
          return "reg";
        }),
        superficieReal(b, "ultimos:red", async () => {
          if (queFalla === "red") registrarFalloDisponibilidad();
          return "red";
        }),
      ]);
      return `${reg}+${red}`;
    });
    await home();
    assert.equal(b.datos.has("home:y"), false,
      `falló ${queFalla} y el Home se guardó igual`);
    assert.equal(b.datos.has(`ultimos:${queFalla === "reg" ? "reg:p1" : "red"}`), false,
      `el tramo ${queFalla} se guardó pese al fallo`);
    // El tramo sano sí se guarda.
    const sano = queFalla === "reg" ? "ultimos:red" : "ultimos:reg:p1";
    assert.equal(b.datos.has(sano), true, "el tramo sano no se guardó");
  }
});

test("COMPOSICIÓN: un Home totalmente sano se guarda a la primera y después es HIT", async () => {
  const b = backend();
  let producciones = 0;
  const home = () => superficieReal(b, "home:z", async () => {
    producciones++;
    await superficieReal(b, "card:9", async () => "ok");
    return "home-ok";
  });
  assert.equal(await home(), "home-ok");
  assert.equal(b.datos.get("home:z"), "home-ok");
  assert.equal(await home(), "home-ok");
  assert.equal(producciones, 1, "no fue HIT");
});

// ============================================================================
// Búsqueda y Top: DOS señales que no se tapan entre sí
// ============================================================================
//
// `search()` y `popularBlock()` ya tenían un `fallo` propio, pero representaba
// SÓLO el respaldo de idioma. La disponibilidad fallaba fuera de todo contexto y
// no llegaba al predicado, así que un resultado con títulos en gris se guardaba
// 1 h (búsqueda) y 24 h (Top). Esto reproduce la forma exacta que quedó: el
// predicado mira `fallo`, y `fallo` se pone en true si falla el idioma O la
// disponibilidad.

/** Una superficie con las dos señales, como search() y popularBlock(). */
async function superficieDosSenales<T>(
  b: BackendCache, clave: string,
  producir: () => Promise<{ valor: T; falloIdioma: boolean }>,
): Promise<T> {
  let fallo = false;
  return resolverConCache<T>({
    clave, ttl: 60, backend: b,
    producir: async () => {
      const { res, fallos } = await withFallosDisponibilidad(async () => {
        const r = await producir();
        fallo = r.falloIdioma;
        return r.valor;
      });
      if (fallos) fallo = true;
      return { valor: res, fallo };
    },
  });
}

for (const caso of ["búsqueda", "Top por popularidad"]) {
  test(`${caso}: fallo de disponibilidad -> parcial, no se guarda, reintenta`, async () => {
    const b = backend();
    let intentos = 0;
    const pedir = () => superficieDosSenales(b, `${caso}:k`, async () => {
      intentos++;
      if (intentos === 1) registrarFalloDisponibilidad();
      return { valor: intentos === 1 ? "parcial" : "completo", falloIdioma: false };
    });

    assert.equal(await pedir(), "parcial", "tiene que devolver el resultado parcial");
    assert.equal(b.datos.has(`${caso}:k`), false, "guardó el resultado parcial");

    assert.equal(await pedir(), "completo", "no volvió a ejecutar la resolución");
    assert.equal(intentos, 2);
    assert.equal(b.datos.get(`${caso}:k`), "completo", "no guardó el resultado sano");

    assert.equal(await pedir(), "completo");
    assert.equal(intentos, 2, "no fue HIT");
  });
}

test("las dos señales se combinan: ninguna tapa a la otra", async () => {
  // Cuatro combinaciones. Sólo la de abajo a la derecha se guarda.
  for (const [idioma, disp, guarda] of [
    [false, false, true],
    [true, false, false],
    [false, true, false],
    [true, true, false],
  ] as [boolean, boolean, boolean][]) {
    const b = backend();
    await superficieDosSenales(b, "combi", async () => {
      if (disp) registrarFalloDisponibilidad();
      return { valor: "x", falloIdioma: idioma };
    });
    assert.equal(
      b.datos.has("combi"), guarda,
      `idioma=${idioma} disponibilidad=${disp}: se esperaba guardar=${guarda}`,
    );
  }
});

test("un fallo de idioma NO se pierde cuando la disponibilidad está sana", async () => {
  // El riesgo del cableado: sobrescribir `fallo` con el resultado del contexto.
  const b = backend();
  await superficieDosSenales(b, "solo-idioma", async () => {
    return { valor: "x", falloIdioma: true };
  });
  assert.equal(b.datos.has("solo-idioma"), false, "el fallo de idioma se perdió");
});
