// Los errores de las RPC de salas, en castellano rioplatense. Puro, client-safe.
//
// Las funciones de 009_salas.sql lanzan `raise exception 'sala_xxx'`, y
// PostgREST lo devuelve en `error.message` (a veces con detalle detrás de los
// dos puntos, como `sala_plataforma_desconocida: zz`). Acá se mapea el código a
// un texto para la persona; lo que no se reconoce cae en un genérico y se
// conserva el código crudo para el log, nunca para la pantalla.
export type CodigoSala =
  | "sala_sin_sesion" | "sala_desactivadas" | "sala_ya_tiene_activa" | "sala_credencial_en_uso"
  | "sala_credencial_invalida" | "sala_inexistente" | "sala_no_admite_ingresos" | "sala_llena"
  | "sala_no_participa" | "sala_token_invalido" | "sala_nombre_invalido" | "sala_sin_plataformas"
  | "sala_demasiadas_plataformas" | "sala_plataforma_desconocida" | "sala_no_es_host"
  | "sala_sin_empate" | "sala_preparando";

const TEXTOS: Record<CodigoSala, string> = {
  sala_sin_sesion: "Tenés que ingresar con tu cuenta para hacer esto.",
  sala_desactivadas: "Las salas están desactivadas por ahora. Probá más tarde.",
  sala_ya_tiene_activa: "Ya tenés una sala abierta. Cerrala antes de crear otra.",
  sala_credencial_en_uso: "Esta pestaña ya está en otra sala. Recargá e intentá de nuevo.",
  sala_credencial_invalida: "No pudimos identificarte en esta sala. Recargá la página.",
  sala_inexistente: "Esta sala no existe o ya se borró.",
  sala_no_admite_ingresos: "La sala ya empezó: no se puede entrar ahora.",
  sala_llena: "La sala está llena (máximo 6 personas).",
  sala_no_participa: "No estás en esta sala.",
  sala_token_invalido: "Tu acceso a esta sala ya no sirve. Entrá de nuevo.",
  sala_nombre_invalido: "Poné un nombre de 1 a 24 caracteres.",
  sala_sin_plataformas: "Elegí al menos una plataforma.",
  sala_demasiadas_plataformas: "Son demasiadas plataformas.",
  sala_plataforma_desconocida: "Alguna plataforma no es válida. Recargá la página.",
  sala_no_es_host: "Sólo quien creó la sala puede hacer esto.",
  sala_sin_empate: "No hay un empate que resolver.",
  sala_preparando: "La tanda se está armando: esperá un momento.",
};

export const GENERICO = "No pudimos hacerlo. Probá de nuevo.";
export const SIN_RED = "Sin conexión. Revisá la red y probá de nuevo.";

/** El código `sala_*` al principio del mensaje de PostgREST, o null. */
export function codigoDe(mensaje: string | null | undefined): CodigoSala | null {
  const m = /^\s*(sala_[a-z_]+)/.exec(mensaje ?? "");
  if (!m) return null;
  return m[1] in TEXTOS ? (m[1] as CodigoSala) : null;
}

/** Texto para la persona a partir del mensaje crudo de la RPC. */
export function mensajeDeError(mensaje: string | null | undefined): string {
  const c = codigoDe(mensaje);
  if (c) return TEXTOS[c];
  if (/fetch|network|Failed to fetch|NetworkError/i.test(mensaje ?? "")) return SIN_RED;
  return GENERICO;
}

/** Respuestas de POST /api/sala/preparar que no son 200, en castellano. */
export function mensajeDePreparar(status: number, body: { motivo?: string; alcanzables?: number[] } | null): string {
  const motivo = body?.motivo;
  if (motivo === "insuficientes") {
    const a = body?.alcanzables ?? [];
    if (!a.length) return "Con las plataformas de la sala no alcanza ni para una tanda de 5. Sumá plataformas o participantes.";
    return `Con las plataformas de la sala alcanza para una tanda de ${a.join(" o de ")}. Elegí ese tamaño.`;
  }
  if (motivo === "sin_quorum") return "Hacen falta al menos 2 personas para empezar.";
  if (motivo === "estado") return "La sala ya no está en el lobby.";
  if (motivo === "no_es_host") return TEXTOS.sala_no_es_host;
  if (motivo === "desactivadas" || motivo === "desactivado" || status === 503) return TEXTOS.sala_desactivadas;
  if (motivo === "sin_sesion" || status === 401) return TEXTOS.sala_sin_sesion;
  return GENERICO;
}
