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
// Criterios (sin cambiar umbrales):
//   C0  ningún error;
//   C1a 0 casos dentro con familia F sin detectar;
//   C2a ≥ 95 % de ofuscadas dentro (F1–F4, S1–S4) detectadas;
//   C3  ≤ 2 % de reseñas legítimas rechazadas;
//   C4  ≤ 5 % de reseñas legítimas retenidas;
//   CS  por familia, H1, H2-R (reseñas), H2-N (nombres), H3, por separado:
//       ≥ 95 % de casos PUROS, dentro y de autoría INDEPENDIENTE en los que
//       se disparó la regla de la propia familia, con su mínimo de casos.
//       Los mixtos no cuentan para el mínimo. El agregado sólo se informa.
// Un banco inválido, incompleto o sin denominador NUNCA aprueba.

import { evaluarNombre, evaluarResena } from "../decision.ts";
import { familiasDisparadas, FAMILIAS, type Familia } from "../familias.ts";
import type { ContextoResena, Decision } from "../tipos.ts";

export const VERSION_EVALUADOR_CONTRATO = "1";

export type Exclusion = "E1" | "E2" | "E3" | "E4" | "E5" | "E6" | "E7" | "E8" | "E9";
const EXCLUSIONES = new Set(["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9"]);

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
  /** Obligatoria si `alcance` es "fuera". */
  exclusion?: Exclusion;
  autoria: "independiente" | "complementaria";
}

export interface RequisitosContrato {
  legitimasResena: number;
  abusoDentroF: number;
  ofuscadasDentro: number;
  /** Mínimo de casos puros independientes por familia sensible. */
  cs: { H1: number; "H2-R": number; "H2-N": number; H3: number };
}

/** Mínimos del contrato (propuesta §3: 30, 30, 10, 30). */
export const REQUISITOS_CONTRATO: RequisitosContrato = {
  legitimasResena: 1, abusoDentroF: 1, ofuscadasDentro: 1, cs: { H1: 30, "H2-R": 30, "H2-N": 10, H3: 30 },
};

export type Estado = "cumple" | "no_cumple" | "no_evaluable";
export interface CriterioContrato { id: string; descripcion: string; valor: string; estado: Estado }

export interface ResultadoCasoContrato {
  caso: CasoContrato;
  decision: Decision;
  error: boolean;
  /** No se publicó (rechazo o retención). Un error no es una detección. */
  detectado: boolean;
  disparadas: Familia[];
  puro: boolean;
}

export interface InformeContrato {
  version: string;
  evaluable: boolean;
  aprobado: boolean;
  problemas: string[];
  criterios: CriterioContrato[];
  /** CS de autoría complementaria: se informa, nunca cumple el requisito independiente. */
  csComplementario: CriterioContrato[];
  /** CS agregado (informativo, no compensa familias). */
  csAgregado: string;
  /** Mixtos con familias H: salida final y si se disparó cada H. */
  mixtosSensibles: { id: string; salida: string; familias: Familia[]; disparadas: Familia[] }[];
  fuera: { id: string; exclusion: Exclusion; salida: string }[];
  resultados: ResultadoCasoContrato[];
}

// ---------------------------------------------------------------- validación

