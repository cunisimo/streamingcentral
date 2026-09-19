// La credencial de participante (plan de salas, Tarea 3.1). Client-safe.
//
// LA CREDENCIAL ES EL TOKEN, Y LA GENERA EL CLIENTE. 32 bytes de
// `crypto.getRandomValues` en base64url (43 caracteres); la base sólo guarda
// su sha256 y NUNCA genera, devuelve ni rota tokens (009_salas.sql). Por eso:
//
//   - se persiste ANTES de la primera solicitud (`credencialParaCrear`,
//     `credencialParaUnirse`): un reintento —incluso concurrente— manda la
//     MISMA, y la base lo resuelve como la misma sala / participación;
//   - ninguna respuesta del servidor escribe la credencial. `confirmarSala`
//     sólo la MUEVE de la clave de "crear" a la de la sala, y borra el origen
//     ÚNICAMENTE si comprobó que el destino la conserva. Repetirla, o que las
//     respuestas lleguen en orden inverso, no cambia nada;
//   - `localStorage` va siempre detrás de try/catch. Si lanza (privado, cuota
//     llena, bloqueado) la pestaña sigue con una credencial EN MEMORIA, y esa
//     memoria es por clave y estable: todos los reintentos de la misma clave
//     en esta pestaña mandan la misma credencial. Lo que se pierde es la
//     persistencia entre recargas, no la idempotencia dentro de la pestaña.
export interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export const CLAVE_CREAR = "yump:sala:credencial:crear";
export const claveSala = (roomId: string) => `yump:sala:${roomId}`;

const FORMA = /^[A-Za-z0-9_-]{43}$/;
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Respaldo en memoria, por clave, para cuando el store no conserva. Vive lo que
// vive el módulo (la pestaña). Sólo los tests lo reinician.
const memoria = new Map<string, string>();
export function _reiniciarMemoriaParaTests(): void { memoria.clear(); }

export function esCredencial(v: unknown): v is string {
  return typeof v === "string" && FORMA.test(v);
}

/** base64url sin relleno de 32 bytes: 10 grupos de 3 → 40 chars, y 2 bytes sueltos → 3 chars. */
function base64url(b: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < b.length; i += 3) {
    const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    out += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63] + ALFABETO[(n >> 6) & 63] + ALFABETO[n & 63];
  }
  const resto = b.length - i;
  if (resto === 1) {
    const n = b[i] << 16;
    out += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63];
  } else if (resto === 2) {
    const n = (b[i] << 16) | (b[i + 1] << 8);
    out += ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63] + ALFABETO[(n >> 6) & 63];
  }
  return out;
}

function bytesAleatorios(): Uint8Array {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return b;
}

/** 32 bytes aleatorios en base64url. `fuente` sólo se inyecta en los tests. */
export function nuevaCredencial(fuente: () => Uint8Array = bytesAleatorios): string {
  return base64url(fuente());
}

/** Lo que hay bajo `k`: primero el store, si no la memoria. Sólo devuelve credenciales con forma válida. */
function leer(store: Store, k: string): string | null {
  try {
    const v = store.getItem(k);
    if (esCredencial(v)) return v;
  } catch { /* store roto: sigue la memoria */ }
  const m = memoria.get(k);
  return esCredencial(m) ? m : null;
}

/**
 * Guarda `v` bajo `k` y dice si el STORE la conserva (se relee para
 * comprobarlo: un `setItem` que no lanza pero no persiste —cuota, modo
 * privado de algún navegador— cuenta como no conservada). Si el store no la
 * conserva, queda en memoria; en cualquier caso la pestaña la recupera.
 */
function guardar(store: Store, k: string, v: string): boolean {
  let persistida = false;
  try { store.setItem(k, v); persistida = store.getItem(k) === v; } catch { persistida = false; }
  if (persistida) memoria.delete(k); else memoria.set(k, v);
  return persistida;
}

function borrar(store: Store, k: string): void {
  try { store.removeItem(k); } catch { /* noop */ }
  memoria.delete(k);
}

function storePorDefecto(): Store {
  return globalThis.localStorage;
}

/** La que hay bajo `k`; si no hay una válida, genera una, la guarda (store o memoria) y la devuelve. */
function oGenerar(store: Store, k: string): string {
  const actual = leer(store, k);
  if (actual) return actual;
  const nueva = nuevaCredencial();
  guardar(store, k, nueva);
  return nueva;
}

/** La credencial con la que se va a llamar a `sala_crear`. Guardada antes de devolverla. */
export function credencialParaCrear(store: Store = storePorDefecto()): string {
  return oGenerar(store, CLAVE_CREAR);
}

/**
 * `sala_crear` respondió con `room_id`: la credencial de "crear" pasa a ser la
 * de esa sala. El ORIGEN SE BORRA SÓLO SI EL DESTINO LA CONSERVA en el store:
 * si el store no la retiene bajo la clave de la sala, la pestaña la tiene en
 * memoria bajo esa clave y el origen persistido se deja como está —repetir
 * `sala_crear` con ella devuelve la misma sala, que es mejor que perderla—.
 * Si ya está movida (respuesta repetida, o dos reintentos cuya respuesta llegó
 * en cualquier orden) no hace nada.
 */
export function confirmarSala(roomId: string, store: Store = storePorDefecto()): void {
  const c = leer(store, CLAVE_CREAR);
  if (!c) return;
  const destino = claveSala(roomId);
  const persistida = guardar(store, destino, c);
  if (persistida) borrar(store, CLAVE_CREAR);
}

/** La credencial con la que se va a llamar a `sala_unirse` / `sala_reclamar` en esa sala. */
export function credencialParaUnirse(roomId: string, store: Store = storePorDefecto()): string {
  return oGenerar(store, claveSala(roomId));
}

export function leerToken(roomId: string, store: Store = storePorDefecto()): string | null {
  return leer(store, claveSala(roomId));
}

export function borrarToken(roomId: string, store: Store = storePorDefecto()): void {
  borrar(store, claveSala(roomId));
}
