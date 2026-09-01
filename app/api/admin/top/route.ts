import { NextRequest, NextResponse } from "next/server";
import {
  adminDeToken, supabaseComoUsuario, tokenDeHeader,
} from "@/lib/admin-auth";
import {
  cambiarFecha, copiarPublicado, guardarPosicion, marcarRevisado,
  obtenerBorradores, publicar, reordenar, restaurarBorrador,
} from "@/lib/top-manual";

export const dynamic = "force-dynamic";

// Las operaciones del dashboard del Top semanal.
//
// ============================================================================
// UNA SOLA RUTA CON `accion`, Y NO SIETE RUTAS
// ============================================================================
// Va contra la costumbre REST, y es a propósito: **la comprobación de admin +
// MFA está escrita una sola vez**. Con siete rutas, olvidarse el guard en una
// es un descuido de una línea que no rompe ningún test y abre el dashboard
// entero. Acá no hay forma de agregar una acción que se saltee la puerta.
//
// La segunda capa igual existe: RLS rechaza lo mismo aunque alguien llame a
// PostgREST directo (ver `is_admin_mfa()` en la migración 007). Esta ruta es la
// primera, no la única.
async function puerta(req: NextRequest) {
  const r = await adminDeToken(tokenDeHeader(req.headers.get("authorization")));
  if (!r.ok) return { error: NextResponse.json({ error: r.error }, { status: r.status }) };
  const sb = supabaseComoUsuario(r.token);
  if (!sb) return { error: NextResponse.json({ error: "Supabase no configurado" }, { status: 503 }) };
  return { sb, uid: r.id };
}

export async function GET(req: NextRequest) {
  const p = await puerta(req);
  if ("error" in p) return p.error;
  try {
    return NextResponse.json({ borradores: await obtenerBorradores(p.sb) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const p = await puerta(req);
  if ("error" in p) return p.error;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "cuerpo inválido" }, { status: 400 }); }

  const accion = String(body.accion ?? "");
  const id = String(body.id ?? "");
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : NaN);

  try {
    switch (accion) {
      case "guardar": {
        const e = body.entrada as { posicion: number; tipo: "movie" | "tv"; tmdb_id: number; titulo: string };
        if (!id || !e || !(e.posicion >= 1 && e.posicion <= 10) || !Number.isFinite(e.tmdb_id)) {
          return NextResponse.json({ error: "entrada inválida" }, { status: 400 });
        }
        await guardarPosicion(p.sb, id, {
          posicion: e.posicion, tipo: e.tipo, tmdb_id: e.tmdb_id, titulo: String(e.titulo ?? "").trim(),
        });
        break;
      }
      case "reordenar": {
        const desde = num(body.desde), hasta = num(body.hasta);
        if (!id || !Number.isFinite(desde) || !Number.isFinite(hasta)) {
          return NextResponse.json({ error: "movimiento inválido" }, { status: 400 });
        }
        await reordenar(p.sb, id, desde, hasta);
        break;
      }
      case "fecha":
        // La fecha de captura es editable: nace con el día en que se creó el
        // borrador —automático después de publicar— y el dueño la ajusta a la
        // semana que corresponde.
        await cambiarFecha(p.sb, id, String(body.fecha ?? ""));
        break;
      case "revisar":
        // `uid` sale del token verificado, NUNCA del cuerpo: si viniera del
        // cliente, cualquiera podría firmar una revisión a nombre de otro.
        await marcarRevisado(p.sb, id, body.revisado ? p.uid : null);
        break;
      case "restaurar":
        await restaurarBorrador(p.sb, id);
        break;
      case "corregir":
        // Prepara una corrección: copia la publicación vigente al borrador. La
        // fila publicada no se toca; la corrección será una versión nueva.
        await copiarPublicado(p.sb, id);
        break;
      case "publicar": {
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
        if (!ids.length) return NextResponse.json({ error: "sin bloques" }, { status: 400 });
        // La validación de las diez posiciones vive en `publicar_top`, del lado
        // de la base, y devuelve qué se publicó y qué se rechazó por bloque.
        return NextResponse.json({ resultados: await publicar(p.sb, ids) });
      }
      default:
        return NextResponse.json({ error: "acción desconocida" }, { status: 400 });
    }
    // Se devuelven los borradores frescos: el dashboard no tiene que volver a
    // pedirlos y no puede quedar mostrando un estado que ya cambió.
    return NextResponse.json({ borradores: await obtenerBorradores(p.sb) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
