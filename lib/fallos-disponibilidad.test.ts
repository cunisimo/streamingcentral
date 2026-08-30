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
