"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

interface Review { id: string; tmdb_id: number; tipo: string; titulo: string; publicado: boolean; updated_at: string; }

export default function AdminHome() {
  const router = useRouter();
  const [rows, setRows] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabaseBrowser().from("editorial_reviews").select("*").order("updated_at", { ascending: false })
      .then(({ data }) => { setRows((data as Review[]) ?? []); setLoading(false); });
  }, []);

  async function logout() { await supabaseBrowser().auth.signOut(); router.push("/admin/login"); }

  return (
    <div className="admin">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Reseñas editoriales</h1>
        <button className="btn ghost" onClick={logout}>Salir</button>
      </div>
      <p className="section-sub">{loading ? "Cargando…" : `${rows.length} reseña${rows.length !== 1 ? "s" : ""}`}</p>
      <Link className="btn" href="/admin/resena/nueva" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>+ Nueva reseña</Link>
      <div style={{ marginTop: 18 }}>
        {rows.map((r) => (
          <Link key={r.id} href={`/admin/resena/${r.id}`} className="row-item" style={{ textDecoration: "none", color: "inherit" }}>
            <div><div className="ti">{r.titulo}</div><div className="st">{r.tipo === "movie" ? "Película" : "Serie"} · TMDB {r.tmdb_id}</div></div>
            <span className={r.publicado ? "badge-pub" : "badge-draft"}>{r.publicado ? "Publicada" : "Borrador"}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
