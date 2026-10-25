// La lógica de "Me sirvió" / "No me sirvió" (E3a). PURO.
//   - el conteo es explícito: "A n de m les sirvió", con singular;
//   - tocar el botón ya elegido retira el voto; tocar el otro lo cambia;
//   - la propia reseña no se evalúa.
import { MENSAJE_ERROR, MENSAJE_SIN_CONFIRMAR, MOTIVOS_CUENTA } from "./mensajes.ts";

export type Voto = "util" | "no_util";

export function conteoUtilidad(utiles: number, total: number): string {
  if (total <= 0) return "Todavía nadie la evaluó.";
  return `A ${utiles} de ${total} ${total === 1 ? "le" : "les"} sirvió.`;
}

/** Qué se manda al tocar un botón, según el voto vigente. */
export function accionVoto(miVoto: Voto | null, boton: Voto): Voto | "retirar" {
  return miVoto === boton ? "retirar" : boton;
}

export function puedeEvaluar(esPropia: boolean, sesion: boolean): boolean {
  return sesion && !esPropia;
}

/** El texto tras votar o retirar. null = sin mensaje (salió bien). */
export function mensajeVoto(r: { resultado?: unknown; motivo?: unknown } | "sin-confirmar"): string | null {
  if (r === "sin-confirmar") return MENSAJE_SIN_CONFIRMAR;
  switch (r.resultado) {
    case "voto_registrado":
    case "voto_retirado":
    case "sin_cambios":
    case "sin_efecto":
      return null;
    case "rechazo_cuenta":
      return MOTIVOS_CUENTA[String(r.motivo)] ?? MENSAJE_ERROR;
    case "baja_en_curso":
      return MOTIVOS_CUENTA.baja_en_curso;
    case "error":
      return "No se pudo registrar el voto, probá de nuevo.";
    default:
      return MENSAJE_SIN_CONFIRMAR;
  }
}
