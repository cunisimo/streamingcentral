import { NextRequest, NextResponse } from "next/server";
import { adminDeToken, supabaseComoUsuario, tokenDeHeader } from "@/lib/admin-auth";
import {
  CuriosidadDuplicada, CuriosidadInexistente, crearCuriosidad, curiosidadDeTitulo,
  guardarCuriosidad, listarCuriosidades, retirarCuriosidad,
} from "@/lib/curiosidades";
import {
  LIMITES, esFiltroEstado, esTipo, normalizarCampos, normalizarLinea, posterValido,
  sinErrores, validarBorrador, validarPublicacion,
} from "@/lib/curiosidades-nucleo";

export const dynamic = "force-dynamic";

// Las operaciones del panel «¿Sabías que…?».
//
// Igual que `/api/admin/top`: UNA ruta con `accion`, así la puerta admin + MFA
// (`adminDeToken`) está escrita una sola vez. Escribe con la sesión del admin
// (`supabaseComoUsuario`), bajo RLS con `is_admin_mfa()`: si alguien saltea esta
// ruta y va directo a PostgREST, la base rechaza igual (migración 025).
//
// Validación del lado del servidor: el texto llega normalizado a texto plano
// (`normalizarCampos`), el borrador sólo respeta topes de largo y publicar exige
// texto, nombre de fuente y URL http/https válida. La base vuelve a exigir lo
// mismo con un CHECK.
const PRIVADO = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIVADO });

async function puerta(req: NextRequest) {
  const r = await adminDeToken(tokenDeHeader(req.headers.get("authorization")));
  if (!r.ok) return { error: json({ error: r.error }, r.status) };
  const sb = supabaseComoUsuario(r.token);
  if (!sb) return { error: json({ error: "Supabase no configurado" }, 503) };
  return { sb };
}

/**
 * GET ?tipo=movie&id=278 → la curiosidad de ese título (o `null`).
 * GET ?q=texto&estado=todas → el listado, filtrado.
 */
export async function GET(req: NextRequest) {
  const p = await puerta(req);
  if ("error" in p) return p.error;
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get("tipo");
  const idTitulo = sp.get("id");
  try {
      if (tipo != null || idTitulo != null) {
        const n = Number(idTitulo);
        if (!esTipo(tipo) || !Number.isInteger(n) || n <= 0) return json({ error: "título inválido" }, 400);
        return json({ curiosidad: await curiosidadDeTitulo(p.sb, tipo, n) });
      }
      const estado = sp.get("estado") ?? "todas";
      if (!esFiltroEstado(estado)) return json({ error: "estado inválido" }, 400);
      return json({ curiosidades: await listarCuriosidades(p.sb, { q: sp.get("q"), estado }) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

type Cuerpo = Record<string, unknown>;

/**
 * POST { accion: "crear", tipo, tmdbId, titulo, anio, poster, campos, publicar }
 * POST { accion: "guardar", id, campos, publicar }
 * POST { accion: "retirar", id }
 *
 * Respuestas: 200 { curiosidad }, 400 { error, errores? } (validación),
 * 404 (no existe), 409 { error, existente } (duplicado).
 */
export async function POST(req: NextRequest) {
  const p = await puerta(req);
  if ("error" in p) return p.error;
  let b: Cuerpo | null = null;
  try {
    const v: unknown = await req.json();
    if (v && typeof v === "object" && !Array.isArray(v)) b = v as Cuerpo;
  } catch { /* JSON inválido: 400 abajo */ }
  if (!b) return json({ error: "cuerpo inválido" }, 400);

  try {
      const accion = b.accion;
      if (accion === "retirar") {
        if (typeof b.id !== "string" || !UUID.test(b.id)) return json({ error: "id inválido" }, 400);
        return json({ curiosidad: await retirarCuriosidad(p.sb, b.id) });
      }
      if (accion !== "crear" && accion !== "guardar") return json({ error: "acción desconocida" }, 400);

      const campos = normalizarCampos((b.campos && typeof b.campos === "object" ? b.campos : {}) as Cuerpo);
      const publicar = b.publicar === true;
      const errores = publicar ? validarPublicacion(campos) : validarBorrador(campos);
      if (!sinErrores(errores)) {
        return json({ error: publicar ? "Falta completar datos para publicar." : "Hay campos demasiado largos.", errores }, 400);
      }

      if (accion === "guardar") {
        if (typeof b.id !== "string" || !UUID.test(b.id)) return json({ error: "id inválido" }, 400);
        return json({ curiosidad: await guardarCuriosidad(p.sb, b.id, campos, publicar) });
      }

      const tmdbId = Number(b.tmdbId);
      const titulo = normalizarLinea(b.titulo).slice(0, LIMITES.titulo);
      const anio = Number(b.anio);
      if (!esTipo(b.tipo) || !Number.isInteger(tmdbId) || tmdbId <= 0 || !titulo) {
        return json({ error: "título inválido" }, 400);
      }
      return json({
        curiosidad: await crearCuriosidad(p.sb, {
          tipo: b.tipo, tmdbId, titulo,
          anio: Number.isInteger(anio) && anio >= 1870 && anio <= 2200 ? anio : null,
          poster: posterValido(b.poster),
          campos, publicar,
        }),
      });
  } catch (e) {
      if (e instanceof CuriosidadDuplicada) {
        return json({ error: "Ese título ya tiene una curiosidad.", existente: e.existente }, 409);
      }
      if (e instanceof CuriosidadInexistente) return json({ error: e.message }, 404);
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
