"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { supabaseBrowser } from "@/lib/supabase";
import type { MediaType } from "@/lib/types";

// Voto de la ficha. Solo aparece logueado. Al hacer click se despliega un
// popover con 3 opciones (1=malaso, 2=ta buena, 3=petacular). Re-elegir la
// opción activa borra el voto. Escribe en `votes` (RLS: cada uno los suyos).
const THUMB_UP = ["M7 10v12", "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"];
const THUMB_DOWN = ["M17 14V2", "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"];

const Thumb = ({ down }: { down?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
    {(down ? THUMB_DOWN : THUMB_UP).map((d, i) => <path key={i} d={d} />)}
  </svg>
);

// Icono según la opción de voto (o el placeholder "Me gusta" si no votó).
function VoteIcon({ v }: { v: number | null }) {
  if (v === 1) return <Thumb down />;
  if (v === 3) return <span className="twoup"><Thumb /><Thumb /></span>;
  return <Thumb />; // 2 (ta buena) o sin voto → pulgar arriba
}

const OPTS = [
  { v: 3, lab: "Petacular" },
  { v: 2, lab: "Ta buena" },
  { v: 1, lab: "Malaso" },
] as const;

export default function LikeButton({ id, tipo }: { id: number; tipo: MediaType }) {
  const { user, ready } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  const [vote, setVote] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Cerrar el popover al hacer click afuera.
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  // Cargar el voto propio del título.
  useEffect(() => {
    if (!ready || !user) { setVote(null); return; }
    let alive = true;
    supabaseBrowser()
      .from("votes")
      .select("rating")
      .eq("tmdb_id", id).eq("tipo", tipo).eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => { if (alive) setVote((data?.rating as number) ?? null); });
    return () => { alive = false; };
  }, [ready, user, id, tipo]);

  // El voto es solo para gente logueada.
  if (!ready || !user) return null;

  async function choose(v: number) {
    if (busy || !user) return;
    setBusy(true);
    const sb = supabaseBrowser();
    if (vote === v) {
      await sb.from("votes").delete().eq("tmdb_id", id).eq("tipo", tipo).eq("user_id", user.id);
      setVote(null);
    } else {
      const { error } = await sb.from("votes").upsert(
        { user_id: user.id, tmdb_id: id, tipo, rating: v },
        { onConflict: "user_id,tmdb_id,tipo" },
      );
      if (!error) setVote(v);
    }
    setBusy(false);
    setOpen(false);
  }

  const current = OPTS.find((o) => o.v === vote);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className={`act ${vote ? "on" : ""}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <VoteIcon v={vote} />
        <span className="lab">{current ? current.lab : "Me gusta"}</span>
      </button>
      {open && (
        <div className="votepop" role="menu" onClick={(e) => e.stopPropagation()}>
          {OPTS.map((o) => (
            <button
              key={o.v}
              role="menuitemradio"
              aria-checked={vote === o.v}
              className={`voteopt ${vote === o.v ? "on" : ""}`}
              onClick={() => choose(o.v)}
              disabled={busy}
            >
              <span className="ic"><VoteIcon v={o.v} /></span>
              <span>{o.lab}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
