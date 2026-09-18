// Una lectura con TOPE (Etapa 3.c.1, auditoría sobre 6fc63b5, punto 1).
//
// Con la pausa LOCAL ante 429 vigente no hay nada que componer, así que ninguna
// lectura de Redis merece esperar los 6 reintentos del SDK (4,3 s de backoff
// cada una; medido: 23,1 s hasta un 503). Lo que no llega en `ms` se da por
// ausente (`null`), un rechazo también, y una respuesta que llega después del
// tope se ignora: la promesa original sigue su curso (el SDK no cancela por
// petición), pero nadie la espera. Puro: `dormir` se inyecta (reloj virtual en
// los tests) y por defecto es el `dormirCancelable` de la secuencia del Home.
// Lo usan lib/home-servir.ts (fresca, UB) y lib/home.ts (la lectura previa del
// vuelo), SÓLO con la pausa local vigente: el camino sano no pasa por acá.
/** El mismo dormir cancelable de la secuencia del Home (copiado, no importado: lib/home-servir.ts importa este módulo). */
function dormirCancelable(ms: number, senal?: AbortSignal): Promise<void> {
  return new Promise<void>((r) => {
    if (senal?.aborted) { r(); return; }
    const alAbortar = () => { clearTimeout(timer); r(); };
    const timer = setTimeout(() => { senal?.removeEventListener("abort", alAbortar); r(); }, ms);
    senal?.addEventListener("abort", alAbortar, { once: true });
  });
}

export async function conTope<T>(lectura: Promise<T>, ms: number, dormir: (ms: number, senal?: AbortSignal) => Promise<void> = dormirCancelable): Promise<T | null> {
  const tope = new AbortController();
  const r = await Promise.race([lectura.then((v) => v as T | null, () => null), dormir(ms, tope.signal).then(() => null)]);
  tope.abort();   // sin temporizador vivo si la lectura llegó antes
  return r;
}
