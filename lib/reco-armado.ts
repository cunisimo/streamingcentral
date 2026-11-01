// El armado de "Elegidas para vos" entre la red y la red: juntar candidatos,
// filtrarlos, elegir la ventana a enriquecer y elegir las tarjetas finales.
//
// Vive aparte de `lib/reco.ts` (server-only, con red) para que el MISMO código
// corra en la ruta y en el harness de candidatos fijos
// (`scripts/reco-harness/`), que compara etapas sobre datos congelados.
import type { MediaType, UITitle } from "./types";
import type { RawTitle } from "./tmdb";
import { clave, mezclarTipos, type Senal } from "./reco-mezcla";
import {
  coincidencia, componentes, esAnime, mejorRespaldo, ordenarTurnosPonderados, permiteAnime, puntaje,
  type Candidato, type Respaldo,
} from "./reco-puntaje";
import { esAnimacion, esInfantil, PISO_FINAL, seleccionarTarjetas, type Tarjeta } from "./reco-seleccion";

// Cuántos candidatos se enriquecen. Ver el comentario largo en lib/reco.ts: 80
// sale de medirlo. Se puede pisar por entorno SÓLO para medir.
export const VENTANA = Number(process.env.RECO_VENTANA) || 80;
export const OBJETIVO = 20;
export const OBJETIVO_POR_TIPO = 10;
// Debajo de esto el riel NO se muestra. Con el selector nuevo se mide sobre los
// ELEGIBLES (decisión D1), no sobre lo que dejan los cupos.
export const PISO = PISO_FINAL;

export interface Recomendacion extends UITitle {
  porque: { id: number; tipo: MediaType; titulo: string };
  camino: "mismo" | "cruce";
  apoyos: number;
}

export type MotivoSinRiel =
  | "sin-sesion" | "sin-senales" | "sin-plataformas" | "sin-candidatos" | "filtrado";

export interface PerfilArmado {
  titulo: string;
  generosPropios: number[];
  generosOpuesto: number[];
  idioma: string;
}

export interface OrigenArmado {
  origen: Senal;
  perfil: PerfilArmado;
  mismos: RawTitle[];
  cruzados: RawTitle[];
}

export interface Cand {
  tipo: MediaType; raw: RawTitle; apoyos: number; respaldo: Respaldo;
}

// Qué cambia entre el algoritmo anterior y el nuevo. Son las etapas del plan,
// y el harness las prende de a una para medir cada una contra la anterior.
export interface OpcionesArmado {
  guardInfantil: boolean;
  selector: "mezcla" | "dosPasadas";
}

export const OPCIONES_ANTERIORES: OpcionesArmado = { guardInfantil: false, selector: "mezcla" };
export const OPCIONES_NUEVAS: OpcionesArmado = { guardInfantil: true, selector: "dosPasadas" };

const otro = (t: MediaType): MediaType => (t === "movie" ? "tv" : "movie");
const claveOrigen = (o: Senal) => clave(o.tipo, o.id);
export const origenEsInfantil = (o: OrigenArmado) => esInfantil(o.origen.tipo, o.perfil.generosPropios);
export const origenEsAnimado = (o: OrigenArmado) => esAnimacion(o.perfil.generosPropios);

export const comoCandidato = (c: Cand): Candidato => ({
  tipo: c.tipo, id: c.raw.id, apoyos: c.apoyos, respaldo: c.respaldo,
  generos: c.raw.genre_ids ?? [], idioma: c.raw.original_language ?? "",
});

// Junta los candidatos de todos los orígenes, con su mejor respaldo, y aplica
// las reglas duras que no dependen de plataformas: exclusiones, señales, guard
// de anime y —con `guardInfantil`— guard infantil.
export function juntarCandidatos(
  porOrigen: OrigenArmado[], excluir: Iterable<string>, senales: Senal[], op: OpcionesArmado,
): { vivos: Cand[]; conAnime: boolean; conInfantil: boolean } {
  const porClave = new Map<string, Cand>();
  const sumar = (tipo: MediaType, raw: RawTitle, camino: "mismo" | "cruce", o: OrigenArmado, pos: number) => {
    const k = clave(tipo, raw.id);
    const esperados = camino === "mismo" ? o.perfil.generosPropios : o.perfil.generosOpuesto;
    const respaldo: Respaldo = {
      origenId: o.origen.id, origenTipo: o.origen.tipo, origenTitulo: o.perfil.titulo,
      fuerza: o.origen.peso, camino, pos,
      tema: coincidencia(raw.genre_ids ?? [], esperados),
    };
    const ya = porClave.get(k);
    if (ya) { ya.apoyos++; ya.respaldo = mejorRespaldo(ya.respaldo, respaldo); return; }
    porClave.set(k, { tipo, raw, apoyos: 1, respaldo });
  };
  for (const o of porOrigen) {
    o.mismos.forEach((r, i) => sumar(o.origen.tipo, r, "mismo", o, i + 1));
    o.cruzados.forEach((r, i) => sumar(otro(o.origen.tipo), r, "cruce", o, i + 1));
  }

  // Las señales SIEMPRE se excluyen, además de venir en `excluir`: un invariante
  // del riel no puede depender de que el cliente se acuerde (ver lib/reco.ts).
  const excluidos = new Set([...excluir, ...senales.map((s) => clave(s.tipo, s.id))]);
  let vivos = [...porClave.values()].filter((c) => !excluidos.has(clave(c.tipo, c.raw.id)));

  const conAnime = permiteAnime(porOrigen.map((o) => ({ generos: o.perfil.generosPropios, idioma: o.perfil.idioma })));
  if (!conAnime) {
    vivos = vivos.filter((c) => !esAnime({ generos: c.raw.genre_ids ?? [], idioma: c.raw.original_language ?? "" }));
  }
  // GUARD INFANTIL: regla DURA mientras ningún origen sea infantil. Sobre los
  // géneros crudos, que ya vienen en el candidato: cero llamadas.
  const conInfantil = porOrigen.some(origenEsInfantil);
  if (op.guardInfantil && !conInfantil) {
    vivos = vivos.filter((c) => !esInfantil(c.tipo, c.raw.genre_ids));
  }
  return { vivos, conAnime, conInfantil };
}

