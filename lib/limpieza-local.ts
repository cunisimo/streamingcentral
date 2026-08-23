// Qué se borra del dispositivo al eliminar la cuenta, y qué se conserva.
//
// LA REGLA NO ES "BORRAR TODO". Después de eliminar la cuenta la persona sigue
// pudiendo usar Yump como invitada, y obligarla a reelegir sus plataformas y su
// tema sería castigarla por irse. Se borra lo que es SUYO como cuenta; se deja
// lo que es del dispositivo.
//
// Módulo puro y sin `window` para poder probarlo: la decisión de qué clave cae
// en qué lado es exactamente lo que no puede equivocarse, y es lo único acá que
// se puede verificar sin un navegador.

// Estado PERSONAL: nace de haber usado la app con esa cuenta.
//
// `yump:ruleta-mostrados` es el caso menos obvio y por eso está primero: parece
// paginación, pero es la lista de qué títulos le mostró la ruleta a esa persona.
// Es historial de uso y se va con la cuenta.
export const CLAVES_PERSONALES = [
  "yump:ruleta-mostrados",
  "yump:hero-estado",
  "yump:lista-paginada",
  "yump:lista-vuelta",
  "yump:track-scroll",
] as const;

// Preferencias del DISPOSITIVO: existían antes de la cuenta y siguen después.
//
// `sc:platforms` es la que importa: es lo que permite seguir usando la app como
// invitada sin volver a configurar nada. La cookie `sc_platforms` la acompaña y
// tampoco se toca.
export const CLAVES_CONSERVADAS = [
  "sc:platforms",
  "sc:theme",
  "sc:pais",
  "sc:visits",
  "yump:shelf-type",
] as const;

export function esPersonal(clave: string): boolean {
  return (CLAVES_PERSONALES as readonly string[]).includes(clave);
}

// La sesión de Supabase vive bajo `sb-<ref>-auth-token`, que depende del
// proyecto y no se puede escribir a mano. La borra `signOut()`; esto es la red
// por debajo, para el caso de que `signOut` falle después de que el servidor ya
// borró la cuenta — ahí el token no sirve para nada pero seguiría ocupando lugar
// y dejando a la interfaz creyendo que hay sesión.
export function esSesionSupabase(clave: string): boolean {
  return clave.startsWith("sb-") && clave.endsWith("-auth-token");
}

// Qué claves de las presentes hay que borrar. Se pasa la lista para poder
// probarlo sin `window` y para no depender de en qué storage esté cada una.
export function clavesABorrar(presentes: string[]): string[] {
  return presentes.filter((k) => esPersonal(k) || esSesionSupabase(k));
}