export function validarContrato(casos: unknown, req: RequisitosContrato = REQUISITOS_CONTRATO): string[] {
  if (!Array.isArray(casos)) return ["el banco no es una lista"];
  const p: string[] = [];
  const ids = new Set<string>();
  for (const [i, c] of casos.entries()) {
    const x = c as Partial<CasoContrato>;
    const id = typeof x?.id === "string" && x.id ? x.id : `#${i}`;
    if (!x || typeof x !== "object") { p.push(`caso ${i}: no es un objeto`); continue; }
    if (ids.has(id)) p.push(`${id}: id repetido`);
    ids.add(id);
    if (x.tipo !== "resena" && x.tipo !== "nombre") p.push(`${id}: tipo inválido`);
    if (x.grupo !== "legitima" && x.grupo !== "abuso") p.push(`${id}: grupo inválido`);
    if (typeof x.texto !== "string") p.push(`${id}: texto inválido`);
    if (!["publicar", "rechazar", "retener", "frenar"].includes(x.esperado as string)) p.push(`${id}: esperado inválido`);
    if (x.autoria !== "independiente" && x.autoria !== "complementaria") p.push(`${id}: autoría inválida`);
    if (!Array.isArray(x.familias) || !x.familias.every((f) => FAMILIAS.includes(f))) { p.push(`${id}: familias inválidas`); continue; }
    if (x.grupo === "legitima") {
      if (x.esperado !== "publicar") p.push(`${id}: una legítima espera "publicar"`);
      if (x.familias.length > 0) p.push(`${id}: una legítima no tiene familias`);
    }
    if (x.grupo === "abuso") {
      if (x.esperado === "publicar") p.push(`${id}: un abuso no espera "publicar"`);
      if (x.variante !== "directa" && x.variante !== "ofuscada") p.push(`${id}: variante inválida`);
      if (x.alcance === "dentro" && x.familias.length === 0) p.push(`${id}: "dentro" exige al menos una familia`);
      if (x.alcance === "fuera" && (x.familias.length > 0 || !EXCLUSIONES.has(x.exclusion as string))) {
        p.push(`${id}: "fuera" exige no tener familias incluidas y citar una exclusión E1–E9`);
      }
      if (x.alcance !== "dentro" && x.alcance !== "fuera") p.push(`${id}: alcance inválido`);
    }
  }
  if (p.length > 0) return p;
  const b = casos as CasoContrato[];
  const n = (f: (c: CasoContrato) => boolean) => b.filter(f).length;
  const puroIndep = (fam: Familia, tipo: "resena" | "nombre") =>
    n((c) => c.grupo === "abuso" && c.alcance === "dentro" && c.autoria === "independiente" && c.tipo === tipo && c.familias.length === 1 && c.familias[0] === fam);
  const exigidos: [string, number, number][] = [
    ["reseñas legítimas", n((c) => c.grupo === "legitima" && c.tipo === "resena"), req.legitimasResena],
    ["abusos dentro con familia F", n((c) => c.grupo === "abuso" && c.alcance === "dentro" && c.familias.some((f) => f.startsWith("F"))), req.abusoDentroF],
    ["ofuscadas dentro", n((c) => c.grupo === "abuso" && c.alcance === "dentro" && c.variante === "ofuscada"), req.ofuscadasDentro],
    ["H1 puros independientes", puroIndep("H1", "resena"), req.cs.H1],
    ["H2 reseñas puras independientes", puroIndep("H2", "resena"), req.cs["H2-R"]],
    ["H2 nombres puros independientes", puroIndep("H2", "nombre"), req.cs["H2-N"]],
    ["H3 puros independientes", puroIndep("H3", "resena"), req.cs.H3],
  ];
  for (const [nombre, hay, min] of exigidos) {
    if (hay < Math.max(1, min)) p.push(`faltan ${nombre}: hay ${hay}, se exigen al menos ${Math.max(1, min)}`);
  }
  return p;
}

// ---------------------------------------------------------------- evaluación

