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
