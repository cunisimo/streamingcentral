// El ORDEN de una denuncia en el servidor (E3b; revisión §3.3.2). PURO, con
// dependencias inyectadas, como escritura-nucleo: los adaptadores reales son
// los de escritura-deps (`operacionesComunidad`) y la batería local
// (scripts/comunidad/pruebas-moderacion.mjs) corre ESTE núcleo con ESOS
// adaptadores.
//
//   1. forma: uid, versión, categoría del diseño, comentario ≤ 300;
//   2. `comunidad_denunciar` (fila C de la matriz, límites, cota por versión
//      y por hora). Ya vuelve reconciliado: una confirmación perdida se
//      repite una vez (una por denunciante y versión: no se duplica) y si
//      tampoco se confirma es `sin_confirmar`;
//   3. CORROBORACIÓN, sólo con una denuncia nueva: se vuelven a correr las
//      reglas VIGENTES sobre el texto denunciado. Si ahora lo retendrían o
//      rechazarían, la versión pasa a retenida POR LA REGLA. Si no, nada:
//      ni la categoría ni la cantidad ocultan. Que la corroboración falle no
//      deshace la denuncia (la ve una persona igual) y no se le informa a
//      quien denuncia, que nunca se entera del resultado de la moderación;
//   4. si quien denuncia lo pidió, bloquear al autor en el mismo paso. Se
//      hace AUNQUE la denuncia no se haya podido recibir: bloquear siempre
//      está disponible (§3.3).
// Lo que vuelve al cliente no incluye el texto ni si la denuncia se agrupó.
import type { Decision } from "./reglas/tipos.ts";
import { comentarioDenuncia, esCategoria } from "./menu-nucleo.ts";
import { esBajaEnCurso, type RespuestaBase, type SinConfirmar } from "./escritura-nucleo.ts";

export interface DependenciasDenuncia {
  denunciar: (uid: string, versionId: number, categoria: string, comentario: string | null) => Promise<RespuestaBase | SinConfirmar>;
  evaluar: (texto: string) => Decision;
  retenerPorRegla: (versionId: number, decision: { resultado: string; version_reglas: string; reglas: string[] }) => Promise<RespuestaBase | SinConfirmar>;
  bloquear: (uid: string, versionId: number) => Promise<RespuestaBase | SinConfirmar>;
}

export interface PedidoDenuncia {
  uid: string;
  versionId: unknown;
  categoria: unknown;
  comentario?: unknown;
  bloquear?: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const entero = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;

/** Lo que el cliente puede ver de una respuesta de la base. */
function publico(r: RespuestaBase | SinConfirmar): Record<string, unknown> {
  const out: Record<string, unknown> = { resultado: r.resultado };
  for (const k of ["motivo", "repetido", "bloqueo_id"]) if (k in r) out[k] = (r as Record<string, unknown>)[k];
  return out;
}

async function intentar(f: () => Promise<RespuestaBase | SinConfirmar>): Promise<Record<string, unknown>> {
  try {
    return publico(await f());
  } catch (e) {
    // Rechazo CONFIRMADO de la base (los inciertos ya vienen como sin_confirmar).
    return { resultado: esBajaEnCurso(e) ? "baja_en_curso" : "error" };
  }
}

export async function denunciarVersion(deps: DependenciasDenuncia, p: PedidoDenuncia): Promise<Record<string, unknown>> {
  const c = comentarioDenuncia(p.comentario);
  if (typeof p.uid !== "string" || !UUID.test(p.uid) || !entero(p.versionId) || !esCategoria(p.categoria) || !c.ok
      || (p.bloquear !== undefined && typeof p.bloquear !== "boolean")) {
    return { resultado: "invalido" };
  }
  const versionId = p.versionId;
  let crudo: RespuestaBase | SinConfirmar | null = null;
  const denuncia = await intentar(async () => (crudo = await deps.denunciar(p.uid, versionId, p.categoria as string, c.valor)));

  const r = crudo as (RespuestaBase & { nueva?: unknown; texto?: unknown }) | SinConfirmar | null;
  if (r && r.resultado === "denuncia_registrada" && "nueva" in r && r.nueva === true && typeof r.texto === "string") {
    try {
      const d = deps.evaluar(r.texto);
      if (d.resultado === "retener" || d.resultado === "rechazo_contenido") {
        await deps.retenerPorRegla(versionId, {
          resultado: d.resultado,
          version_reglas: d.versionReglas,
          reglas: d.disparadas.filter((x) => x.resultado === d.resultado).map((x) => x.regla),
        });
      }
    } catch {
      // La denuncia ya quedó registrada y la revisa una persona.
    }
  }

  if (p.bloquear === true) denuncia.bloqueo = await intentar(() => deps.bloquear(p.uid, versionId));
  return denuncia;
}

/** HTTP de una respuesta del menú (denuncia, bloqueo, desbloqueo). */
export function estadoHttpMenu(r: Record<string, unknown>): number {
  if (r.resultado === "invalido") return 400;
  if (r.resultado === "error") return 500;
  if (r.resultado === "sin_confirmar") return 503;
  return 200;
}
