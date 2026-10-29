// El ORDEN de un cambio de nombre comunitario (E6), separado de con qué se
// hace cada paso. PURO, con dependencias inyectadas, como escritura-nucleo.ts:
// la batería local (scripts/comunidad/pruebas-perfiles.mjs) corre ESTE núcleo
// con los adaptadores reales contra Supabase local.
//
// Pasos:
//   1. forma del pedido (uid uuid, nombre texto acotado);
//   2. normalizar (lib/comunidad/nombre.ts) y validar con los mismos
//      caracteres y el mismo largo que la base. Un rechazo de formato no toca
//      la base ni consume límite;
//   3. reglas de nombre de E1 (contacto, enlaces, odio). `error` → "No se
//      pudo guardar" sin tocar nada. Sólo `publicar`, `retener` y
//      `rechazo_contenido` llegan a la base;
//   4. `comunidad_cambiar_nombre` (sólo service_role): fila A, límite del día
//      y la escritura. Un nombre que se retendría NO se guarda: no hay cola
//      de revisión de nombres;
//   5. confirmación perdida: se repite UNA vez con el MISMO `id_intento` y
//      el mismo hash (A1 de la auditoría de E6). La base devuelve el
//      resultado ya registrado de ese intento (`repetido`) sin escribir ni
//      consumir cupo, aunque otra sesión haya cambiado el nombre en el
//      medio; si tampoco se confirma, `sin_confirmar`. El hash es un HMAC del
//      pedido normalizado (lo arma el adaptador; sin secreto, "error") y el
//      intento guardado no lleva el nombre.
import type { Decision } from "./reglas/tipos.ts";
import { conReconciliacion, esBajaEnCurso, type RespuestaBase, type SinConfirmar } from "./escritura-nucleo.ts";
import { normalizarNombre, problemaNombre } from "./nombre.ts";

/** `idIntento`: uuid del cliente, el MISMO en cada reintento del mismo envío. */
export interface PedidoNombre { uid: string; nombre: string; idIntento: string }

export interface DependenciasNombre {
  evaluar: (nombre: string) => Decision;
  hash: (s: string) => string;
  cambiar: (a: {
    uid: string; nombre: string; decision: { resultado: string; version_reglas: string; reglas: string[] }; idIntento: string; hash: string;
  }) => Promise<RespuestaBase>;
}

export type ResultadoNombre =
  | { resultado: "invalido" }
  | { resultado: "rechazo_formato"; mensaje: string }
  | { resultado: "error" }
  | { resultado: "baja_en_curso" }
  | SinConfirmar
  | RespuestaBase;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo que se firma: la acción y el nombre NORMALIZADO (mismo envío, mismo hash). */
export const firmaNombre = (normalizado: string) => JSON.stringify(["nombre", normalizado]);

export async function cambiarNombre(deps: DependenciasNombre, p: PedidoNombre): Promise<ResultadoNombre> {
  if (typeof p.uid !== "string" || !UUID.test(p.uid) || typeof p.nombre !== "string" || p.nombre.length > 200
      || typeof p.idIntento !== "string" || !UUID.test(p.idIntento)) {
    return { resultado: "invalido" };
  }
  const nombre = normalizarNombre(p.nombre);
  const problema = problemaNombre(nombre);
  if (problema) return { resultado: "rechazo_formato", mensaje: problema };

  let d: Decision;
  try {
    d = deps.evaluar(nombre);
  } catch {
    return { resultado: "error" };
  }
  if (d.resultado === "error") return { resultado: "error" };
  if (d.resultado === "rechazo_formato") return { resultado: "rechazo_formato", mensaje: d.motivoUsuario };
  if (d.resultado !== "publicar" && d.resultado !== "retener" && d.resultado !== "rechazo_contenido") return { resultado: "error" };

  const decision = {
    resultado: d.resultado,
    version_reglas: d.versionReglas,
    reglas: d.disparadas.filter((x) => x.resultado === d.resultado).map((x) => x.regla),
  };
  let hash: string;
  try {
    hash = deps.hash(firmaNombre(nombre));
  } catch {
    return { resultado: "error" };
  }
  const llamar = async () => {
    const x = await deps.cambiar({ uid: p.uid, nombre, decision, idIntento: p.idIntento, hash });
    if (!x || typeof x.resultado !== "string") throw new Error("respuesta inesperada");
    return x;
  };
  let r: RespuestaBase | SinConfirmar;
  try {
    r = await conReconciliacion(llamar);
  } catch (e) {
    return esBajaEnCurso(e) ? { resultado: "baja_en_curso" } : { resultado: "error" };
  }
  // El texto del rechazo lo dan las reglas (la base no guarda el nombre rechazado).
  if (r.resultado === "rechazo_contenido") return { ...r, mensaje: d.motivoUsuario };
  return r;
}
