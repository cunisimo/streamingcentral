// El Top Yumpers en el cliente (E7). PURO, con tests.
//
// La respuesta de la base es la proyección: posición, puntos y, por autor,
// nombre comunitario y avatar del catálogo (E6). Una cuenta eliminada llega
// sin id, nombre ni avatar; un autor que quien mira bloqueó, igual. Este
// módulo no toma nada más aunque viniera. La vista se monta con `key` por
// cuenta y descarta respuestas de otra carga (frontera de E3b); no guarda
// nada en `sessionStorage` ni comparte fuente ni caché con el Top manual.
import { NOMBRE_PENDIENTE } from "./nombre.ts";

export type EstadoYumper = "activo" | "eliminada" | "bloqueado";

export interface FilaTop {
  posicion: number;
  puntos: number;
  estado: EstadoYumper;
  id: string | null;
  nombre: string | null;
  avatar: string | null;
  propio: boolean;
}

export interface TopYumpers {
  mes: string;
  autores: number;
  filas: FilaTop[];
  mia: { posicion: number; puntos: number } | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const natural = (x: unknown) => Number.isSafeInteger(x) && (x as number) >= 1;

function fila(x: unknown): FilaTop | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!natural(o.posicion) || !natural(o.puntos)) return null;
  const base = { posicion: o.posicion as number, puntos: o.puntos as number };
  if (o.estado === "eliminada" || o.estado === "bloqueado") {
    return { ...base, estado: o.estado, id: null, nombre: null, avatar: null, propio: false };
  }
  if (o.estado !== "activo" || typeof o.id !== "string" || !UUID.test(o.id)) return null;
  return {
    ...base, estado: "activo", id: o.id,
    nombre: typeof o.nombre === "string" && o.nombre ? o.nombre : null,
    avatar: typeof o.avatar === "string" && /^[a-z]{1,30}$/.test(o.avatar) ? o.avatar : null,
    propio: o.propio === true,
  };
}

/** Una respuesta válida y activa, o null. `{activo:false}` se trata aparte (apagado). */
export function topValido(j: unknown): TopYumpers | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  if (o.activo !== true || typeof o.mes !== "string" || !/^\d{4}-\d{2}$/.test(o.mes) || !Array.isArray(o.items)) return null;
  const filas = o.items.map(fila);
  if (filas.some((x) => x === null)) return null;
  const m = o.mia as Record<string, unknown> | null | undefined;
  const mia = m && natural(m.posicion) && natural(m.puntos) ? { posicion: m.posicion as number, puntos: m.puntos as number } : null;
  return { mes: o.mes, autores: Number.isSafeInteger(o.autores) ? (o.autores as number) : filas.length, filas: filas as FilaTop[], mia };
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-09" → "septiembre de 2026". */
export function etiquetaMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return MESES[m - 1] ? `${MESES[m - 1]} de ${a}` : mes;
}

export const textoPuntos = (n: number) => (n === 1 ? "1 punto" : `${n} puntos`);

/** Lo que se muestra como nombre de una fila. */
export function nombreFila(f: FilaTop): string {
  if (f.estado === "eliminada") return "Cuenta eliminada";
  if (f.estado === "bloqueado") return "Usuario bloqueado";
  return f.nombre ?? NOMBRE_PENDIENTE;
}
