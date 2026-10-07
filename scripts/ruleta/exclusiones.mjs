// Aplica las reglas editoriales de exclusión al ESTADO, sin consultar nada.
//
// Alcance: los títulos NUEVOS que todavía no se cargaron (carga_pendiente) y
// la reserva. Los que ya están en Producción NO se tocan acá: sacarlos es una
// decisión aparte (y un SQL aparte); sólo se informan.
//
// Lo excluido no se borra: pasa a `excluidos_editoriales` con su motivo y sus
// datos, así la cola no lo vuelve a ofrecer y se puede auditar o revertir.

import { readFileSync, existsSync } from "node:fs";
import { motivoNoServible, esAnime, esStandUp } from "./seleccion.mjs";

const MOTIVOS_EDITORIALES = new Set(["anime", "stand-up", "especial-no-narrativo"]);

/** Lista editorial versionada: data/ruleta-exclusiones.json → Map(id → { motivo, titulo }). */
export function cargarExclusiones(ruta) {
  if (!existsSync(ruta)) return new Map();
  const doc = JSON.parse(readFileSync(ruta, "utf8"));
  return new Map(Object.entries(doc.excluidos ?? {}).map(([id, x]) => [Number(id), x]));
}

/** Motivo editorial de exclusión, o null (las fallas de datos no son editoriales). */
export function motivoEditorial(t, excluidos) {
  const m = motivoNoServible(t, { excluidos });
  return MOTIVOS_EDITORIALES.has(m) ? m : null;
}

export function aplicarExclusiones(estado, { excluidos = new Map(), ahoraIso }) {
  const sig = structuredClone(estado);
  sig.excluidos_editoriales ??= {};
  const pend = new Set(sig.carga_pendiente?.nuevos ?? []);
  const resumen = { nuevos: {}, reserva: {}, yaCargadosQueSonAnime: [], yaCargadosStandUp: [] };
  const excluir = (t, motivo, origen) => {
    sig.excluidos_editoriales[t.tmdb_id] = { motivo, origen, at: ahoraIso, titulo: t };
    (resumen[origen][motivo] ??= []).push(t.tmdb_id);
  };

  for (const [idTxt, t] of Object.entries(sig.titulos)) {
    const id = Number(idTxt);
    if (!pend.has(id)) {
      // Ya cargado: sólo se informa.
      if (esAnime(t)) resumen.yaCargadosQueSonAnime.push(id);
      else if (esStandUp(t)) resumen.yaCargadosStandUp.push(id);
      continue;
    }
    const m = motivoEditorial(t, excluidos);
    if (!m) continue;
    excluir(t, m, "nuevos");
    delete sig.titulos[idTxt];
  }
  for (const [idTxt, t] of Object.entries(sig.reserva ?? {})) {
    const m = motivoEditorial(t, excluidos);
    if (!m) continue;
    excluir(t, m, "reserva");
    delete sig.reserva[idTxt];
  }
  if (sig.carga_pendiente) {
    const quedan = (ids) => (ids ?? []).filter((id) => sig.titulos[id]);
    sig.carga_pendiente = { ...sig.carga_pendiente, nuevos: quedan(sig.carga_pendiente.nuevos), disponibilidad: quedan(sig.carga_pendiente.disponibilidad) };
  }
  return { estado: sig, resumen };
}
