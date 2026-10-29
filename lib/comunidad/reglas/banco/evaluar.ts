// Evaluación de un banco de casos sintéticos contra las reglas, con
// resultado por caso, por categoría y los criterios de la revisión §3.6. Lo
// usan el test del banco de desarrollo y los corredores de los reservados.
//
// Mide REGLAS CONTRA CASOS CONOCIDOS. No mide eficacia contra abuso real ni
// contra variantes que el banco no tiene.
//
// 🔴 UN BANCO INVÁLIDO NO APRUEBA NADA (E1.1, auditoría de ffa5061, A4). Antes
// de evaluar se valida el esquema, los ids y que estén los grupos exigidos.
// Si falla, el informe es `no_evaluable` y ningún criterio "cumple". Un
// criterio cuyo denominador es 0 también es `no_evaluable`: 0/0 nunca es 0 %.
// Los errores técnicos (`error`) NO cuentan como detecciones.

import { evaluarNombre, evaluarResena } from "../decision.ts";
import type { ContextoResena, Decision } from "../tipos.ts";

export type Esperado = "publicar" | "rechazar" | "retener" | "frenar";

export interface CasoBanco {
  id: string;
  tipo: "resena" | "nombre";
  grupo: "legitima" | "abuso";
  categoria: string;
  /** Sólo abuso: forma directa u ofuscada. */
  variante?: "directa" | "ofuscada";
  /** Sólo abuso: enlace o contacto claro (criterio C1). */
  claro?: boolean;
  esperado: Esperado;
  texto: string;
  contexto?: ContextoResena;
}

/** Lo mínimo que tiene que traer un banco para que sus criterios digan algo. */
export interface Requisitos {
  legitimasResena: number;
  abusoResena: number;
  ofuscadas: number;
  claros: number;
  nombresLegitimos: number;
}

export const REQUISITOS_MINIMOS: Requisitos = {
  legitimasResena: 1, abusoResena: 1, ofuscadas: 1, claros: 1, nombresLegitimos: 1,
};

export interface ResultadoCaso {
  caso: CasoBanco;
  decision: Decision;
  /** Detectado por una regla (rechazo o retención). Un `error` NO es una detección. */
  detectado: boolean;
  /** Error técnico de la evaluación. */
  error: boolean;
  /** El resultado es el esperado. */
  coincide: boolean;
}

export type EstadoCriterio = "cumple" | "no_cumple" | "no_evaluable";

export interface Criterio {
  id: string;
  descripcion: string;
  valor: string;
  estado: EstadoCriterio;
  /** Atajo: `estado === "cumple"`. */
  cumple: boolean;
}

export interface InformeBanco {
  evaluable: boolean;
  problemas: string[];
  resultados: ResultadoCaso[];
  criterios: Criterio[];
  porCategoria: { clave: string; total: number; coinciden: number; detectados: number; errores: number }[];
}

// ---------------------------------------------------------------- validación

const TIPOS = new Set(["resena", "nombre"]);
const GRUPOS = new Set(["legitima", "abuso"]);
const ESPERADOS = new Set(["publicar", "rechazar", "retener", "frenar"]);
const VARIANTES = new Set(["directa", "ofuscada"]);

