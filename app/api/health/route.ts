import { NextResponse } from "next/server";
import { cacheStatus, cachePing } from "@/lib/cache";

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
export async function GET() {
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
