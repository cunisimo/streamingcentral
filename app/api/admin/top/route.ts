import { NextRequest, NextResponse } from "next/server";
import {
  adminDeToken, supabaseComoUsuario, tokenDeHeader,
} from "@/lib/admin-auth";
import {
  ConflictoTop, agregarEnPosicion, bloquesConPublicacion, cambiarFecha, copiarPublicado,
  guardarPosicion, marcarRevisado, obtenerBorradores, ordenarEntradas, publicar,
  reemplazarEnPosicion, reordenar, restaurarBorrador,
} from "@/lib/top-manual";
import type { EntradaTop } from "@/lib/top-manual-nucleo";
import type { SupabaseClient } from "@supabase/supabase-js";

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

/**
 * Lo que el panel necesita para dibujarse: los doce borradores y qué bloques ya
 * tienen publicación.
 *
 * Van JUNTOS a propósito. El contador de preparación se actualiza después de
 * cada acción sin pedir nada extra, porque toda respuesta de esta ruta ya lo
 * trae. Antes salía de dos llamadas a `/api/top`, que arman el Top completo.
 */
async function estado(sb: SupabaseClient) {
  const [borradores, publicados] = await Promise.all([
    obtenerBorradores(sb), bloquesConPublicacion(sb),
  ]);
  return { borradores, publicados };
}

export async function GET(req: NextRequest) {
  const p = await puerta(req);
  if ("error" in p) return p.error;
  try {
    return NextResponse.json(await estado(p.sb));
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
  // Una entrada completa y con forma válida, o null. El tipo tiene que ser el
  // del bloque; eso lo comprueba el trigger `top_entry_tipo_coherente`.
  const entradaValida = (v: unknown): EntradaTop | null => {
    const e = v as Partial<EntradaTop> | null;
    if (!e || !(Number(e.posicion) >= 1 && Number(e.posicion) <= 10) || !Number.isInteger(Number(e.posicion))) return null;
    if (e.tipo !== "movie" && e.tipo !== "tv") return null;
    if (!Number.isInteger(Number(e.tmdb_id)) || Number(e.tmdb_id) <= 0) return null;
    const titulo = String(e.titulo ?? "").trim();
    if (!titulo) return null;
    return { posicion: Number(e.posicion), tipo: e.tipo, tmdb_id: Number(e.tmdb_id), titulo };
  };

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
      // --- Las tres acciones del editor nuevo (components/admin/top) ---------
      // Ver lib/top-editor-nucleo.ts: el panel manda órdenes ABSOLUTOS y
      // escrituras condicionadas, de a una por vez.
      case "ordenar": {
        const lista = Array.isArray(body.entradas) ? body.entradas : null;
        if (!id || !lista || lista.length > 10) {
          return NextResponse.json({ error: "orden inválido" }, { status: 400 });
        }
        const propuestas = lista.map((x) => {
          const e = x as Partial<EntradaTop>;
          return { posicion: Number(e?.posicion), tipo: e?.tipo as "movie" | "tv", tmdb_id: Number(e?.tmdb_id), titulo: "" };
        });
        await ordenarEntradas(p.sb, id, propuestas);
        break;
      }
      case "agregar": {
        const e = entradaValida(body.entrada);
        if (!id || !e) return NextResponse.json({ error: "entrada inválida" }, { status: 400 });
        await agregarEnPosicion(p.sb, id, e);
        break;
      }
      case "reemplazar": {
        const e = entradaValida(body.entrada);
        const r = body.reemplaza as { tipo?: unknown; tmdb_id?: unknown } | null;
        const tmdbViejo = Number(r?.tmdb_id);
        if (!id || !e || !r || (r.tipo !== "movie" && r.tipo !== "tv") || !Number.isInteger(tmdbViejo)) {
          return NextResponse.json({ error: "reemplazo inválido" }, { status: 400 });
        }
        await reemplazarEnPosicion(p.sb, id, e, { tipo: r.tipo, tmdb_id: tmdbViejo });
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
        const resultados = await publicar(p.sb, ids);
        // El estado va en la MISMA respuesta: así el contador de preparación se
        // actualiza tras publicar sin una consulta más.
        return NextResponse.json({ resultados, ...(await estado(p.sb)) });
      }
      default:
        return NextResponse.json({ error: "acción desconocida" }, { status: 400 });
    }
    // Se devuelve el estado fresco: el dashboard no tiene que volver a pedirlo
    // y no puede quedar mostrando algo que ya cambió.
    return NextResponse.json(await estado(p.sb));
  } catch (e) {
    // Un conflicto (409) no es una falla del servidor: el bloque cambió desde
    // que el panel lo leyó. El panel no reintenta a ciegas: ofrece recargar.
    if (e instanceof ConflictoTop) {
      return NextResponse.json({ error: e.message, conflicto: true }, { status: 409 });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
