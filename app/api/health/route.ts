import { NextResponse } from "next/server";
import { cacheStatus, cachePing, opsPausaHome } from "@/lib/cache";
import { CLAVES_PAUSA } from "@/lib/pausa-lua";
import { saludDeLaPausa } from "@/lib/pausa-salud";
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
//
// Etapa 3.c.1: `pausa` son SÓLO agregados (§41.4) —la pausa ante 429 vigente y
// las sumas de los últimos 60 minutos: 429, pausas, ya-mayor, ya-aplicada,
// pausaNoLeida, pausadosUB, pausados503—, por el script SALUD (un EVAL).
// Ningún uuid, id de evento, familia, ruta ni evento crudo; `tmdb:eventos`
// sólo se lee con credenciales de Redis. `null` = no se pudo leer (Redis
// caído o forma inesperada), nunca ceros que parezcan "todo bien". Condición
// de rollback (§40.6): pausas > 0 con 429 = 0, o pausados503 > 0 con 429 = 0.
async function saludPausa() {
  try { return saludDeLaPausa(await opsPausaHome.evalSalud([CLAVES_PAUSA.pausa, CLAVES_PAUSA.cubos], [])); } catch { return null; }
}
async function manejar() {
  const estado = cacheStatus();
  const [ping, pausa] = await Promise.all([cachePing(), saludPausa()]);
  return NextResponse.json(
    {
      cache: estado.modo,
      fuente: estado.fuente,
      credenciales: { url: estado.tieneUrl, token: estado.tieneToken },
      ping,
      pausa,
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
