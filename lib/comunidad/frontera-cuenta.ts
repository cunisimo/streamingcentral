// La frontera por cuenta de las pantallas comunitarias (corrección A1 de la
// auditoría de E3b). PURO y apto para el cliente.
//
// Cada pantalla monta su estado de nuevo por cuenta (`key={uid}`), así que la
// lista, los títulos, los mensajes y los diálogos de A no existen en B. Eso no
// alcanza para lo que ya salió: una lectura o una operación de A puede volver
// después del cambio, o una carga vieja de la MISMA cuenta después de una
// nueva. La frontera decide qué respuesta todavía vale:
//   - sólo la de una instancia viva (no desmontada por el cambio de cuenta o
//     el cierre de sesión);
//   - en las cargas, sólo la última generación (`carga()`).
// Y el pedido sólo sale con el token si la sesión sigue siendo de la cuenta
// que lo inició (`tokenDeCuenta`): si cambió en el medio, no se envía nada en
// nombre de otra.

export interface Frontera {
  readonly uid: string;
  /** Una carga nueva: las anteriores dejan de valer. */
  carga(): number;
  /** ¿Sigue valiendo? Sin `gen`, sólo exige que la instancia esté viva. */
  vigente(gen?: number): boolean;
  abrir(): void;
  cerrar(): void;
}

export function crearFrontera(uid: string): Frontera {
  let vivo = true;
  let gen = 0;
  return {
    uid,
    carga: () => ++gen,
    vigente: (g) => vivo && (g === undefined || g === gen),
    // Strict Mode desmonta y vuelve a montar los efectos: abrir() reabre la
    // MISMA frontera (las generaciones siguen contando).
    abrir: () => { vivo = true; },
    cerrar: () => { vivo = false; },
  };
}

type Sesion = { access_token?: string | null; user?: { id?: string | null } | null } | null | undefined;

/** El token de la sesión, sólo si es de `uid`. */
export function tokenDeCuenta(sesion: Sesion, uid: string | null): string | null {
  if (!uid || !sesion?.access_token || sesion.user?.id !== uid) return null;
  return sesion.access_token;
}
