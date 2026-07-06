"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

interface Hit { id: number; tipo: "movie" | "tv"; titulo: string; year: string; }

export default function ResenaEditor({ params }: { params: { id: string } }) {
  const router = useRouter();
  const esNueva = params.id === "nueva";
  const [tmdbId, setTmdbId] = useState<number | null>(null);
  const [tipo, setTipo] = useState<"movie" | "tv">("movie");
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [rating, setRating] = useState<string>("");
  const [publicado, setPublicado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [q, setQ] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (esNueva) return;
    supabaseBrowser().from("editorial_reviews").select("*").eq("id", params.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setTmdbId(data.tmdb_id); setTipo(data.tipo); setTitulo(data.titulo);
        setTexto(data.texto); setRating(data.rating?.toString() ?? ""); setPublicado(data.publicado);
      });
  }, [esNueva, params.id]);

  useEffect(() => {
    if (!esNueva || !q.trim()) { setHits([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch(`/api/admin-search?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((j) => setHits(j.items ?? []));
    }, 300);
  }, [q, esNueva]);

  function pick(h: Hit) { setTmdbId(h.id); setTipo(h.tipo); setTitulo(h.titulo); setHits([]); setQ(""); }

  async function save() {
    if (!tmdbId || !titulo || !texto) { alert("Falta título o texto."); return; }
    setBusy(true);
    const payload = { tmdb_id: tmdbId, tipo, titulo, texto, rating: rating ? Number(rating) : null, publicado, updated_at: new Date().toISOString() };
    const sb = supabaseBrowser();
    const { error } = esNueva
      ? await sb.from("editorial_reviews").insert(payload)
      : await sb.from("editorial_reviews").update(payload).eq("id", params.id);
    setBusy(false);
    if (error) { alert(error.message); return; }
    router.push("/admin");
  }

  async function remove() {
    if (esNueva || !confirm("¿Borrar esta reseña?")) return;
    await supabaseBrowser().from("editorial_reviews").delete().eq("id", params.id);
    router.push("/admin");
  }

  return (
    <div className="admin">
      <button className="back" style={{ background: "none", border: "none", padding: 0, font: "inherit" }} onClick={() => router.push("/admin")}><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Volver</button>
      <h1>{esNueva ? "Nueva reseña" : "Editar reseña"}</h1>

      {esNueva && !tmdbId && (
        <div className="field" style={{ position: "relative" }}>
          <label>Buscá la película o serie (TMDB)</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título…" />
          {hits.length > 0 && (
            <div className="panel" style={{ position: "absolute", left: 0, right: 0, top: 76 }}>
              {hits.map((h) => (
                <div key={`${h.tipo}-${h.id}`} className="prow" onClick={() => pick(h)}>
                  <div className="left">{h.titulo} <span className="cnt">{h.tipo === "movie" ? "Película" : "Serie"} · {h.year}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tmdbId && (
        <>
          <div className="field"><label>Título</label><input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
          <div className="field" style={{ display: "flex", gap: 16 }}>
            <div style={{ flex: 1 }}><label>Tipo</label>
              <select value={tipo} onChange={(e) => setTipo(e.target.value as "movie" | "tv")}>
                <option value="movie">Película</option><option value="tv">Serie</option>
              </select>
            </div>
            <div style={{ width: 140 }}><label>Nota (1–10, opcional)</label><input value={rating} onChange={(e) => setRating(e.target.value)} type="number" min={1} max={10} step="0.1" /></div>
          </div>
          <div className="field"><label>Reseña (texto)</label><textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Tu crítica…" /></div>
          <div className="field" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" style={{ width: 18, height: 18 }} checked={publicado} onChange={(e) => setPublicado(e.target.checked)} />
            <label style={{ margin: 0 }}>Publicada (visible en la app)</label>
          </div>
          <div style={{ marginTop: 22, display: "flex", gap: 12 }}>
            <button className="btn" onClick={save} disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
            {!esNueva && <button className="btn ghost" onClick={remove}>Borrar</button>}
          </div>
        </>
      )}
    </div>
  );
}
