// Las peticiones de la comunidad desde el cliente, en nombre de UNA cuenta
// (A1 de E3b): el token sale de la sesión sólo si sigue siendo de `uid`, así
// que un pedido nunca sale con la sesión de otra cuenta. Las usan la ficha
// (ResenasComunidad), el perfil comunitario y el nombre en la cuenta (E6).
import { supabaseBrowser } from "@/lib/supabase";
import { apiUrl } from "@/lib/api-base";
import { tokenDeCuenta } from "@/lib/comunidad/frontera-cuenta";
import type { RespuestaEditor } from "./EditorResena";

/** El token, sólo si la sesión sigue siendo de `uid` (A1 de E3b). */
export async function tokenComo(uid: string): Promise<string | null> {
  const { data } = await supabaseBrowser().auth.getSession();
  return tokenDeCuenta(data.session, uid);
}

/** POST a una ruta comunitaria en nombre de `uid`. Red caída o respuesta ilegible: "sin-confirmar". */
export async function postear(uid: string, ruta: string, cuerpo: Record<string, unknown>): Promise<RespuestaEditor> {
  try {
    const t = await tokenComo(uid);
    if (!t) return { resultado: "sin_sesion" };
    const r = await fetch(apiUrl(ruta), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      body: JSON.stringify(cuerpo),
    });
    const j = await r.json().catch(() => null);
    return j && typeof j === "object" && typeof (j as { resultado?: unknown }).resultado === "string" ? (j as Record<string, unknown>) : "sin-confirmar";
  } catch {
    return "sin-confirmar";
  }
}

/** GET con Bearer. null: sin sesión de esta cuenta, red caída o respuesta ilegible. */
export async function pedirComo(uid: string, ruta: string): Promise<{ status: number; j: unknown } | null> {
  try {
    const t = await tokenComo(uid);
    if (!t) return null;
    const r = await fetch(apiUrl(ruta), { headers: { Authorization: `Bearer ${t}` }, cache: "no-store" });
    return { status: r.status, j: await r.json().catch(() => null) };
  } catch {
    return null;
  }
}