function problemasDeCaso(c: unknown, i: number): string[] {
  const p: string[] = [];
  if (typeof c !== "object" || c === null || Array.isArray(c)) return [`caso ${i}: no es un objeto`];
  const x = c as Record<string, unknown>;
  const id = typeof x.id === "string" && x.id !== "" ? x.id : `#${i}`;
  if (typeof x.id !== "string" || x.id === "") p.push(`caso ${i}: id inválido`);
  if (!TIPOS.has(x.tipo as string)) p.push(`${id}: tipo inválido`);
  if (!GRUPOS.has(x.grupo as string)) p.push(`${id}: grupo inválido`);
  if (typeof x.categoria !== "string" || x.categoria === "") p.push(`${id}: categoría inválida`);
  if (!ESPERADOS.has(x.esperado as string)) p.push(`${id}: esperado inválido`);
  if (typeof x.texto !== "string") p.push(`${id}: texto inválido`);
  if (x.grupo === "legitima") {
    if (x.esperado !== "publicar") p.push(`${id}: una legítima tiene que esperar "publicar"`);
    if (x.variante !== undefined || x.claro !== undefined) p.push(`${id}: variante/claro sólo en abuso`);
  }
  if (x.grupo === "abuso") {
    if (x.esperado === "publicar") p.push(`${id}: un abuso no puede esperar "publicar"`);
    if (!VARIANTES.has(x.variante as string)) p.push(`${id}: variante inválida`);
    if (x.claro !== undefined && typeof x.claro !== "boolean") p.push(`${id}: claro inválido`);
  }
  if (x.contexto !== undefined) {
    const t = (x.contexto as { textosRecientes?: unknown } | null)?.textosRecientes;
    if (!Array.isArray(t) || !t.every((s) => typeof s === "string")) p.push(`${id}: contexto inválido`);
    if (x.tipo !== "resena") p.push(`${id}: contexto sólo en reseñas`);
  }
  return p;
}

