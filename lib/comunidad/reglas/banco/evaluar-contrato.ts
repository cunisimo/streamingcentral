// Evaluador del contrato de moderación v1 (catálogo v3.2, §3 de la propuesta
// y §5.1/§11 del catálogo). Módulo NUEVO: `evaluar.ts` queda intacto porque
// lo usan, con su huella, los ejecutores históricos de los reservados.
//
// Distingue, por caso:
//   - la salida final (una sola, la más restrictiva);
//   - las familias efectivamente disparadas (tabla familias.ts);
//   - puro (una sola familia incluida) o mixto;
//   - dentro o fuera del catálogo (fuera exige citar una exclusión E1–E9);
//   - autoría independiente o complementaria.
//
// v2 (auditoría de bbb8fc7):
//   A1. TODOS los criterios y mínimos se calculan sólo con casos de autoría
//       INDEPENDIENTE (contactos, señales, legítimas y sensibles). Lo
//       complementario se informa aparte y no completa mínimos ni diluye tasas.
//   A2. Antes de evaluar se valida el esquema completo: largos normalizados
//       como en la aplicación (reseñas 80–600, nombres 2–24 sin saltos),
//       contextos (1 a 3 textos de 80–600, sólo en reseñas) y coherencia.
//       Un rechazo de FORMATO nunca cuenta como detección de contenido.
//
// Criterios (sin cambiar umbrales), sobre lo independiente:
//   C0  ningún error ni rechazo de formato;
//   C1a 0 casos dentro con familia F sin detectar;
//   C2a ≥ 95 % de ofuscadas dentro (F1–F4, S1–S4) detectadas;
//   C3  ≤ 2 % de reseñas legítimas rechazadas;
//   C4  ≤ 5 % de reseñas legítimas retenidas;
//   CS  por familia (H1, H2-R, H2-N, H3), por separado: ≥ 95 % de casos PUROS
//       y dentro en los que se disparó la regla de la propia familia, con su
//       mínimo. Los mixtos no cuentan para el mínimo. El agregado sólo se informa.
// Un banco inválido, incompleto o sin denominador NUNCA aprueba.

import { evaluarNombre, evaluarResena } from "../decision.ts";
import { familiasDisparadas, FAMILIAS, type Familia } from "../familias.ts";
import { LARGO_NOMBRE, LARGO_RESENA, MAX_TEXTOS_RECIENTES } from "../listas.ts";
import { normalizarOriginal } from "../plegado.ts";
import type { ContextoResena, Decision } from "../tipos.ts";

export const VERSION_EVALUADOR_CONTRATO = "2";

export type Exclusion = "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8" | "E9";
const EXCLUSIONES = new Set(["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9"]);
type Autoria = "independiente" | "complementaria";

export interface CasoContrato {
  id: string;
  tipo: "resena" | "nombre";
  grupo: "legitima" | "abuso";
  categoria: string;
  /** Sólo abuso. */
  variante?: "directa" | "ofuscada";
  esperado: "publicar" | "rechazar" | "retener" | "frenar";
  texto: string;
  contexto?: ContextoResena;
  /** Familias incluidas que contiene (vacío en legítimas y en "fuera"). */
  familias: Familia[];
  alcance: "dentro" | "fuera";
  /** Obligatoria si `alcance` es "fuera"; prohibida si es "dentro". */
  exclusion?: Exclusion;
  autoria: Autoria;
}

export interface RequisitosContrato {
  legitimasResena: number;
  nombresLegitimos: number;
  abusoResena: number;
  abusoDentroF: number;
  ofuscadasDentro: number;
  /** Mínimo de casos puros independientes por familia sensible. */
  cs: { H1: number; "H2-R": number; "H2-N": number; H3: number };
}

/**
 * Mínimos POR DEFECTO, todos sobre casos independientes: los de la revisión
 * §3.6 (≥ 150 legítimas y ≥ 150 abusos), los tamaños de contacto y ofuscadas
 * del protocolo del reservado 3 (90 y 72 reseñas), 30 nombres legítimos y los
 * de CS (30, 30, 10, 30). El protocolo del reservado 4 puede subirlos, nunca
 * bajarlos (`evaluarContrato` usa el máximo entre éstos y los que reciba).
 */
