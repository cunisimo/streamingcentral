// La opción "Medición de campañas con Meta" de Sobre Yump.
//
// Decisión del dueño (30/10/2026): la medición está ACTIVADA POR DEFECTO, sin
// ventanas ni pedidos de permiso, y se puede desactivar acá. Controla SÓLO el
// SDK de Meta de la app Android; no es un interruptor de toda la analítica.
//
// La elección vive en el teléfono (SharedPreferences, ver
// android/.../MedicionMeta.java), no en la cuenta: rige con o sin sesión, y
// cerrar sesión o cambiar de cuenta no la toca. En la web y la PWA no hay SDK
// de Meta, así que la opción no se muestra.
//
// El import de @capacitor/core es dinámico, como en lib/compartir-accion.ts:
// el bundle web no lo necesita.
import { ES_NATIVO } from "./plataforma.ts";

export const MEDICION_META = Object.freeze({
  TITULO: "Medición de campañas con Meta",
  EXPLICACION:
    "Permite medir instalaciones y aperturas relacionadas con nuestras campañas de Facebook e Instagram. Podés desactivarla sin afectar el funcionamiento de Yump.",
});

interface PluginMedicionMeta {
  estado(): Promise<{ activa: boolean }>;
  cambiar(o: { activa: boolean }): Promise<{ activa: boolean }>;
}

let plugin: Promise<PluginMedicionMeta> | null = null;

function obtener(): Promise<PluginMedicionMeta> {
  plugin ??= import("@capacitor/core").then(({ registerPlugin }) =>
    registerPlugin<PluginMedicionMeta>("MedicionMeta"),
  );
  return plugin;
}

/** ¿Se muestra la opción? Sólo en la app Android, que es donde está el SDK. */
export function hayMedicionMeta(nativo: boolean = ES_NATIVO): boolean {
  return nativo;
}

/** Una llamada al puente; `null` si no hay app nativa o si el puente falló. */
async function llamar(op: (p: PluginMedicionMeta) => Promise<{ activa: boolean }>): Promise<boolean | null> {
  if (!hayMedicionMeta()) return null;
  try {
    return (await op(await obtener())).activa;
  } catch {
    return null;
  }
}

/** La elección guardada en el teléfono. `null` si no se pudo leer. */
export function leerMedicionMeta(): Promise<boolean | null> {
  return llamar((p) => p.estado());
}

/** Guarda y aplica la elección. Devuelve la que quedó, o `null` si falló. */
export function cambiarMedicionMeta(activa: boolean): Promise<boolean | null> {
  return llamar((p) => p.cambiar({ activa }));
}
