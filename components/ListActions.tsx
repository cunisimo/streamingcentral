"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import { hasItem, setItem, recordView } from "@/lib/userdata";
import type { MediaType } from "@/lib/types";

type Kind = "list" | "watched";

export default function ListActions({ id, tipo }: { id: number; tipo: MediaType }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const [inList, setInList] = useState(false);
  const [watched, setWatched] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || !user) { setInList(false); setWatched(false); return; }
    let alive = true;
    void recordView(user.id, { tmdb_id: id, tipo });
    (async () => {
      const [l, w] = await Promise.all([
        hasItem("list", { tmdb_id: id, tipo }),
        hasItem("watched", { tmdb_id: id, tipo }),
      ]);
      if (alive) { setInList(l); setWatched(w); }
    })();
    return () => { alive = false; };
  }, [ready, user, id, tipo]);

  async function toggle(kind: Kind, cur: boolean, set: (v: boolean) => void) {
    if (!user) { router.push("/cuenta"); return; }
    if (busy) return;
    setBusy(true);
    set(!cur); // optimista
    const { error } = await setItem(user.id, kind, { tmdb_id: id, tipo }, !cur);
    if (error) set(cur); // rollback
    setBusy(false);
  }

  return (
    <>
      <button className={`act ${inList ? "on" : ""}`} onClick={() => toggle("list", inList, setInList)}>
        {inList
          ? <svg className="chk" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          : <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>}
        <span className="lab">Mi lista</span>
      </button>
      <button className={`act ${watched ? "on" : ""}`} onClick={() => toggle("watched", watched, setWatched)}>
        {watched
          ? <svg className="chk" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          : <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>}
        <span className="lab">Ya la vi</span>
      </button>
    </>
  );
}
