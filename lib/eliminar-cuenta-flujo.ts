// El ORDEN de los pasos del borrado de cuenta, separado de con qué se hacen.
//
// Vive sin `server-only` para poder probarlo: `lib/eliminar-cuenta.ts` importa
// el cliente de Supabase y no se puede cargar desde `node --test`. Acá está lo
// único que hay que demostrar —qué se ejecuta y qué NO, y en qué orden— con las
// dependencias inyectadas. Los adaptadores reales viven en
// `lib/eliminar-cuenta-deps.ts`, y la batería local
// (scripts/comunidad/pruebas-baja.mjs) corre ESTE flujo con ESOS adaptadores
// contra Supabase local.
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
//
// DOS PASOS QUE NO COMPARTEN ATOMICIDAD (contrato de baja, E2b; revisión
// §2.2.3). Después de la contraseña:
//   1. `bajaComunitaria`: una transacción en la base. Deja el marcador de baja
//      en curso, cierra tramos y borra o desvincula lo comunitario. Si falla,
//      no cambió nada → `fallo-borrado`, como siempre.
//   2. `borrar` (deleteUser de Auth). Si responde ok, la cuenta se eliminó.
//      Si no, NO se sabe: la respuesta pudo perderse o un reintento concurrente
//      pudo ganar. Se RECONCILIA preguntando si la cuenta existe:
//        - no existe       → `{ ok: true }` (la eliminación está completa);
//        - existe          → se registra el fallo en el marcador y
//                            `baja-parcial`: lo comunitario ya se borró, la
//                            cuenta sigue viva;
//        - no se pudo saber → `baja-sin-verificar`. NUNCA `ok: true`.
// El marcador sigue mientras la cuenta exista, y cae con ella en Auth.
export type MotivoFallo =
  | "sin-config"
  | "password-invalida"
  | "fallo-borrado"
  | "baja-parcial"
  | "baja-sin-verificar";
export type Resultado =
  | { ok: true }
  | { ok: false; motivo: MotivoFallo };

/** Lo que dice Auth de una cuenta. `indeterminado`: red, 5xx o sin configuración. */
export type Existencia = "existe" | "no-existe" | "indeterminado";

export interface Dependencias {
  // ¿Existe la credencial administrativa? Se pregunta antes que nada.
  hayAdmin: () => boolean;
  validarPassword: (email: string, password: string) => Promise<boolean>;
  // Paso 1. true sólo si la base confirmó la transacción.
  bajaComunitaria: (userId: string) => Promise<boolean>;
  // Paso 2. true sólo si Auth respondió ok.
  borrar: (userId: string) => Promise<boolean>;
  existe: (userId: string) => Promise<Existencia>;
  // Con la cuenta confirmada viva. Si falla, el resultado no cambia.
  registrarFallo: (userId: string, detalle: string) => Promise<void>;
}

/** Una dependencia que lanza vale como la respuesta pesimista. */
async function intentar<T>(f: () => Promise<T>, siLanza: T): Promise<T> {
  try {
    return await f();
  } catch {
    return siLanza;
  }
}

export async function correrFlujo(
  deps: Dependencias,
  opts: { userId: string; email: string; password: string },
): Promise<Resultado> {
  if (!deps.hayAdmin()) return { ok: false, motivo: "sin-config" };
  if (!(await deps.validarPassword(opts.email, opts.password))) {
    return { ok: false, motivo: "password-invalida" };
  }
  if (!(await intentar(() => deps.bajaComunitaria(opts.userId), false))) {
    return { ok: false, motivo: "fallo-borrado" };
  }
  if (await intentar(() => deps.borrar(opts.userId), false)) return { ok: true };

  const estado = await intentar(() => deps.existe(opts.userId), "indeterminado" as Existencia);
  if (estado === "no-existe") return { ok: true };
  if (estado === "existe") {
    await intentar(() => deps.registrarFallo(opts.userId, "deleteUser falló con la cuenta viva"), undefined);
    return { ok: false, motivo: "baja-parcial" };
  }
  return { ok: false, motivo: "baja-sin-verificar" };
}

// ¿Este resultado suma al límite de intentos de contraseña?
//
// SOLO si de verdad se comprobó una y estaba mal. `sin-config` no llegó a
// comprobar nada, y el resto ya la había validado bien.
export function cuentaComoIntento(r: Resultado): boolean {
  return !r.ok && r.motivo === "password-invalida";
}
