import { NextResponse } from "next/server";
import { cacheStatus, cachePing } from "@/lib/cache";
import { conCors, opcionesCors } from "@/lib/cors";

export const dynamic = "force-dynamic";

// GET /api/health — estado del cache Redis.
//
// Existe porque este cache falla en silencio: si las credenciales no llegan, la
// app sigue funcionando con cache en memoria (que en serverless muere con el
// contenedor) y lo único que se nota es que todo va lento. Pasó en producción:
// la integración de Vercel crea las variables como KV_REST_API_*, el código
// esperaba UPSTASH_REDIS_REST_*, y el cache estuvo apagado sin que nada avisara.
//
// No expone credenciales: solo el NOMBRE de la variable que se encontró.
async function manejar() {
  const estado = cacheStatus();
  const ping = await cachePing();
  return NextResponse.json(
    {
      cache: estado.modo,
      fuente: estado.fuente,
      credenciales: { url: estado.tieneUrl, token: estado.tieneToken },
      ping,
      ok: estado.modo === "redis" && ping.ok,
    },
    // 503 si el cache no está operativo: así se puede monitorear sin parsear.
    { status: estado.modo === "redis" && ping.ok ? 200 : 503 },
  );
}

// CORS para el contenedor. `manejar` es el cuerpo de siempre, sin cambios:
// `conCors` envuelve la Response FINAL, así que ningún camino de salida queda
// sin encabezados. `opcionesCors` NO recibe el handler, así que el preflight no
// puede ejecutar la lógica de la ruta. Ver lib/cors.ts.
export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
