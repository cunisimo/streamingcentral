// La lógica de "Me sirvió" / "No me sirvió" (E3a). PURO.
//   - el conteo es explícito: "285 de 481 encontraron útil esta opinión"
//     (pedido del dueño, 25/10), con singular y sin evaluaciones;
//   - tocar el botón ya elegido retira el voto; tocar el otro lo cambia;
//   - la propia reseña no se evalúa.
import { MENSAJE_ERROR, MENSAJE_SIN_CONFIRMAR, MOTIVOS_CUENTA } from "./mensajes.ts";

export type Voto = "util" | "no_util";

const numero = (n: number) => n.toLocaleString("es-AR");

/** El verbo concuerda con quienes la encontraron útil: "1 de 4 encontró". */
export function conteoUtilidad(utiles: number, total: number): string {
  if (total <= 0) return "Todavía nadie evaluó esta opinión.";
  return `${numero(utiles)} de ${numero(total)} ${utiles === 1 ? "encontró" : "encontraron"} útil esta opinión`;
}

/** Nombre accesible de cada botón (los iconos no tienen texto visible). */
export function nombreBotonVoto(boton: Voto): string {
  return boton === "util" ? "Me sirvió" : "No me sirvió";
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
    case "sin_confirmar":
    default:
      return MENSAJE_SIN_CONFIRMAR;
  }
}
