// Las primitivas del turno (lib/turno.ts) y de la pausa (3.c.1) EMULADAS sobre
// un Map, con la semántica exacta de los scripts Lua del informe §4.3 y de
// lib/pausa-lua.ts. Es lo que lib/cache.ts usa cuando no hay credenciales de
// Redis (desarrollo), y lo que los tests de la secuencia
// (lib/home-servir.test.ts, lib/pausa-memoria.test.ts) usan como backend:
// producción y tests comparten estas reglas en vez de que cada test las
// reimplemente. El doble REST de Redis del banco ejecuta los scripts de la
// pausa POR TEXTO delegando en esta misma emulación.
//
// Sólo prueba la SECUENCIA: entre procesos no coordina nada, igual que el
// cache en memoria de siempre.
//
// El payload viaja como JSON (string), igual que hacia Redis, y se guarda
// PARSEADO: `batchGet` de lib/cache.ts devuelve lo que hay en el Map tal cual,
// y el cliente de Upstash devuelve el JSON ya parseado. Así el Home lee lo
// mismo con y sin Redis. Los hashes (cubos) se guardan como `Map` y las listas
// (eventos) como `string[]`.
import type { OpsTurno, OpsPausa } from "./turno";
import { CAMPOS_SALUD, CUBOS_EXPIRE_S, EVENTOS_EXPIRE_S, EVENTOS_MAX, MARCADOR_MS, PROC_MS, RING_CUBOS, SALUD_VENTANA_MIN } from "./pausa-lua.ts";

export type Entrada = { v: unknown; exp: number };

export function crearOpsEnMemoria(store: Map<string, Entrada>, ahora: () => number = Date.now): OpsTurno & OpsPausa {
  const vivo = (k: string): unknown => {
    const e = store.get(k);
    if (!e) return null;
    if (e.exp && e.exp <= ahora()) { store.delete(k); return null; }
    return e.v;
  };
  const texto = (k: string): string | null => { const v = vivo(k); return v === null || v === undefined ? null : String(v); };
  const parsear = (json: string): unknown => { try { return JSON.parse(json); } catch { return json; } };
  const pttl = (k: string): number => { if (vivo(k) === null) return -2; const e = store.get(k)!; return e.exp ? e.exp - ahora() : -1; };
  // El reloj de "Redis" es el mismo `ahora`: TIME dentro del script. Un script
  // lo lee UNA vez (`tiempoRedis`) y usa ese instante para todo lo que sella.
  const tiempoRedis = () => { const ms = ahora(); return { ms, minuto: Math.floor(ms / 60_000) }; };
  const hash = (k: string): Map<string, string> => { const v = vivo(k); if (v instanceof Map) return v as Map<string, string>; const m = new Map<string, string>(); store.set(k, { v: m, exp: 0 }); return m; };
  const hincrby = (k: string, campo: string, n: number) => { const m = hash(k); m.set(campo, String(Number(m.get(campo) ?? 0) + n)); };
  const expire = (k: string, s: number, en: number) => { const e = store.get(k); if (e) e.exp = en + s * 1000; };
  // El ring de cubos (lib/pausa-lua.ts): slot = minuto % RING; un slot de otro minuto se limpia antes de sumar.
  const cubo = (cubos: string, campo: string, t: { ms: number; minuto: number }) => {
    const m = hash(cubos), slot = t.minuto % RING_CUBOS;
    if (m.get(`${slot}:m`) !== String(t.minuto)) { m.delete(`${slot}:m`); for (const c of CAMPOS_SALUD) m.delete(`${slot}:${c}`); m.set(`${slot}:m`, String(t.minuto)); }
    hincrby(cubos, `${slot}:${campo}`, 1); expire(cubos, CUBOS_EXPIRE_S, t.ms);
  };
  const esEnteroPositivo = (s: string) => /^\d+$/.test(s) && Number(s) > 0;
  const esEntero = (s: string) => /^-?\d+$/.test(s);

  return {
    async setNx(clave, valor, px) {
      if (vivo(clave) !== null) return null;
      store.set(clave, { v: valor, exp: ahora() + px });
      return "OK";
    },
    async get(clave) { return texto(clave); },
    async evalTomar([turno, pausa], [propietario, px]) {
      const p = pttl(pausa);
      if (p > 0) return ["pausado", p];
      if (vivo(turno) === null) { store.set(turno, { v: propietario, exp: ahora() + Number(px) }); return ["adquirido"]; }
      return ["ocupado", texto(turno) ?? ""];
    },
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
    // --- la pausa (lib/pausa-lua.ts), en el orden exacto del Lua ---
    async evalPausar([pausa, ev, proc, eventos, cubos], [id, msTexto, contadorTexto, familia, retryAfterMs]) {
      if (!esEnteroPositivo(msTexto) || !esEntero(contadorTexto)) throw new Error("ERR PAUSAR: argumentos invalidos");
      const ms = Number(msTexto), contador = Number(contadorTexto);
      const t = tiempoRedis();   // UNA lectura de TIME por evento
      if (vivo(ev) !== null) { cubo(cubos, "ya-aplicada", t); return ["ya-aplicada", pttl(pausa)]; }
      const marca = Number(texto(proc) ?? "-1");
      if (contador <= marca) { cubo(cubos, "ya-aplicada", t); return ["ya-aplicada", pttl(pausa)]; }
      let restante = pttl(pausa);
      let estado: "escrito" | "ya-mayor";
      if (restante >= ms) estado = "ya-mayor";
      else { store.set(pausa, { v: id, exp: ahora() + ms }); estado = "escrito"; restante = ms; }
      store.set(proc, { v: String(contador), exp: ahora() + PROC_MS });
      store.set(ev, { v: "1", exp: ahora() + MARCADOR_MS });
      // pcall(telemetría): en la emulación no hay nada que pueda fallar. Mismo instante para los cubos y el evento.
      cubo(cubos, "429", t);
      cubo(cubos, estado === "escrito" ? "pausas" : "ya-mayor", t);
      const lista = (vivo(eventos) as string[] | null) ?? [];
      lista.unshift(JSON.stringify({ id, t: t.ms, familia, retryAfterMs, estado, restante }));
      lista.length = Math.min(lista.length, EVENTOS_MAX);
      store.set(eventos, { v: lista, exp: ahora() + EVENTOS_EXPIRE_S * 1000 });
      return [estado, restante];
    },
    async pttl(clave) { return pttl(clave); },
    async evalCubo([cubos], [campo]) { const t = tiempoRedis(); cubo(cubos, campo, t); return t.minuto; },
    async evalSalud([pausa, cubos]) {
      const { minuto } = tiempoRedis(), desde = minuto - (SALUD_VENTANA_MIN - 1);
      const suma = CAMPOS_SALUD.map(() => 0);
      const h = vivo(cubos);
      if (h instanceof Map) {
        const hm = h as Map<string, string>;
        for (const [k, v] of hm) {
          const sep = k.indexOf(":"); if (sep < 0) continue;
          const slot = k.slice(0, sep), campo = k.slice(sep + 1);
          const m = Number(hm.get(`${slot}:m`));
          if (!Number.isFinite(m) || m < desde || m > minuto) continue;
          const j = (CAMPOS_SALUD as readonly string[]).indexOf(campo);
          if (j >= 0) suma[j] += Number(v) || 0;
        }
      }
      return [pttl(pausa), ...suma];
    },
  };
}
