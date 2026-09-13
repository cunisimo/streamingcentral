// Las seis primitivas del turno (lib/turno.ts) EMULADAS sobre un Map, con la
// semántica exacta de los scripts Lua del informe §4.3. Es lo que lib/cache.ts
// usa cuando no hay credenciales de Redis (desarrollo), y lo que los tests de
// la secuencia (lib/home-servir.test.ts) usan como backend: producción y tests
// comparten estas reglas en vez de que cada test las reimplemente.
//
// Sólo prueba la SECUENCIA: entre procesos no coordina nada, igual que el
// cache en memoria de siempre. El banco aislado usa el doble REST de Redis,
// que implementa los mismos cuatro scripts por texto.
//
// El payload viaja como JSON (string), igual que hacia Redis, y se guarda
// PARSEADO: `batchGet` de lib/cache.ts devuelve lo que hay en el Map tal cual,
// y el cliente de Upstash devuelve el JSON ya parseado. Así el Home lee lo
// mismo con y sin Redis.
import type { OpsTurno } from "./turno";

export type Entrada = { v: unknown; exp: number };

export function crearOpsEnMemoria(store: Map<string, Entrada>, ahora: () => number = Date.now): OpsTurno {
  const vivo = (k: string): unknown => {
    const e = store.get(k);
    if (!e) return null;
    if (e.exp && e.exp <= ahora()) { store.delete(k); return null; }
    return e.v;
  };
  const texto = (k: string): string | null => { const v = vivo(k); return v === null || v === undefined ? null : String(v); };
  const parsear = (json: string): unknown => { try { return JSON.parse(json); } catch { return json; } };
  return {
    async setNx(clave, valor, px) {
      if (vivo(clave) !== null) return null;
      store.set(clave, { v: valor, exp: ahora() + px });
      return "OK";
    },
    async get(clave) { return texto(clave); },
    async evalRenovar(clave, propietario, px) {
      if (texto(clave) !== propietario) return 0;
      store.set(clave, { v: propietario, exp: ahora() + px });
      return 1;
    },
    async evalPublicar([turno, fresca, ub, gen], [propietario, frescaJson, ttlFrescaS, ubJson, ttlUbS, dia]) {
      if (texto(turno) !== propietario) return 0;
      const g = texto(gen);
      const diaGuardado = g ? g.slice(0, 10) : "";
      if (diaGuardado > dia) {
        store.set(fresca, { v: parsear(frescaJson), exp: ahora() + Number(ttlFrescaS) * 1000 });
        store.delete(turno);
        return -1;
      }
      store.set(fresca, { v: parsear(frescaJson), exp: ahora() + Number(ttlFrescaS) * 1000 });
      store.set(ub, { v: parsear(ubJson), exp: ahora() + Number(ttlUbS) * 1000 });
      store.set(gen, { v: `${dia}:${propietario}`, exp: ahora() + Number(ttlUbS) * 1000 });
      store.delete(turno);
      return 1;
    },
    async evalEnfriar([turno, degradado], [propietario, degradadoJson, ms]) {
      if (texto(turno) !== propietario) return 0;
      store.set(turno, { v: `enfriando:${propietario}`, exp: ahora() + Number(ms) });
      store.set(degradado, { v: parsear(degradadoJson), exp: ahora() + Number(ms) });
      return 1;
    },
    async evalLiberar(clave, propietario) {
      if (texto(clave) !== propietario) return 0;
      store.delete(clave);
      return 1;
    },
  };
}
