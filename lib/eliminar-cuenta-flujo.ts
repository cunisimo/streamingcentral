// El ORDEN de los pasos del borrado de cuenta, separado de con qué se hacen.
//
// Vive sin `server-only` para poder probarlo: `lib/eliminar-cuenta.ts` importa
// el cliente de Supabase y no se puede cargar desde `node --test`. Acá está lo
// único que hay que demostrar —qué se ejecuta y qué NO, y en qué orden— con las
// dependencias inyectadas.
//
// EL ORDEN NO ES ESTÉTICO, ES LA SEGURIDAD. Con la configuración administrativa
// ausente y la validación de contraseña ANTES, el endpoint se convierte en un
// oráculo: contraseña incorrecta devuelve 401 y correcta devuelve 500. Aunque
// no borre nada, eso responde "¿esta contraseña es la buena?" a cualquiera que
// tenga un token — que es justo lo que la revalidación viene a impedir.
//
// Por eso la configuración se mira PRIMERO y, si falta, la respuesta es una sola
// para todos los casos y no se llega a comprobar ninguna contraseña. Y como no
// se comprobó ninguna, ese pedido tampoco cuenta para el límite de intentos:
// contarlo dejaría a la persona bloqueada quince minutos por un problema del
// servidor.
export type MotivoFallo = "sin-config" | "password-invalida" | "fallo-borrado";
export type Resultado =
  | { ok: true }
  | { ok: false; motivo: MotivoFallo };

export interface Dependencias {
  // ¿Existe la credencial administrativa? Se pregunta antes que nada.
  hayAdmin: () => boolean;
  validarPassword: (email: string, password: string) => Promise<boolean>;
  borrar: (userId: string) => Promise<boolean>;
}

export async function correrFlujo(
  deps: Dependencias,
  opts: { userId: string; email: string; password: string },
): Promise<Resultado> {
  if (!deps.hayAdmin()) return { ok: false, motivo: "sin-config" };
  if (!(await deps.validarPassword(opts.email, opts.password))) {
    return { ok: false, motivo: "password-invalida" };
  }
  if (!(await deps.borrar(opts.userId))) return { ok: false, motivo: "fallo-borrado" };
  return { ok: true };
}

// ¿Este resultado suma al límite de intentos de contraseña?
//
// SOLO si de verdad se comprobó una y estaba mal. `sin-config` no llegó a
// comprobar nada y `fallo-borrado` ya la había validado bien.
export function cuentaComoIntento(r: Resultado): boolean {
  return !r.ok && r.motivo === "password-invalida";
}
