// Términos de la comunidad, versionados (E3a). Apto para el cliente.
//
// 🔴 BORRADOR LOCAL, SIN APROBAR. La revisión (§5) deja "términos comunitarios
// versionados" a validar por alguien competente; esto existe sólo para
// construir y probar el flujo de aceptación con los interruptores apagados.
// La versión tiene que coincidir con `comunidad.config.terminos_version` de
// la migración 014 (un test lo fija); si la base tiene otra, aceptar responde
// `terminos_desactualizados` y no se acepta nada.
export const TERMINOS_VERSION = "borrador-local-1";

export const TERMINOS_PUNTOS: readonly string[] = [
  "Escribí sobre la película o la serie: qué te pareció y por qué.",
  "No compartas datos de contacto, enlaces ni datos personales tuyos o de otros.",
  "No publiques insultos, amenazas, odio ni promociones.",
  "Avisá si una reseña revela el final: las reseñas se muestran cerradas para no arruinar nada.",
  "Las reseñas pasan por reglas automáticas: algunas se publican, otras quedan en revisión y otras se rechazan con el motivo.",
  "Podés borrar tus reseñas y retirar tus votos cuando quieras.",
];
