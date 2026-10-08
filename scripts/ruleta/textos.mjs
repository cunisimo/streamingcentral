// Sincroniza `con_texto` del estado con los textos editoriales generados
// (data/copy-ruleta.json). Sin red: generate-copy escribe los textos, pero no
// toca el estado, así que después de cada tanda hay que reflejarlo.
//
// Criterio: tiene texto si el LLM lo conoció y dejó `razon`. Nada más del
// título cambia.

export function sincronizarTextos(estado, filasCopy) {
  const conTexto = new Set(filasCopy.filter((r) => r.conoce && r.razon).map((r) => r.tmdb_id));
  const sig = structuredClone(estado);
  const cambios = { aTrue: 0, aFalse: 0 };
  for (const grupo of [sig.titulos ?? {}, sig.reserva ?? {}]) {
    for (const t of Object.values(grupo)) {
      const ahora = conTexto.has(t.tmdb_id);
      if (!!t.con_texto === ahora) continue;
      t.con_texto = ahora;
      if (ahora) cambios.aTrue++; else cambios.aFalse++;
    }
  }
  return { estado: sig, cambios };
}
