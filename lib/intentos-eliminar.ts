// Límite de intentos de contraseña para eliminar la cuenta.
//
// POR QUÉ HACE FALTA IGUAL. El endpoint ya exige una sesión válida, así que
// nadie puede probar contraseñas contra una cuenta ajena: para llegar hasta acá
// ya hay que tener el token de esa persona. Pero un dispositivo abierto y
// desatendido —o un token robado— tendría intentos ilimitados para adivinar la
// contraseña, y esta es la única pantalla de la app donde acertar significa
// destruir la cuenta. Cinco intentos alcanzan para el que se equivocó tipeando
// y no para el que está probando.
//
// La cuenta se lleva POR USUARIO, no por IP: el usuario ya está identificado por
// el token y es lo que se quiere proteger. Una IP sería peor — un mismo hogar
// compartiría el cupo.
//
// Módulo puro: recibe el reloj y devuelve el estado nuevo. Así se puede probar
// el vencimiento sin esperar quince minutos.
export const MAX_INTENTOS = 5;
export const VENTANA_MS = 15 * 60 * 1000;

export interface Intentos {
  fallidos: number;
  // Cuándo fue el primero de la tanda. La ventana corre desde ahí y no desde el
  // último: si no, cinco intentos espaciados reabren el cupo para siempre.
  desde: number;
}

export function registrarFallo(actual: Intentos | null, ahora: number): Intentos {
  if (!actual || ahora - actual.desde > VENTANA_MS) return { fallidos: 1, desde: ahora };
  return { fallidos: actual.fallidos + 1, desde: actual.desde };
}

export function bloqueado(actual: Intentos | null, ahora: number): boolean {
  if (!actual) return false;
  if (ahora - actual.desde > VENTANA_MS) return false;   // la tanda venció
  return actual.fallidos >= MAX_INTENTOS;
}

// Cuántos minutos faltan para poder reintentar. Es lo que se le dice a la
// persona: "esperá N minutos" sirve, "demasiados intentos" no.
export function minutosRestantes(actual: Intentos | null, ahora: number): number {
  if (!bloqueado(actual, ahora)) return 0;
  return Math.max(1, Math.ceil((VENTANA_MS - (ahora - actual!.desde)) / 60000));
}
