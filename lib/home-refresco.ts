// Política de refresco del payload del Home: cuánto vive cada resultado y en
// qué condiciones se permite ignorar lo guardado y rearmar.
//
// Vive en su propio módulo y NO en lib/home.ts ni en lib/cache.ts por la misma
// razón que `lib/fecha.ts`: esos dos son `server-only` y un test de Node no
// puede importarlos. Acá no hay nada de servidor — son dos funciones puras — y
// es justamente la lógica que hay que poder probar, porque es de seguridad.

// Lo mínimo que necesita saber la política de un payload. Se declara acá y no
// se importa `HomePayload` para no arrastrar `lib/home.ts` (server-only) a un
// test; `HomePayload` lo satisface estructuralmente.
export interface EstadoPayload {
  degradado: boolean;
  sinPlataformas?: boolean;
}

export interface Ttls {
  home: number;
  homeDegradado: number;
}

// Cuántos segundos merece vivir un resultado, o `null` para no guardarlo.
//
//  - "sin plataformas" no se guarda: no cuesta nada recalcularlo.
//  - degradado se guarda POCO. No guardarlo era peor de lo que parecía:
//    durante una caída de TMDB, CADA request rearmaba el Home entero (~500
//    llamadas) contra el servicio que ya estaba fallando.
//  - completo, el día entero.
export function ttlDePayload(v: EstadoPayload, ttl: Ttls): number | null {
  if (v.sinPlataformas) return null;
  return v.degradado ? ttl.homeDegradado : ttl.home;
}

export interface Refresco {
  // Lo que pidió el cliente (`?fresh=1`). Es una SOLICITUD, no una orden.
  pedido: boolean;
  // Lo que hay guardado, o null si no hay nada.
  guardado: EstadoPayload | null;
  // Si el cortafuegos de frecuencia dejó pasar este intento. Lo resuelve el
  // llamador contra el cache (una marca con vencimiento corto), porque tiene
  // que ser compartida entre requests y entre instancias.
  turno: boolean;
}

// ¿Se rearma ignorando lo guardado?
//
// ESTO ES UNA DEFENSA, NO UNA COMODIDAD. Con el bypass decidido por el cliente,
// cualquiera podía pedir `/api/home?fresh=1` en bucle y forzar un rearmado
// completo por request: ~558 comandos de Upstash y ~516 llamadas a TMDB cada
// vez. Eso vacía las dos cuotas en minutos, desde una pestaña, sin autenticar.
//
// Por eso la decisión la toma el SERVIDOR y mirando lo que hay guardado:
//
//   1. Si no hay nada guardado, no hay nada que saltear: se arma normal.
//   2. Si lo guardado está SANO, `fresh` se ignora. Un payload sano es la
//      respuesta correcta y no hay motivo legítimo para descartarlo.
//   3. Solo si lo guardado está DEGRADADO se considera rearmar — que es el
//      único caso donde reintentar tiene sentido para el usuario.
//   4. Y aun así hace falta `turno`: durante una caída de TMDB, mil personas
//      apretando "Reintentar" no pueden convertirse en mil rearmados contra el
//      servicio caído. El turno es lo que convierte eso en uno cada tanto.
//
// El reintento de un solo uso del cliente es un refuerzo, no la defensa: nada
// impide pedir la URL a mano.
export function permiteRearmar(r: Refresco): boolean {
  if (!r.guardado) return false;      // no hay nada guardado: el camino normal ya arma
  if (!r.pedido) return false;
  if (!r.guardado.degradado) return false;
  return r.turno;
}
