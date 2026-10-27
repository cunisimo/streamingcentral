// El estado del perfil comunitario en el cliente (E6). PURO, con tests.
//
// La cabecera (nombre, avatar, agregados) llega con la primera página y la
// lista de reseñas usa el MISMO núcleo que la ficha (./lista-nucleo.ts):
// pedidos numerados, cursor confirmado, respuestas de otra clave descartadas.
// La clave incluye la cuenta y el perfil, así que cambiar de cuenta o de
// perfil descarta lo que llegue tarde del anterior.
//
// Lo que se muestra sale de la proyección de la base (`comunidad_perfil`):
// nunca el `display_name` del perfil privado ni el correo. Sin nombre
// elegido, un texto neutro (NOMBRE_PENDIENTE).
import { NOMBRE_PENDIENTE } from "./nombre.ts";

export const ORDEN_PERFIL = "perfil";
export type EstadoPerfil = "activo" | "bloqueado" | "eliminada" | "no_existe" | "sin_participante";

export interface CabeceraPerfil {
  estado: EstadoPerfil;
  id: string | null;
  nombre: string | null;
  /** Un id del catálogo de avatares, o null (el cliente usa el de por defecto). */
  avatar: string | null;
  propio: boolean;
  resenas: number;
  utilesRecibidos: number;
}

export const clavePerfil = (uid: string, id: string) => `${uid}|perfil:${id}|${ORDEN_PERFIL}`;

const ESTADOS: ReadonlySet<string> = new Set(["activo", "bloqueado", "eliminada", "no_existe", "sin_participante"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const natural = (x: unknown) => (Number.isSafeInteger(x) && (x as number) >= 0 ? (x as number) : 0);

/**
 * La cabecera de una respuesta, o null si no tiene la forma esperada. Fuera de
 * `activo` no se toma NADA más que el estado: aunque la respuesta trajera un
 * nombre o un avatar, un perfil bloqueado o eliminado no los muestra.
 */
export function cabeceraValida(j: unknown): CabeceraPerfil | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  if (o.activo !== true || typeof o.estado !== "string" || !ESTADOS.has(o.estado)) return null;
  const estado = o.estado as EstadoPerfil;
  const id = typeof o.id === "string" && UUID.test(o.id) ? o.id : null;
  if (estado !== "activo") return { estado, id, nombre: null, avatar: null, propio: false, resenas: 0, utilesRecibidos: 0 };
  if (!id) return null;
  return {
    estado, id,
    nombre: typeof o.nombre === "string" && o.nombre ? o.nombre : null,
    avatar: typeof o.avatar === "string" && /^[a-z]{1,30}$/.test(o.avatar) ? o.avatar : null,
    propio: o.propio === true,
    resenas: natural(o.resenas),
    utilesRecibidos: natural(o.utiles_recibidos),
  };
}

/** El título visible del perfil. */
export function tituloPerfil(c: CabeceraPerfil): string {
  switch (c.estado) {
    case "eliminada": return "Cuenta eliminada";
    case "bloqueado": return "Usuario bloqueado";
    case "no_existe": return "Este perfil no existe";
    case "sin_participante": return "Todavía no tenés perfil comunitario";
    default: return c.nombre ?? NOMBRE_PENDIENTE;
  }
}

/** Los agregados permitidos, en una línea. */
export function agregadosPerfil(c: CabeceraPerfil): string {
  const r = c.resenas === 1 ? "1 reseña" : `${c.resenas} reseñas`;
  const u = c.utilesRecibidos === 1 ? "1 «Me sirvió» recibido" : `${c.utilesRecibidos} «Me sirvió» recibidos`;
  return `${r} · ${u}`;
}