export const REQUISITOS_CONTRATO: RequisitosContrato = {
  legitimasResena: 150, nombresLegitimos: 30, abusoResena: 150, abusoDentroF: 90, ofuscadasDentro: 72,
  cs: { H1: 30, "H2-R": 30, "H2-N": 10, H3: 30 },
};

export type Estado = "cumple" | "no_cumple" | "no_evaluable";
export interface CriterioContrato { id: string; descripcion: string; valor: string; estado: Estado }

export interface ResultadoCasoContrato {
  caso: CasoContrato;
  decision: Decision;
  error: boolean;
  /** Rechazo de formato: no es una detección de contenido. */
  formato: boolean;
  /** Detección de CONTENIDO: retención o rechazo de contenido. Ni un error ni un rechazo de formato lo son. */
  detectado: boolean;
  disparadas: Familia[];
  puro: boolean;
}

export interface InformeContrato {
  version: string;
  evaluable: boolean;
  aprobado: boolean;
  problemas: string[];
  /** Criterios sobre lo INDEPENDIENTE: los únicos que deciden. */
  criterios: CriterioContrato[];
  /** Las mismas cuentas sobre lo COMPLEMENTARIO: se informan, nunca cumplen. */
  complementario: CriterioContrato[];
  /** CS agregado independiente (informativo, no compensa familias). */
  csAgregado: string;
  /** Mixtos con familias H: salida final y si se disparó cada H. */
  mixtosSensibles: { id: string; autoria: Autoria; salida: string; familias: Familia[]; disparadas: Familia[] }[];
  fuera: { id: string; autoria: Autoria; exclusion: Exclusion; salida: string }[];
  resultados: ResultadoCasoContrato[];
}

// ---------------------------------------------------------------- validación

const largoResena = (t: string) => [...normalizarOriginal(t)].length;
// Igual que `formato.nombre`: espacios colapsados y sin saltos ni tabulaciones.
const largoNombre = (t: string) => [...normalizarOriginal(t).replace(/\s+/g, " ")].length;

