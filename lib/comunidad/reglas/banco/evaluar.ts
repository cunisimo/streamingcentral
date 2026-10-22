// Evaluación de un banco de casos sintéticos contra las reglas, con
// resultado por caso, por categoría y los criterios de la revisión §3.6. Lo
// usan el test del banco de desarrollo y el corredor del reservado.
//
// Mide REGLAS CONTRA CASOS CONOCIDOS. No mide eficacia contra abuso real ni
// contra variantes que el banco no tiene.

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

export interface ResultadoCaso {
  caso: CasoBanco;
  decision: Decision;
  /** No se publicó (cualquier rechazo, retención o error). */
  frenado: boolean;
  /** El resultado es el esperado. */
  coincide: boolean;
}

export interface Criterio {
  id: string;
  descripcion: string;
  valor: string;
  cumple: boolean;
}

export interface InformeBanco {
  resultados: ResultadoCaso[];
  criterios: Criterio[];
  porCategoria: { clave: string; total: number; coinciden: number; frenados: number }[];
}

function coincide(esperado: Esperado, d: Decision): boolean {
  switch (esperado) {
    case "publicar": return d.resultado === "publicar";
    case "rechazar": return d.resultado === "rechazo_contenido" || d.resultado === "rechazo_formato";
    case "retener": return d.resultado === "retener";
    case "frenar": return d.resultado !== "publicar" && d.resultado !== "error";
  }
}

export function evaluarCaso(c: CasoBanco): ResultadoCaso {
  const decision = c.tipo === "resena"
    ? evaluarResena(c.texto, c.contexto ?? { textosRecientes: [] })
    : evaluarNombre(c.texto);
  return { caso: c, decision, frenado: decision.resultado !== "publicar", coincide: coincide(c.esperado, decision) };
}

const pct = (n: number, d: number) => (d === 0 ? 0 : (100 * n) / d);
const fmt = (n: number, d: number) => `${n}/${d} (${pct(n, d).toFixed(1)} %)`;

/** Criterios de la revisión §3.6, más "ningún error". */
export function evaluarBanco(casos: readonly CasoBanco[]): InformeBanco {
  const resultados = casos.map(evaluarCaso);
  const errores = resultados.filter((r) => r.decision.resultado === "error");
  const claros = resultados.filter((r) => r.caso.grupo === "abuso" && r.caso.claro);
  const clarosPublicados = claros.filter((r) => !r.frenado);
  const ofuscadas = resultados.filter((r) => r.caso.grupo === "abuso" && r.caso.variante === "ofuscada");
  const ofuscadasFrenadas = ofuscadas.filter((r) => r.frenado);
  const legitimas = resultados.filter((r) => r.caso.grupo === "legitima" && r.caso.tipo === "resena");
  const rechazadas = legitimas.filter((r) => r.decision.resultado === "rechazo_contenido" || r.decision.resultado === "rechazo_formato");
  const retenidas = legitimas.filter((r) => r.decision.resultado === "retener");
  const nombresLegitimos = resultados.filter((r) => r.caso.grupo === "legitima" && r.caso.tipo === "nombre");
  const nombresFrenados = nombresLegitimos.filter((r) => r.frenado);

  const criterios: Criterio[] = [
    { id: "C0", descripcion: "Ningún caso termina en error", valor: `${errores.length}`, cumple: errores.length === 0 },
    { id: "C1", descripcion: "0 enlaces o contactos claros publicados", valor: fmt(clarosPublicados.length, claros.length), cumple: clarosPublicados.length === 0 },
    { id: "C2", descripcion: "≥ 95 % de variantes ofuscadas frenadas", valor: fmt(ofuscadasFrenadas.length, ofuscadas.length), cumple: pct(ofuscadasFrenadas.length, ofuscadas.length) >= 95 },
    { id: "C3", descripcion: "≤ 2 % de reseñas legítimas rechazadas", valor: fmt(rechazadas.length, legitimas.length), cumple: pct(rechazadas.length, legitimas.length) <= 2 },
    { id: "C4", descripcion: "≤ 5 % de reseñas legítimas retenidas", valor: fmt(retenidas.length, legitimas.length), cumple: pct(retenidas.length, legitimas.length) <= 5 },
    { id: "N1", descripcion: "Nombres legítimos frenados (informativo, sin umbral en la revisión)", valor: fmt(nombresFrenados.length, nombresLegitimos.length), cumple: true },
  ];

  const mapa = new Map<string, { total: number; coinciden: number; frenados: number }>();
  for (const r of resultados) {
    const clave = `${r.caso.tipo}/${r.caso.grupo}/${r.caso.categoria}`;
    const v = mapa.get(clave) ?? { total: 0, coinciden: 0, frenados: 0 };
    v.total++;
    if (r.coincide) v.coinciden++;
    if (r.frenado) v.frenados++;
    mapa.set(clave, v);
  }
  const porCategoria = [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([clave, v]) => ({ clave, ...v }));
  return { resultados, criterios, porCategoria };
}
