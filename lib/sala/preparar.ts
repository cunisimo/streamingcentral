import "server-only";
import { cardsByIds } from "../enrich";
import { roulettePlatformNames } from "../roulette-providers";
import { supabaseAdmin } from "../supabase-admin";
import type { PlatformCode } from "../types";
import { prepararRonda, type ArgsPreparar, type DepsPreparar } from "./preparar-nucleo";
import type { ResultadoPreparar } from "./tipos";

// El cableado real de la preparación: lo único de las salas que toca TMDB y
// Redis (vía cardsByIds) y lo único que usa service_role. Vive acá y no en la
// ruta para que la ruta sea un adaptador de dos líneas y esto se pueda leer
// solo. Ver lib/sala/preparar-nucleo.ts para la secuencia.
//
// `supabaseAdmin()` es el cliente con la service role key (lib/supabase-admin.ts,
// server-only): las RPCs de preparación están concedidas SÓLO a service_role.
// La identidad del organizador ya la verificó la ruta con el JWT
// (usuarioDeToken) y viaja como `p_host`; la RPC vuelve a comprobar que sea el
// dueño de la sala.
//
// ⚠️ Las consultas del cliente admin NO pasan por el observador de métricas de
// lib/supabase.ts (ése envuelve a supabaseServer). Se cuentan acá y viajan en
// `rpcs`, aparte de `metricas.supabase.consultas`.
export async function prepararConSupabase(a: ArgsPreparar): Promise<{ res: ResultadoPreparar; rpcs: number }> {
  const admin = supabaseAdmin();
  if (!admin) return { res: { ok: false, motivo: "fallo", detalle: "SUPABASE_SERVICE_ROLE_KEY ausente" }, rpcs: 0 };
  let rpcs = 0;
  const deps: DepsPreparar = {
    rpc: async (fn, args) => {
      rpcs++;
      const { data, error } = await admin.rpc(fn, args);
      if (error) throw new Error(`${fn}: ${error.message} [${error.code}]`);
      return data;
    },
    cards: cardsByIds,
    nombres: (codes) => roulettePlatformNames(codes as PlatformCode[]),
  };
  const res = await prepararRonda(deps, a);
  return { res, rpcs };
}