function problemasDeCaso(c: unknown, i: number): string[] {
  if (typeof c !== "object" || c === null || Array.isArray(c)) return [`caso ${i}: no es un objeto`];
  const x = c as Partial<CasoContrato> & Record<string, unknown>;
  const id = typeof x.id === "string" && x.id !== "" ? x.id : `#${i}`;
  const p: string[] = [];
  if (typeof x.id !== "string" || x.id === "") p.push(`caso ${i}: id inválido`);
  if (x.tipo !== "resena" && x.tipo !== "nombre") p.push(`${id}: tipo inválido`);
  if (x.grupo !== "legitima" && x.grupo !== "abuso") p.push(`${id}: grupo inválido`);
  if (typeof x.categoria !== "string" || x.categoria === "") p.push(`${id}: categoría inválida`);
  if (!["publicar", "rechazar", "retener", "frenar"].includes(x.esperado as string)) p.push(`${id}: esperado inválido`);
  if (x.autoria !== "independiente" && x.autoria !== "complementaria") p.push(`${id}: autoría inválida`);
  if (x.alcance !== "dentro" && x.alcance !== "fuera") p.push(`${id}: alcance inválido`);
  // Texto: largo normalizado como en la aplicación.
  if (typeof x.texto !== "string") p.push(`${id}: texto inválido`);
  else if (x.tipo === "resena") {
    const n = largoResena(x.texto);
    if (n < LARGO_RESENA.min || n > LARGO_RESENA.max) p.push(`${id}: reseña de ${n} caracteres normalizados (se exigen ${LARGO_RESENA.min}–${LARGO_RESENA.max})`);
  } else if (x.tipo === "nombre") {
    const n = largoNombre(x.texto);
    if (/[\n\t]/.test(normalizarOriginal(x.texto))) p.push(`${id}: un nombre no puede tener saltos ni tabulaciones`);
    if (n < LARGO_NOMBRE.min || n > LARGO_NOMBRE.max) p.push(`${id}: nombre de ${n} caracteres normalizados (se exigen ${LARGO_NOMBRE.min}–${LARGO_NOMBRE.max})`);
  }
  // Contexto: sólo en reseñas, 1 a MAX_TEXTOS_RECIENTES textos de largo de reseña.
  if (x.contexto !== undefined) {
    const t = (x.contexto as { textosRecientes?: unknown } | null)?.textosRecientes;
    if (x.tipo !== "resena") p.push(`${id}: contexto sólo en reseñas`);
    if (!Array.isArray(t) || t.length < 1 || t.length > MAX_TEXTOS_RECIENTES || !t.every((s) => typeof s === "string")) {
      p.push(`${id}: contexto inválido (1 a ${MAX_TEXTOS_RECIENTES} textos)`);
    } else {
      t.forEach((s, k) => {
        const n = largoResena(s as string);
        if (n < LARGO_RESENA.min || n > LARGO_RESENA.max) p.push(`${id}: contexto ${k} de ${n} caracteres normalizados`);
      });
    }
  }
  // Familias y coherencia.
  if (!Array.isArray(x.familias) || !x.familias.every((f) => FAMILIAS.includes(f))) p.push(`${id}: familias inválidas`);
  else if (new Set(x.familias).size !== x.familias.length) p.push(`${id}: familias repetidas`);
  else {
    if (x.grupo === "legitima") {
      if (x.esperado !== "publicar") p.push(`${id}: una legítima espera "publicar"`);
      if (x.familias.length > 0) p.push(`${id}: una legítima no tiene familias`);
      if (x.variante !== undefined) p.push(`${id}: variante sólo en abuso`);
      if (x.alcance !== "dentro") p.push(`${id}: una legítima va con alcance "dentro"`);
    }
    if (x.grupo === "abuso") {
      if (x.esperado === "publicar") p.push(`${id}: un abuso no espera "publicar"`);
      if (x.variante !== "directa" && x.variante !== "ofuscada") p.push(`${id}: variante inválida`);
      if (x.alcance === "dentro" && x.familias.length === 0) p.push(`${id}: "dentro" exige al menos una familia`);
      if (x.alcance === "fuera" && (x.familias.length > 0 || !EXCLUSIONES.has(x.exclusion as string))) {
        p.push(`${id}: "fuera" exige no tener familias incluidas y citar una exclusión E1–E9`);
      }
    }
    if (x.alcance === "dentro" && x.exclusion !== undefined) p.push(`${id}: una exclusión sólo va en "fuera"`);
  }
  return p;
}

/** Los mínimos efectivos: nunca por debajo de los de REQUISITOS_CONTRATO ni de 1. */
function efectivos(req: RequisitosContrato): RequisitosContrato {
  const m = (a: number, b: number) => Math.max(1, a, b);
  const d = REQUISITOS_CONTRATO;
  return {
    legitimasResena: m(req.legitimasResena, d.legitimasResena),
    nombresLegitimos: m(req.nombresLegitimos, d.nombresLegitimos),
    abusoResena: m(req.abusoResena, d.abusoResena),
    abusoDentroF: m(req.abusoDentroF, d.abusoDentroF),
    ofuscadasDentro: m(req.ofuscadasDentro, d.ofuscadasDentro),
    cs: { H1: m(req.cs.H1, d.cs.H1), "H2-R": m(req.cs["H2-R"], d.cs["H2-R"]), "H2-N": m(req.cs["H2-N"], d.cs["H2-N"]), H3: m(req.cs.H3, d.cs.H3) },
  };
}

