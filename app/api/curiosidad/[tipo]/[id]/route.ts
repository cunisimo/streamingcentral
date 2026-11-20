import { NextRequest, NextResponse } from "next/server";
import { conCors, opcionesCors } from "@/lib/cors";
import { curiosidadesPublicadas } from "@/lib/curiosidades";
import { esTipo } from "@/lib/curiosidades-nucleo";

export const dynamic = "force-dynamic";

// «¿Sabías que…?» de UNA ficha: sólo lo publicado, sin sesión.
//
// La pide la ficha DESPUÉS de dibujarse (web y contenedor Android, por eso
// integra CORS). Una llamada RPC (`curiosidad_publicada`), sin Redis.
//
// ============================================================================
// SIN CACHÉ, A PROPÓSITO: PUBLICAR, EDITAR O RETIRAR SE VE EN EL PEDIDO SIGUIENTE
// ============================================================================
// `no-store`: ni la CDN de Vercel ni el navegador guardan la respuesta, así que
// un cambio del panel se refleja en la próxima apertura de la ficha —plazo
// comprobado contra Supabase local—. Una caché de CDN (`s-maxage`) ahorraría
// consultas a costa de un plazo que sólo se puede verificar en un Preview; con
// el tráfico actual una consulta indexada por ficha no lo justifica. Si algún
// día hace falta, se agrega acá y el plazo pasa a ser ese TTL.
//
// Un fallo de Supabase responde 503 y la ficha simplemente no muestra la
// sección: nunca se lee como "no hay curiosidad" guardada en ningún lado.
const SIN_CACHE = { "Cache-Control": "no-store" };

async function manejar(_req: NextRequest, { params }: { params: { tipo: string; id: string } }) {
  const id = Number(params.id);
  if (!esTipo(params.tipo) || !Number.isInteger(id) || id <= 0 || id > 2_147_483_647) {
    return NextResponse.json({ error: "parámetros inválidos", curiosidades: [] }, { status: 400, headers: SIN_CACHE });
  }
  try {
    const curiosidades = await curiosidadesPublicadas(params.tipo, id);
    return NextResponse.json({ curiosidades }, { headers: SIN_CACHE });
  } catch {
    return NextResponse.json({ error: "no se pudo leer", curiosidades: [] }, { status: 503, headers: SIN_CACHE });
  }
}

export const GET = conCors(manejar, "GET");
export const OPTIONS = opcionesCors("GET");