// Los que se enriquecen: los VENTANA mejores, ordenados ANTES de cortar.
export function ventanaDeEnriquecido(vivos: Cand[], tam = VENTANA): Cand[] {
  return ordenarTurnosPonderados(vivos, comoCandidato).slice(0, tam);
}

export interface Enriquecido extends Recomendacion { _cand: Cand }

export interface InfoSeleccion {
  elegibles: number;
  conCupos: number;
  completados: number;
  cupos: { origen: number; animacion: number; infantil: number } | null;
}

// Las tarjetas finales, a partir de lo que sobrevivió al filtro de plataformas.
export function seleccionFinal(
  enriquecidos: Enriquecido[], porOrigen: OrigenArmado[], op: OpcionesArmado,
): { items: Recomendacion[]; motivo?: MotivoSinRiel; info: InfoSeleccion } {
  const quitar = ({ _cand, ...t }: Enriquecido) => t as Recomendacion;

  if (op.selector === "mezcla") {
    // El algoritmo anterior, sin cambios: turnos ponderados + 10/10 alternado,
    // y el piso sobre lo que quedó.
    const reordenados = ordenarTurnosPonderados(enriquecidos, (t) => comoCandidato(t._cand)).map(quitar);
    const items = mezclarTipos(reordenados, OBJETIVO, OBJETIVO_POR_TIPO);
    const info: InfoSeleccion = { elegibles: enriquecidos.length, conCupos: items.length, completados: 0, cupos: null };
    if (items.length < PISO) return { items: [], motivo: "filtrado", info };
    return { items, info };
  }

  // Selector en dos pasadas (§3 del plan). El piso se mide sobre los ELEGIBLES.
  const info0: InfoSeleccion = { elegibles: enriquecidos.length, conCupos: 0, completados: 0, cupos: null };
  if (enriquecidos.length < PISO) return { items: [], motivo: "filtrado", info: info0 };

  const productivos = new Set(enriquecidos.map((e) => `${e._cand.respaldo.origenTipo}:${e._cand.respaldo.origenId}`));
  const origenes = porOrigen.filter((o) => productivos.has(claveOrigen(o.origen)));
  const tarjetas: (Tarjeta & { e: Enriquecido })[] = enriquecidos.map((e) => ({
    type: e.type, id: e.id,
    origen: `${e._cand.respaldo.origenTipo}:${e._cand.respaldo.origenId}`,
    puntaje: puntaje(comoCandidato(e._cand)),
    animacion: esAnimacion(e._cand.raw.genre_ids),
    infantil: esInfantil(e._cand.tipo, e._cand.raw.genre_ids),
    e,
  }));
  const r = seleccionarTarjetas(tarjetas, {
    origenesAnimados: origenes.filter(origenEsAnimado).length,
    origenesInfantiles: origenes.filter(origenEsInfantil).length,
  });
  return {
    items: r.items.map((t) => quitar(t.e)),
    info: { elegibles: enriquecidos.length, conCupos: r.conCupos, completados: r.completados, cupos: r.cupos },
  };
}

// Para la auditoría por log (RECO_LOG=1): títulos del catálogo, nada personal.
export function lineaAuditoria(etiqueta: string, c: Cand): string {
  const k = componentes(comoCandidato(c));
  return `[reco:${etiqueta}] ${clave(c.tipo, c.raw.id).padEnd(12)} ` +
    `${(c.raw.title || c.raw.name || "").slice(0, 26).padEnd(26)} ` +
    `origen=${c.respaldo.origenTitulo.slice(0, 16).padEnd(16)} camino=${c.respaldo.camino.padEnd(6)} ` +
    `fuerza=${c.respaldo.fuerza} apoyos=${c.apoyos} tema=${k.tema.toFixed(2)} ` +
    `posTMDB=${String(c.respaldo.pos).padStart(2)} total=${k.total.toFixed(3)}`;
}
