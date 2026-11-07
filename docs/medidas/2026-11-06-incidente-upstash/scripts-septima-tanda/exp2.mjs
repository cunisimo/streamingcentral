// SÓLO EXPERIMENTO, en una copia descartable: variantes activables por entorno.
import { readFileSync, writeFileSync } from "node:fs";
const editar = (f, pares) => {
  const c = readFileSync(f, "utf8"); const crlf = c.includes("\r\n"); let s = c.replace(/\r\n/g, "\n");
  for (const [a, b] of pares) { if (s.split(a).length !== 2) throw new Error(f + ": " + a); s = s.replace(a, () => b); }
  writeFileSync(f, crlf ? s.replace(/\n/g, "\r\n") : s);
};
// Sin barrera: lee directo.
editar("lib/lote-proveedores.ts", [
  ["  const pendientes: Promise<R>[] = [];", "  if (process.env.EXP_SIN_BARRERA === \"1\") return leer;\n  const pendientes: Promise<R>[] = [];"],
]);
editar("lib/enrich.ts", [
  // Lector de la evidencia manual inyectable, y sin copia `disp:` por título.
  ["    hayFlatrateAR?: boolean;\n    reg?: ResumenRegional;\n  },\n): Promise<PlatformCode[]> {",
   "    hayFlatrateAR?: boolean;\n    reg?: ResumenRegional;\n  },\n  leerTopManual: typeof evidenciaTopManual = evidenciaTopManual,\n): Promise<PlatformCode[]> {"],
  ["  const res = await cachedIf(`disp:${type}:${id}`, TTL.editorial, async () => {", "  const resolver = async () => {"],
  ["      leerTopManual: evidenciaTopManual,", "      leerTopManual,"],
  ["    return r.plataformas;\n  }, () => !fallo);\n  return res;",
   "    return r.plataformas;\n  };\n  if (process.env.EXP_SIN_DISP === \"1\") return resolver();\n  const res = await cachedIf(`disp:${type}:${id}`, TTL.editorial, resolver, () => !fallo);\n  return res;"],
  // toUITitle recibe el lector de la tanda.
  ["  t: RawTitle, type: MediaType, published?: Set<string>, leerProveedores: typeof providersOf = providersOf,\n",
   "  t: RawTitle, type: MediaType, published?: Set<string>, leerProveedores: typeof providersOf = providersOf,\n  leerTopManual: typeof evidenciaTopManual = evidenciaTopManual,\n"],
  ["  const codes = await disponibilidadDe(type, t.id, prov);", "  const codes = await disponibilidadDe(type, t.id, prov, leerTopManual);"],
  // Persona y «Ver más»: una lectura por tanda.
  ["  const leerProveedores = barreraDeLote(providersOf);\n  return async (tipo: MediaType, id: number): Promise<PlatformCode[]> =>\n    disponibilidadDe(tipo, id, await leerProveedores(tipo, id));",
   "  const leerProveedores = barreraDeLote(providersOf);\n  let enCurso: ReturnType<typeof evidenciaTopManual> | null = null;\n  const leerTopManual = process.env.EXP_TM_TANDA === \"1\" ? () => (enCurso ??= evidenciaTopManual()) : evidenciaTopManual;\n  return async (tipo: MediaType, id: number): Promise<PlatformCode[]> =>\n    disponibilidadDe(tipo, id, await leerProveedores(tipo, id), leerTopManual);"],
  // Relacionados de la ficha: sólo para evaluar el caso mezclado.
  ["  const leerProveedores = barreraDeLote(providersOf);\n  const relatedTodos = await settleAll(\n    recs.map((r) => toUITitle(r, type, pub, leerProveedores)), `related ${type}/${id}`,",
   "  const leerProveedores = barreraDeLote(providersOf);\n  let enCursoRel: ReturnType<typeof evidenciaTopManual> | null = null;\n  const leerTopManualRel = process.env.EXP_TM_FICHA === \"1\" ? () => (enCursoRel ??= evidenciaTopManual()) : evidenciaTopManual;\n  const relatedTodos = await settleAll(\n    recs.map((r) => toUITitle(r, type, pub, leerProveedores, leerTopManualRel)), `related ${type}/${id}`,"],
]);
console.log("exp2 ok");
