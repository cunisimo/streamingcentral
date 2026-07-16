"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import { supabaseBrowser } from "@/lib/supabase";
import type { MediaType } from "@/lib/types";

// Botón de "me gusta" de la ficha. Escribe/borra una fila en `votes`
// (RLS: cada uno gestiona los suyos). El total sale de la RPC title_votes.
// Sin sesión, manda a /cuenta a ingresar.
export default function LikeButton({ id, tipo }: { id: number; tipo: MediaType }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Total público de likes del título.
  useEffect(() => {
    let alive = true;
    supabaseBrowser()
      .rpc("title_votes", { p_tmdb_id: id, p_tipo: tipo })
      .then(({ data }) => {
        if (!alive || data == null) return;
        const n = Number(data);
        if (Number.isFinite(n)) setCount(n);
      });
    return () => { alive = false; };
  }, [id, tipo]);

  // ¿El usuario actual ya dio like?
  useEffect(() => {
    if (!ready) return;
    if (!user) { setLiked(false); return; }
    let alive = true;
    supabaseBrowser()
      .from("votes")
      .select("id")
      .eq("tmdb_id", id).eq("tipo", tipo).eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => { if (alive) setLiked(!!data); });
    return () => { alive = false; };
  }, [ready, user, id, tipo]);

  async function toggle() {
    if (!user) { router.push("/cuenta"); return; }
    if (busy) return;
    setBusy(true);
    const sb = supabaseBrowser();
    if (liked) {
      const { error } = await sb.from("votes").delete()
        .eq("tmdb_id", id).eq("tipo", tipo).eq("user_id", user.id);
      if (!error) { setLiked(false); setCount((c) => (c != null ? Math.max(0, c - 1) : c)); }
    } else {
      const { error } = await sb.from("votes").insert({ tmdb_id: id, tipo, user_id: user.id });
      if (!error) { setLiked(true); setCount((c) => (c != null ? c + 1 : 1)); }
    }
    setBusy(false);
  }

  return (
    <button className={`act ${liked ? "on" : ""}`} onClick={toggle} disabled={busy} aria-pressed={liked}>
      <svg viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 10v11M7 10l4-7c1.5 0 2.5 1 2.5 2.5L13 10h5.5c1.1 0 2 1 1.8 2.1l-1.3 7c-.2 1-1 1.9-2 1.9H7" />
      </svg>
      <span className="lab">{count ? `Me gusta · ${count}` : "Me gusta"}</span>
    </button>
  );
}
