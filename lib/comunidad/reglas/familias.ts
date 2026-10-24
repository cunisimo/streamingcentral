// Tabla regla → familia del contrato de moderación v1 (catálogo v3.2, §5.1).
// Versionada: cualquier cambio es una versión nueva (y, para una evaluación,
// una versión nueva del módulo). El evaluador del contrato lee de acá qué
// familia disparó cada regla; CS se mide por el disparo de la PROPIA familia.

export const VERSION_FAMILIAS = "1";

export type Familia =
  | "F1" | "F2" | "F3" | "F4"
  | "S1" | "S2" | "S3" | "S4" | "S5"
  | "H1" | "H2" | "H3";

export const FAMILIAS: readonly Familia[] = ["F1", "F2", "F3", "F4", "S1", "S2", "S3", "S4", "S5", "H1", "H2", "H3"];

/** Reglas sin familia del contrato: formato, texto anómalo y `menores.sexual` (E8, defensa sin criterio). */
export const SIN_FAMILIA: readonly string[] = [
  "formato.resena", "formato.nombre", "anomalo.mayusculas", "anomalo.vocabulario", "anomalo.repeticion", "menores.sexual",
];

export const FAMILIA_DE_REGLA: Readonly<Record<string, Familia>> = {
  "contacto.telefono": "F1",
  "contacto.telefono_nombre": "F1",
  "contacto.email": "F2",
  "contacto.email_nombre": "F2",
  "contacto.enlace": "F3",
  "contacto.red": "F4",
  "contacto.red_nombre": "F4",
  // El correo indirecto es una autoatribución de medio con alias o pedido (S1).
  "contacto.email_indirecto": "S1",
  "senal.autoatribucion": "S1",
  "senal.privado": "S2",
  "perfil.derivacion": "S3",
  "contacto.partido": "S4",
  "spam.promocion": "S5",
  "amenaza.directa": "H1",
  "odio.lista": "H2",
  "odio.nombre": "H2",
  "datos.documento": "H3",
  "datos.domicilio": "H3",
};

/** Familias disparadas por una lista de ids de regla. Una regla sin entrada lanza: la tabla tiene que estar completa. */
export function familiasDisparadas(reglas: readonly string[]): Set<Familia> {
  const salida = new Set<Familia>();
  for (const r of reglas) {
    const f = FAMILIA_DE_REGLA[r];
    if (f) salida.add(f);
    else if (!SIN_FAMILIA.includes(r)) throw new Error(`regla sin clasificar en familias.ts: ${r}`);
  }
  return salida;
}
