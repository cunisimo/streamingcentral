import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { ingestLatestWeek } from "@/lib/netflix-top10";

export const dynamic = "force-dynamic";
// Resolver títulos nuevos son 1-2 requests a TMDB cada uno; con 20 títulos
// nuevos (la primera corrida) puede pasarse de los 10s del default.
export const maxDuration = 60;

// Comparación en tiempo constante. Con `!==` el motor corta en el primer byte
// distinto, así que el tiempo de respuesta filtra cuántos caracteres acertó
// quien prueba. Con un secreto de 256 bits es un ataque teórico, pero acá no
// cuesta nada cerrarlo.
//
// `timingSafeEqual` EXPLOTA si los buffers tienen distinto largo, así que hay
// que chequearlo antes. Eso sí filtra el largo por tiempo, y está bien: el
// largo no es el secreto, y quien ya lo conozca no gana nada.
function secretoValido(header: string | null, secret: string): boolean {
  const recibido = Buffer.from(header ?? "");
  const esperado = Buffer.from(`Bearer ${secret}`);
  if (recibido.length !== esperado.length) return false;
  return timingSafeEqual(recibido, esperado);
}

export async function GET(req: NextRequest) {
  // Vercel Cron manda `Authorization: Bearer $CRON_SECRET`. Sin el secreto
  // configurado, la ruta queda cerrada: mejor no ingestar que dejarla abierta.
  const secret = process.env.CRON_SECRET;
  // El 401 distingue las dos causas. Un "no autorizado" a secas no deja saber
  // si la variable falta en el deployment o si el secreto no coincide, y son
  // arreglos distintos: una se arregla redeployando y la otra reescribiendo el
  // valor. `motivo` no filtra nada — quien mandó un secreto equivocado ya sabe
  // que era equivocado, y que la variable falte no le abre ninguna puerta.
  if (!secret) {
    return NextResponse.json({
      ok: false, error: "no autorizado",
      motivo: "CRON_SECRET no está definida en este deployment",
    }, { status: 401 });
  }
  if (!secretoValido(req.headers.get("authorization"), secret)) {
    return NextResponse.json({
      ok: false, error: "no autorizado",
      motivo: "el secreto recibido no coincide con CRON_SECRET",
      // La otra variable que hace falta para que la ingesta escriba. Se informa
      // acá para no tener que descubrirlo en un segundo viaje.
      supabaseListo: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await ingestLatestWeek()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
