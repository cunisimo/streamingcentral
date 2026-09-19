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
//     sólo la MUEVE de la clave de "crear" a la de la sala. Repetirla, o que
//     las respuestas lleguen en orden inverso, no cambia nada;
//   - `localStorage` va siempre detrás de try/catch: en privado, con la cuota
//     llena o bloqueado, se sigue con una credencial efímera (esa pestaña
//     participa mientras viva; al recargar habría que volver a entrar).
export interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export const CLAVE_CREAR = "yump:sala:credencial:crear";
export const claveSala = (roomId: string) => `yump:sala:${roomId}`;

const FORMA = /^[A-Za-z0-9_-]{43}$/;
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

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

function leer(store: Store, k: string): string | null {
  try { return store.getItem(k); } catch { return null; }
}
function escribir(store: Store, k: string, v: string): void {
  try { store.setItem(k, v); } catch { /* sin persistencia: efímera */ }
}
function borrar(store: Store, k: string): void {
  try { store.removeItem(k); } catch { /* noop */ }
}

function storePorDefecto(): Store {
  return globalThis.localStorage;
}

/** La persistida bajo `k` si tiene la forma; si no, genera una, la persiste y la devuelve. */
function oGenerar(store: Store, k: string): string {
  const actual = leer(store, k);
  if (esCredencial(actual)) return actual;
  const nueva = nuevaCredencial();
  escribir(store, k, nueva);
  return nueva;
}

/** La credencial con la que se va a llamar a `sala_crear`. Persistida antes de devolverla. */
export function credencialParaCrear(store: Store = storePorDefecto()): string {
  return oGenerar(store, CLAVE_CREAR);
}

/**
 * `sala_crear` respondió con `room_id`: la credencial de "crear" pasa a ser la
 * de esa sala. Si ya está movida (respuesta repetida, o dos reintentos cuya
 * respuesta llegó en cualquier orden) no hace nada.
 */
export function confirmarSala(roomId: string, store: Store = storePorDefecto()): void {
  const c = leer(store, CLAVE_CREAR);
  if (!esCredencial(c)) return;
  escribir(store, claveSala(roomId), c);
  borrar(store, CLAVE_CREAR);
}

/** La credencial con la que se va a llamar a `sala_unirse` / `sala_reclamar` en esa sala. */
export function credencialParaUnirse(roomId: string, store: Store = storePorDefecto()): string {
  return oGenerar(store, claveSala(roomId));
}

export function leerToken(roomId: string, store: Store = storePorDefecto()): string | null {
  const c = leer(store, claveSala(roomId));
  return esCredencial(c) ? c : null;
}

export function borrarToken(roomId: string, store: Store = storePorDefecto()): void {
  borrar(store, claveSala(roomId));
}
