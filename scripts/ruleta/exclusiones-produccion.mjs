// SQL de DATOS (para revisión, no se ejecuta acá) que marca como excluidos de
// la ruleta los títulos ya cargados que violan la regla editorial. Requiere la
// migración 010 (columnas excluido_motivo / excluido_at).

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

/** @param lista [{ tmdb_id, titulo, motivo }] */
export function armarSqlExclusiones(lista, { fecha }) {
  const filas = [...lista].sort((a, b) => a.motivo.localeCompare(b.motivo) || a.tmdb_id - b.tmdb_id);
  return [
    `-- Exclusión editorial de la ruleta — ${filas.length} títulos ya cargados (${fecha}).`,
    "-- Requiere supabase/migrations/010_ruleta_exclusiones.sql. Sólo MARCA: no borra filas,",
    "-- no toca textos editoriales ni disponibilidad. Idempotente (no repisa una marca).",
    "",
    "begin;",
    "",
    "update roulette_titles rt set excluido_motivo = v.motivo, excluido_at = now()",
    "from (values",
    // La coma va ANTES del comentario: dentro del comentario no separa filas.
    filas.map((f, i) => `  (${Number(f.tmdb_id)}, ${q(f.motivo)})${i < filas.length - 1 ? "," : ""}  -- ${String(f.titulo).replace(/\n/g, " ")}`).join("\n"),
    ") as v(tmdb_id, motivo)",
    "where rt.tmdb_id = v.tmdb_id and rt.media_type = 'movie' and rt.excluido_motivo is null;",
    "",
    "commit;",
    "",
  ].join("\n");
}

/** Reversión individual: un update por título. */
export function armarSqlReversion(lista) {
  return [...lista]
    .sort((a, b) => a.tmdb_id - b.tmdb_id)
    .map((f) => `-- ${String(f.titulo).replace(/\n/g, " ")} (${f.motivo})\nupdate roulette_titles set excluido_motivo = null, excluido_at = null where tmdb_id = ${Number(f.tmdb_id)} and media_type = 'movie';`)
    .join("\n");
}
