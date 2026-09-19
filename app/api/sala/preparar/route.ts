import { NextRequest, NextResponse } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { usuarioDeToken } from "@/lib/supabase";
import { withMetricas } from "@/lib/cache";
import { conDescartesRegistrados } from "@/lib/fallos-tmdb";
import { manejarPreparar } from "@/lib/sala/preparar-ruta";
import { prepararConSupabase } from "@/lib/sala/preparar";

export const dynamic = "force-dynamic";
// Enriquece hasta 80 candidatas por lotes de 20 (2 llamadas a TMDB por card en
// frío: detalle + proveedores). Con `card:` caliente es casi sólo Redis.
export const maxDuration = 60;

// La ÚNICA ruta de las salas. Todo lo demás (crear, unirse, estado, votar,
// desempatar, cerrar) va del navegador directo a las RPCs de Supabase con la
// credencial del participante o el JWT. Esta existe porque preparar una tanda
// toca TMDB y Redis (cardsByIds) y escribe con service_role, y ninguna de las
// dos cosas puede hacerse desde el cliente.
//
// El contrato HTTP (kill switch, sesión, 400 sin defaults, códigos) vive en
// lib/sala/preparar-ruta.ts y se prueba con node --test; acá sólo se cablea.
async function manejar(req: NextRequest) {
  const cuerpo = await req.text();
  const t0 = Date.now();
  let rpcs = 0;
  let detalle = "";
  const { res, metricas } = await withMetricas(() => conDescartesRegistrados("api/sala/preparar", () =>
    manejarPreparar({ authorization: req.headers.get("authorization"), cuerpo }, {
      salasActivas: process.env.SALAS_ACTIVAS !== "0",
      usuarioDeToken,
      preparar: async (args) => {
        const r = await prepararConSupabase(args);
        rpcs = r.rpcs;
        detalle = `${args.size}/${args.duracion}`;
        return r.res;
      },
    })));
  // Una línea por preparación, con las unidades separadas (como `[home]`).
  // Nunca el room_id completo ni credenciales: sólo lo que hace falta para
  // medir. `supabase` cuenta las consultas del cliente anónimo (usuarioDeToken);
  // `rpcs`, las del cliente admin, que no pasan por el observador.
  const b = res.body as { ok?: boolean; motivo?: string; consultadas?: number; enriquecidas?: number; descartadas?: number };
  console.log(
    `[sala] preparar ${detalle || "-"} ${b.ok ? `publicada (${b.consultadas} consultadas, ${b.enriquecidas} enriquecidas, ${b.descartadas} descartadas)` : (b.motivo ?? "rechazada")} ${res.status}` +
    ` | tmdb ${metricas.tmdb.llamadas} llamadas (${metricas.tmdb.ok} ok)` +
    ` | redis ${metricas.redis.comandos} comandos (${metricas.redis.hits} hit / ${metricas.redis.misses} miss)` +
    ` | supabase ${metricas.supabase.consultas} consultas + ${rpcs} rpc admin` +
    ` | ${Date.now() - t0}ms` +
    // El detalle interno de un fallo, acotado por el handler, sólo acá: nunca en la respuesta.
    (res.detalle ? ` | detalle: ${res.detalle}` : ""),
  );
  return NextResponse.json(res.body, { status: res.status });
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const POST = conCors(manejar, "POST");
export const OPTIONS = opcionesCors("POST");
