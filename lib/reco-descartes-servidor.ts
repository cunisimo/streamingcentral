// Los descartes de "No es para mí", leídos por el SERVIDOR del riel.
//
// POR QUÉ ACÁ Y NO EN EL CLIENTE. Hasta el 29/10 los descartes no viajaban al
// recomendador: se filtraban en el cliente sobre el payload ya armado. El
// servidor no se enteraba, así que devolvía SIEMPRE los mismos ~20 títulos y el
// cliente les restaba los descartados. Cada "No es para mí" achicaba el riel
// para siempre —no se reponía ni al recargar— hasta quedar en 3 o 4 tarjetas
// (informe del dueño y de un usuario, 29/10).
//
// Se leen en el servidor, y no mandándolos desde el cliente, por Android: el
// contenedor corre un bundle LOCAL del cliente, así que un arreglo en el cliente
// recién llegaría con un AAB nuevo. La ruta ya recibe el token del usuario, y
// con él la RLS `auth.uid() = user_id` de `user_items` deja leer sus filas.
//
// SI LA LECTURA FALLA se devuelve `null` y el riel se arma como antes —sin
// estas exclusiones—: el cliente sigue filtrando los descartes sobre lo que
// llega, así que nada descartado reaparece. Lo único que se pierde es el relleno.
import { paginar, PAGINA_DESCARTES, clave } from "@/components/reco-descartes";
import { supabaseComoUsuario } from "./admin-auth";
import type { MediaType } from "./types";

export async function descartesDeToken(token: string): Promise<string[] | null> {
  const sb = supabaseComoUsuario(token);
  if (!sb) return null;
  try {
    const filas = await paginar<{ tmdb_id: number; tipo: MediaType }>(
      async (desde, hasta) => {
        const { data, error } = await sb
          .from("user_items")
          .select("tmdb_id, tipo")
          .eq("kind", "dismissed")
          .order("created_at", { ascending: false })
          .range(desde, hasta);
        return { data: data as { tmdb_id: number; tipo: MediaType }[] | null, error };
      },
      PAGINA_DESCARTES,
      "los descartes",
    );
    return filas.map((f) => clave(f.tipo, f.tmdb_id));
  } catch (e) {
    // Sin el token ni las filas: son el historial de una persona.
    console.error("[reco] no se pudieron leer los descartes —", e instanceof Error ? e.message : "error");
    return null;
  }
}
