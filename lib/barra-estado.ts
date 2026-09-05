import { ES_NATIVO } from "./plataforma.ts";
import type { TemaColor } from "./tema-colores.ts";

/**
 * El estilo de barra de estado que le corresponde a cada tema de la app.
 *
 * ============================================================================
 * 🔴 EL NOMBRE DEL ESTILO ES AL REVÉS DE LO QUE PARECE
 * ============================================================================
 * En `@capacitor/status-bar`, `Style` NO describe el fondo de la barra: describe
 * el TEXTO. Textual de sus tipos:
 *
 *     Dark  = "DARK"   → "Light text for dark backgrounds"
 *     Light = "LIGHT"  → "Dark text for light backgrounds"
 *
 * O sea que con la app en tema oscuro va `Dark` (texto claro) y con la app en
 * claro va `Light` (texto oscuro). Coincide por nombre, pero por el motivo
 * contrario al que uno supone, y equivocarlo es exactamente el bug que CP8
 * midió: iconos blancos sobre fondo casi blanco.
 *
 * Se devuelve el string del enum y no el enum, para poder probar el mapeo sin
 * cargar el plugin.
 */
export function estiloDeBarra(tema: TemaColor): "DARK" | "LIGHT" {
  return tema === "dark" ? "DARK" : "LIGHT";
}

/**
 * Pone el estilo de la barra de estado. En web no hace nada.
 *
 * ⚠️ SÓLO toca `setStyle`, nunca `setBackgroundColor` ni `setOverlaysWebView`.
 * El fondo ya acompaña al tema porque la WebView dibuja debajo de la barra
 * —edge-to-edge—, y eso es lo que hace que `env(safe-area-inset-top)` valga 46px
 * en este teléfono. `setOverlaysWebView` además está declarado como no
 * disponible en Android 15+, y el aparato de prueba corre Android 16.
 *
 * El import es dinámico para que el plugin no entre en el bundle web.
 */
export async function aplicarBarraDeEstado(tema: TemaColor): Promise<void> {
  if (!ES_NATIVO) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: estiloDeBarra(tema) === "DARK" ? Style.Dark : Style.Light });
  } catch {
    // Un fallo del plugin no puede romper el cambio de tema: la app sigue.
  }
}