export function evaluarCasoContrato(c: CasoContrato): ResultadoCasoContrato {
  const decision = c.tipo === "resena" ? evaluarResena(c.texto, c.contexto ?? { textosRecientes: [] }) : evaluarNombre(c.texto);
  const error = decision.resultado === "error";
  return {
    caso: c,
    decision,
    error,
    detectado: !error && decision.resultado !== "publicar",
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

export function evaluarContrato(casos: readonly CasoContrato[], req: RequisitosContrato = REQUISITOS_CONTRATO): InformeContrato {
  const problemas = validarContrato(casos, req);
  const vacio = (id: string, descripcion: string): CriterioContrato => ({ id, descripcion, valor: "banco inválido o incompleto", estado: "no_evaluable" });
  const nombresCriterios: [string, string][] = [
    ["C0", "Ningún caso termina en error"],
    ["C1a", "0 casos dentro con familia F sin detectar"],
    ["C2a", "≥ 95 % de ofuscadas dentro detectadas"],
    ["C3", "≤ 2 % de reseñas legítimas rechazadas"],
    ["C4", "≤ 5 % de reseñas legítimas retenidas"],
    ...SENSIBLES.map((s): [string, string] => [`CS-${s.id}`, `≥ 95 % de ${s.id} puros independientes con disparo de su familia (mínimo ${req.cs[s.id]})`]),
  ];
  if (problemas.length > 0) {
    return {
      version: VERSION_EVALUADOR_CONTRATO, evaluable: false, aprobado: false, problemas,
      criterios: nombresCriterios.map(([id, d]) => vacio(id, d)), csComplementario: [], csAgregado: "banco inválido",
      mixtosSensibles: [], fuera: [], resultados: [],
    };
  }

  const res = casos.map(evaluarCasoContrato);
  const abusoDentro = res.filter((r) => r.caso.grupo === "abuso" && r.caso.alcance === "dentro");
  const conF = abusoDentro.filter((r) => r.caso.familias.some((f) => f.startsWith("F")));
  const ofus = abusoDentro.filter((r) => r.caso.variante === "ofuscada" && r.caso.familias.some((f) => /^(F|S[1-4])/.test(f)));
  const legit = res.filter((r) => r.caso.grupo === "legitima" && r.caso.tipo === "resena");
  const rechazada = (r: ResultadoCasoContrato) => r.decision.resultado === "rechazo_contenido" || r.decision.resultado === "rechazo_formato";

  const cs = (autoria: "independiente" | "complementaria") => SENSIBLES.map((s) => {
    const puros = abusoDentro.filter((r) => r.puro && r.caso.familias[0] === s.familia && r.caso.tipo === s.tipo && r.caso.autoria === autoria);
    const propios = puros.filter((r) => r.disparadas.includes(s.familia)).length;
    const c = criterio(`CS-${s.id}`, `${s.id} puros ${autoria}s con disparo de su familia`, propios, puros.length, al95);
    // El mínimo es parte del criterio: con menos casos, no es evaluable.
    if (autoria === "independiente" && puros.length < req.cs[s.id]) return { ...c, estado: "no_evaluable" as Estado };
    return c;
  });
  const csIndep = cs("independiente");
  const csComp = cs("complementaria").map((c) => ({ ...c, estado: c.estado === "cumple" ? ("no_evaluable" as Estado) : c.estado, descripcion: `${c.descripcion} (complementario: no cumple el requisito independiente)` }));

  const criterios: CriterioContrato[] = [
    criterio("C0", "Ningún caso termina en error", res.filter((r) => r.error).length, res.length, (n) => n === 0),
    criterio("C1a", "0 casos dentro con familia F sin detectar", conF.filter((r) => !r.detectado).length, conF.length, (n) => n === 0),
    criterio("C2a", "≥ 95 % de ofuscadas dentro detectadas", ofus.filter((r) => r.detectado).length, ofus.length, al95),
    criterio("C3", "≤ 2 % de reseñas legítimas rechazadas", legit.filter(rechazada).length, legit.length, (n, d) => 100 * n <= 2 * d),
    criterio("C4", "≤ 5 % de reseñas legítimas retenidas", legit.filter((r) => r.decision.resultado === "retener").length, legit.length, (n, d) => 100 * n <= 5 * d),
    ...csIndep,
  ];

  const puroSens = abusoDentro.filter((r) => r.puro && r.caso.familias[0].startsWith("H"));
  const agregado = fmt(puroSens.filter((r) => r.disparadas.includes(r.caso.familias[0])).length, puroSens.length);

  return {
    version: VERSION_EVALUADOR_CONTRATO,
    evaluable: true,
    aprobado: criterios.every((c) => c.estado === "cumple"),
    problemas: [],
    criterios,
    csComplementario: csComp,
    csAgregado: agregado,
    mixtosSensibles: abusoDentro
      .filter((r) => !r.puro && r.caso.familias.some((f) => f.startsWith("H")))
      .map((r) => ({ id: r.caso.id, salida: r.decision.resultado, familias: r.caso.familias, disparadas: r.disparadas })),
    fuera: res.filter((r) => r.caso.alcance === "fuera" && r.caso.grupo === "abuso")
      .map((r) => ({ id: r.caso.id, exclusion: r.caso.exclusion!, salida: r.decision.resultado })),
    resultados: res,
  };
}
