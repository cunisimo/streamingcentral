// Las señales de "Elegidas para vos" leídas por el SERVIDOR, con su fecha.
//
// POR QUÉ. Elegir orígenes con recencia (§2 del plan de diversidad) necesita
// saber qué tan nuevo es cada gusto ENTRE niveles, y el cliente manda
// `{tipo, id, peso}` sin fecha. Cambiar el cliente no alcanza: Android 1.2.0 y
// el AAB 5 tienen el bundle local y van a seguir mandando lo de hoy. La ruta ya
// recibe el token, y con él la RLS `auth.uid() = user_id` deja leer las filas
// (igual que los descartes, lib/reco-descartes-servidor.ts).
//
// MISMA VENTANA QUE EL CLIENTE (`armarSenales` en components/reco-entrada.ts):
// los 40 votos más recientes (Petacular → 3, Ta buena → 2) y los 200 marcados
// más recientes entre Mi lista y Ya la vi (Mi lista → 1).
//
// LO QUE SE LEE TAMBIÉN SE EXCLUYE (resguardo del dueño, 31/10): `claves` trae
// TODO lo leído —incluido Malaso y Ya la vi— y la ruta lo suma a las
// exclusiones del cliente. Las del cliente se conservan: son la lista completa.
//
// SI FALLA devuelve `null` y la ruta usa las señales del cliente, sin rango:
// los orígenes se eligen como antes, por peso.
import { supabaseComoUsuario } from "./admin-auth";
import type { SenalConRango } from "./reco-seleccion";
import { senalesDesdeFilas, type FilaItem, type FilaVoto } from "./reco-senales";

export const VOTOS_SERVIDOR = 40;
export const MARCADOS_SERVIDOR = 200;

export async function senalesDeToken(token: string): Promise<{ senales: SenalConRango[]; claves: string[] } | null> {
  const sb = supabaseComoUsuario(token);
  if (!sb) return null;
  try {
    const [v, i] = await Promise.all([
      sb.from("votes").select("tmdb_id, tipo, rating, created_at")
        .order("created_at", { ascending: false }).limit(VOTOS_SERVIDOR),
      sb.from("user_items").select("tmdb_id, tipo, kind, created_at")
        .in("kind", ["list", "watched"])
        .order("created_at", { ascending: false }).limit(MARCADOS_SERVIDOR),
    ]);
    if (v.error || i.error) throw new Error(String(v.error?.message ?? i.error?.message));
    return senalesDesdeFilas((v.data ?? []) as FilaVoto[], (i.data ?? []) as FilaItem[]);
  } catch (e) {
    // Sin el token ni las filas: son el historial de una persona.
    console.error("[reco] no se pudieron leer las señales —", e instanceof Error ? e.message : "error");
    return null;
  }
}