export function validarContrato(casos: unknown, req: RequisitosContrato = REQUISITOS_CONTRATO): string[] {
  if (!Array.isArray(casos)) return ["el banco no es una lista"];
  const p = casos.flatMap(problemasDeCaso);
  const ids = new Map<string, number>();
  for (const c of casos) {
    const id = (c as { id?: unknown })?.id;
    if (typeof id === "string") ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  for (const [id, n] of ids) if (n > 1) p.push(`${id}: id repetido ${n} veces`);
  if (p.length > 0) return p;

  const r = efectivos(req);
  // Mínimos SOLO con casos independientes (A1).
  const b = (casos as CasoContrato[]).filter((c) => c.autoria === "independiente");
  const n = (f: (c: CasoContrato) => boolean) => b.filter(f).length;
  const puro = (fam: Familia, tipo: "resena" | "nombre") =>
    n((c) => c.grupo === "abuso" && c.alcance === "dentro" && c.tipo === tipo && c.familias.length === 1 && c.familias[0] === fam);
  const exigidos: [string, number, number][] = [
    ["reseñas legítimas independientes", n((c) => c.grupo === "legitima" && c.tipo === "resena"), r.legitimasResena],
    ["nombres legítimos independientes", n((c) => c.grupo === "legitima" && c.tipo === "nombre"), r.nombresLegitimos],
    ["reseñas de abuso independientes", n((c) => c.grupo === "abuso" && c.tipo === "resena"), r.abusoResena],
    ["abusos dentro con familia F independientes", n((c) => c.grupo === "abuso" && c.alcance === "dentro" && c.familias.some((f) => f.startsWith("F"))), r.abusoDentroF],
    ["ofuscadas dentro independientes", n((c) => c.grupo === "abuso" && c.alcance === "dentro" && c.variante === "ofuscada"), r.ofuscadasDentro],
    ["H1 puros independientes", puro("H1", "resena"), r.cs.H1],
    ["H2 reseñas puras independientes", puro("H2", "resena"), r.cs["H2-R"]],
    ["H2 nombres puros independientes", puro("H2", "nombre"), r.cs["H2-N"]],
    ["H3 puros independientes", puro("H3", "resena"), r.cs.H3],
  ];
  for (const [nombre, hay, min] of exigidos) if (hay < min) p.push(`faltan ${nombre}: hay ${hay}, se exigen al menos ${min}`);
  return p;
}

// ---------------------------------------------------------------- evaluación

export function evaluarCasoContrato(c: CasoContrato): ResultadoCasoContrato {
  const decision = c.tipo === "resena" ? evaluarResena(c.texto, c.contexto ?? { textosRecientes: [] }) : evaluarNombre(c.texto);
  const error = decision.resultado === "error";
  const formato = decision.resultado === "rechazo_formato";
  return {
    caso: c,
    decision,
    error,
    formato,
    detectado: decision.resultado === "retener" || decision.resultado === "rechazo_contenido",
    disparadas: [...familiasDisparadas(decision.disparadas.map((d) => d.regla))],
    puro: c.familias.length === 1,
  };
}

const fmt = (n: number, d: number) => (d === 0 ? "sin denominador" : `${n}/${d} (${((100 * n) / d).toFixed(1)} %)`);
function criterio(id: string, descripcion: string, n: number, d: number, ok: (n: number, d: number) => boolean): CriterioContrato {
  return { id, descripcion, valor: fmt(n, d), estado: d === 0 ? "no_evaluable" : ok(n, d) ? "cumple" : "no_cumple" };
}
const al95 = (n: number, d: number) => 100 * n >= 95 * d;

const SENSIBLES: { id: "H1" | "H2-R" | "H2-N" | "H3"; familia: Familia; tipo: "resena" | "nombre" }[] = [
  { id: "H1", familia: "H1", tipo: "resena" },
  { id: "H2-R", familia: "H2", tipo: "resena" },
  { id: "H2-N", familia: "H2", tipo: "nombre" },
  { id: "H3", familia: "H3", tipo: "resena" },
];

/** Las cuentas de los criterios sobre un subconjunto (independiente o complementario). */
function cuentas(res: ResultadoCasoContrato[], req: RequisitosContrato, conMinimos: boolean): CriterioContrato[] {
  const abusoDentro = res.filter((r) => r.caso.grupo === "abuso" && r.caso.alcance === "dentro");
  const conF = abusoDentro.filter((r) => r.caso.familias.some((f) => f.startsWith("F")));
  const ofus = abusoDentro.filter((r) => r.caso.variante === "ofuscada" && r.caso.familias.some((f) => /^(F|S[1-4])/.test(f)));
  const legit = res.filter((r) => r.caso.grupo === "legitima" && r.caso.tipo === "resena");
  const rechazada = (r: ResultadoCasoContrato) => r.decision.resultado === "rechazo_contenido" || r.decision.resultado === "rechazo_formato";
  const cs = SENSIBLES.map((s) => {
    const puros = abusoDentro.filter((r) => r.puro && r.caso.familias[0] === s.familia && r.caso.tipo === s.tipo);
    const propios = puros.filter((r) => r.disparadas.includes(s.familia) && r.detectado).length;
    const c = criterio(`CS-${s.id}`, `≥ 95 % de ${s.id} puros con disparo de su familia (mínimo ${req.cs[s.id]})`, propios, puros.length, al95);
    return conMinimos && puros.length < req.cs[s.id] ? { ...c, estado: "no_evaluable" as Estado } : c;
  });
  return [
    criterio("C0", "Ningún caso termina en error ni en rechazo de formato", res.filter((r) => r.error || r.formato).length, res.length, (n) => n === 0),
    criterio("C1a", "0 casos dentro con familia F sin detectar", conF.filter((r) => !r.detectado).length, conF.length, (n) => n === 0),
    criterio("C2a", "≥ 95 % de ofuscadas dentro detectadas", ofus.filter((r) => r.detectado).length, ofus.length, al95),
    criterio("C3", "≤ 2 % de reseñas legítimas rechazadas", legit.filter(rechazada).length, legit.length, (n, d) => 100 * n <= 2 * d),
    criterio("C4", "≤ 5 % de reseñas legítimas retenidas", legit.filter((r) => r.decision.resultado === "retener").length, legit.length, (n, d) => 100 * n <= 5 * d),
    ...cs,
  ];
}

export function evaluarContrato(casos: readonly CasoContrato[], req: RequisitosContrato = REQUISITOS_CONTRATO): InformeContrato {
  const problemas = validarContrato(casos, req);
  if (problemas.length > 0) {
    return {
      version: VERSION_EVALUADOR_CONTRATO, evaluable: false, aprobado: false, problemas,
      criterios: ["C0", "C1a", "C2a", "C3", "C4", ...SENSIBLES.map((s) => `CS-${s.id}`)]
        .map((id) => ({ id, descripcion: "", valor: "banco inválido o incompleto", estado: "no_evaluable" as Estado })),
      complementario: [], csAgregado: "banco inválido", mixtosSensibles: [], fuera: [], resultados: [],
    };
  }
  const r = efectivos(req);
  const res = casos.map(evaluarCasoContrato);
  const indep = res.filter((x) => x.caso.autoria === "independiente");
  const comp = res.filter((x) => x.caso.autoria === "complementaria");
  const criterios = cuentas(indep, r, true);
  const complementario = cuentas(comp, r, false).map((c) => ({
    ...c, estado: c.estado === "cumple" ? ("no_evaluable" as Estado) : c.estado,
    descripcion: `${c.descripcion} [complementario: informativo, no cumple el requisito independiente]`,
  }));
  const puroSens = indep.filter((x) => x.caso.grupo === "abuso" && x.caso.alcance === "dentro" && x.puro && x.caso.familias[0].startsWith("H"));
  return {
    version: VERSION_EVALUADOR_CONTRATO,
    evaluable: true,
    aprobado: criterios.every((c) => c.estado === "cumple"),
    problemas: [],
    criterios,
    complementario,
    csAgregado: fmt(puroSens.filter((x) => x.disparadas.includes(x.caso.familias[0]) && x.detectado).length, puroSens.length),
    mixtosSensibles: res
      .filter((x) => x.caso.grupo === "abuso" && x.caso.alcance === "dentro" && !x.puro && x.caso.familias.some((f) => f.startsWith("H")))
      .map((x) => ({ id: x.caso.id, autoria: x.caso.autoria, salida: x.decision.resultado, familias: x.caso.familias, disparadas: x.disparadas })),
    fuera: res.filter((x) => x.caso.alcance === "fuera" && x.caso.grupo === "abuso")
      .map((x) => ({ id: x.caso.id, autoria: x.caso.autoria, exclusion: x.caso.exclusion!, salida: x.decision.resultado })),
    resultados: res,
  };
}
