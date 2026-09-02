// Lo que la puerta del dashboard puede decidir SIN red ni credenciales.
//
// Vive aparte de `admin-auth.ts` por el mismo motivo que
// `hooks/home-types-nucleo.ts` o `lib/netflix-resolver.ts`: ese archivo importa
// el cliente de Supabase, y un módulo con imports de paquete no se puede correr
// con `node --test`. Lo que decide si una sesión entra o no tiene que poder
// probarse sin levantar nada.
//
// `aal2` es el nivel de garantía que Supabase pone en el token cuando la sesión
// pasó por el TOTP. `aal1` es sólo email y contraseña.

/**
 * El nivel de garantía (`aal`) que declara un token, o `null`.
 *
 * 🔴 NO VALIDA LA FIRMA. Es correcto **sólo** porque el único llamador
 * (`adminDeToken`) ya verificó el token contra Supabase con `getUser()` antes
 * de llegar acá. Invertir ese orden dejaría pasar un token fabricado a mano, y
 * hay un test que mira el código para que no se pueda invertir en silencio.
 *
 * Un token sin `aal` devuelve `null`, nunca algo que parezca verificado: ante
 * la duda, no hay segundo factor.
 */
export function aalDelToken(token: string | null): string | null {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const json = Buffer.from(
      partes[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const aal = (JSON.parse(json) as { aal?: unknown }).aal;
    return typeof aal === "string" && aal ? aal : null;
  } catch {
    return null;
  }
}

/** El token que viaja en `Authorization: Bearer …`, o `null`. */
export function tokenDeHeader(h: string | null): string | null {
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/** En qué punto del alta del segundo factor está el admin. */
export type EstadoMfa =
  | "sin-factor" | "falta-verificar" | "falta-respaldo" | "listo";

/**
 * El estado de MFA, a partir de cuántos factores verificados hay y del `aal` de
 * la sesión.
 *
 * 🔴 `listo` EXIGE DOS FACTORES, y ése es el arreglo. Antes se miraba sólo el
 * `aal`: con un factor y la sesión elevada daba `aal2`, así que el layout dejaba
 * entrar mientras `/admin/mfa` insistía en que hacían falta dos. El aviso quedaba
 * como una sugerencia que nadie cumplía.
 *
 * Y la razón por la que hacen falta dos no es formal: si se pierde el único, la
 * cuenta queda sin poder escribir NADA —ni para arreglarlo—, porque las policies
 * exigen `aal2` y no hay forma de saltearlas desde la app.
 *
 * `falta-verificar` antes que `falta-respaldo` a propósito: con la sesión sin
 * elevar no se puede inscribir un factor nuevo, así que primero hay que entrar.
 */
export function estadoDeMfa(
  { factores, aal }: { factores: number; aal: string | null },
): EstadoMfa {
  if (factores < 1) return "sin-factor";
  if (aal !== "aal2") return "falta-verificar";
  return factores < 2 ? "falta-respaldo" : "listo";
}