/** Esquema, ids únicos y grupos exigidos. Vacío = válido. */
export function validarBanco(casos: unknown, requisitos: Requisitos = REQUISITOS_MINIMOS): string[] {
  if (!Array.isArray(casos)) return ["el banco no es una lista de casos"];
  const problemas = casos.flatMap(problemasDeCaso);
  const ids = new Map<string, number>();
  for (const c of casos) {
    const id = (c as { id?: unknown })?.id;
    if (typeof id === "string") ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  for (const [id, n] of ids) if (n > 1) problemas.push(`${id}: id repetido ${n} veces`);
  if (problemas.length > 0) return problemas;

  const b = casos as CasoBanco[];
  const cuenta = (f: (c: CasoBanco) => boolean) => b.filter(f).length;
  const exigido: [string, number, number][] = [
    ["reseñas legítimas", cuenta((c) => c.tipo === "resena" && c.grupo === "legitima"), requisitos.legitimasResena],
    ["reseñas de abuso", cuenta((c) => c.tipo === "resena" && c.grupo === "abuso"), requisitos.abusoResena],
    ["variantes ofuscadas", cuenta((c) => c.grupo === "abuso" && c.variante === "ofuscada"), requisitos.ofuscadas],
    ["contactos o enlaces claros", cuenta((c) => c.grupo === "abuso" && c.claro === true), requisitos.claros],
    ["nombres legítimos", cuenta((c) => c.tipo === "nombre" && c.grupo === "legitima"), requisitos.nombresLegitimos],
  ];
  for (const [nombre, hay, minimo] of exigido) {
    if (hay < Math.max(1, minimo)) problemas.push(`faltan ${nombre}: hay ${hay}, se exigen al menos ${Math.max(1, minimo)}`);
  }
  return problemas;
}

// ---------------------------------------------------------------- evaluación

function coincide(esperado: Esperado, d: Decision): boolean {
  switch (esperado) {
    case "publicar": return d.resultado === "publicar";
    case "rechazar": return d.resultado === "rechazo_contenido" || d.resultado === "rechazo_formato";
    case "retener": return d.resultado === "retener";
    case "frenar": return d.resultado === "retener" || d.resultado === "rechazo_contenido" || d.resultado === "rechazo_formato";
  }
}

export function evaluarCaso(c: CasoBanco): ResultadoCaso {
  const decision = c.tipo === "resena"
    ? evaluarResena(c.texto, c.contexto ?? { textosRecientes: [] })
    : evaluarNombre(c.texto);
  const error = decision.resultado === "error";
  const detectado = !error && decision.resultado !== "publicar";
  return { caso: c, decision, detectado, error, coincide: coincide(c.esperado, decision) };
}

const fmt = (n: number, d: number) => `${n}/${d}` + (d === 0 ? "" : ` (${((100 * n) / d).toFixed(1)} %)`);

function criterio(id: string, descripcion: string, n: number, d: number, cumple: (n: number, d: number) => boolean): Criterio {
  const estado: EstadoCriterio = d === 0 ? "no_evaluable" : cumple(n, d) ? "cumple" : "no_cumple";
  return { id, descripcion, valor: fmt(n, d), estado, cumple: estado === "cumple" };
}

/** Criterios de la revisión §3.6, más "ningún error". */
export function evaluarBanco(casos: readonly CasoBanco[], requisitos: Requisitos = REQUISITOS_MINIMOS): InformeBanco {
  const problemas = validarBanco(casos, requisitos);
  if (problemas.length > 0) {
    const noEvaluable = (id: string, descripcion: string): Criterio =>
      ({ id, descripcion, valor: "banco inválido", estado: "no_evaluable", cumple: false });
    return {
      evaluable: false, problemas, resultados: [], porCategoria: [],
      criterios: [
        noEvaluable("C0", "Ningún caso termina en error"),
        noEvaluable("C1", "0 enlaces o contactos claros sin detectar"),
        noEvaluable("C2", "≥ 95 % de variantes ofuscadas detectadas"),
        noEvaluable("C3", "≤ 2 % de reseñas legítimas rechazadas"),
        noEvaluable("C4", "≤ 5 % de reseñas legítimas retenidas"),
      ],
    };
  }

  const resultados = casos.map(evaluarCaso);
  const errores = resultados.filter((r) => r.error).length;
  const claros = resultados.filter((r) => r.caso.grupo === "abuso" && r.caso.claro);
  const ofuscadas = resultados.filter((r) => r.caso.grupo === "abuso" && r.caso.variante === "ofuscada");
  const legitimas = resultados.filter((r) => r.caso.grupo === "legitima" && r.caso.tipo === "resena");
  const nombresLegitimos = resultados.filter((r) => r.caso.grupo === "legitima" && r.caso.tipo === "nombre");
  const rechazada = (r: ResultadoCaso) => r.decision.resultado === "rechazo_contenido" || r.decision.resultado === "rechazo_formato";

  const criterios: Criterio[] = [
    criterio("C0", "Ningún caso termina en error", errores, resultados.length, (n) => n === 0),
    // Un claro con error tampoco se detectó: cuenta como no detectado (y además en C0).
    criterio("C1", "0 enlaces o contactos claros sin detectar", claros.filter((r) => !r.detectado).length, claros.length, (n) => n === 0),
    criterio("C2", "≥ 95 % de variantes ofuscadas detectadas", ofuscadas.filter((r) => r.detectado).length, ofuscadas.length, (n, d) => 100 * n >= 95 * d),
    criterio("C3", "≤ 2 % de reseñas legítimas rechazadas", legitimas.filter(rechazada).length, legitimas.length, (n, d) => 100 * n <= 2 * d),
    criterio("C4", "≤ 5 % de reseñas legítimas retenidas", legitimas.filter((r) => r.decision.resultado === "retener").length, legitimas.length, (n, d) => 100 * n <= 5 * d),
    { ...criterio("N1", "Nombres legítimos frenados (informativo, sin umbral en la revisión)", nombresLegitimos.filter((r) => r.detectado).length, nombresLegitimos.length, () => true) },
  ];

  const mapa = new Map<string, { total: number; coinciden: number; detectados: number; errores: number }>();
  for (const r of resultados) {
    const clave = `${r.caso.tipo}/${r.caso.grupo}/${r.caso.categoria}`;
    const v = mapa.get(clave) ?? { total: 0, coinciden: 0, detectados: 0, errores: 0 };
    v.total++;
    if (r.coincide) v.coinciden++;
    if (r.detectado) v.detectados++;
    if (r.error) v.errores++;
    mapa.set(clave, v);
  }
  const porCategoria = [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([clave, v]) => ({ clave, ...v }));
  return { evaluable: true, problemas: [], resultados, criterios, porCategoria };
}
