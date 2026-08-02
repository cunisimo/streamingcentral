"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import { useMyList } from "./MyListContext";
import { hasItem, setItem, recordView } from "@/lib/userdata";
import type { MediaType } from "@/lib/types";

export default function ListActions({ id, tipo }: { id: number; tipo: MediaType }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const list = useMyList();
  const inList = list?.has(id, tipo) ?? false; // "Mi lista" viene del contexto compartido
  const [watched, setWatched] = useState(false);
  const [busyW, setBusyW] = useState(false);

  useEffect(() => {
    if (!ready || !user) { setWatched(false); return; }
    let alive = true;
    void recordView(user.id, { tmdb_id: id, tipo });
    hasItem("watched", { tmdb_id: id, tipo }).then((w) => { if (alive) setWatched(w); });
    return () => { alive = false; };
  }, [ready, user, id, tipo]);

  function toggleList() {
    if (!user) { router.push("/cuenta"); return; }
    void list?.toggle(id, tipo);
  }

  async function toggleWatched() {
    if (!user) { router.push("/cuenta"); return; }
    if (busyW) return;
    setBusyW(true);
    const next = !watched;
    setWatched(next); // optimista
    const { error } = await setItem(user.id, "watched", { tmdb_id: id, tipo }, next);
    if (error) setWatched(!next); // rollback
    setBusyW(false);
  }

  return (
    <>
      <button className={`act ${inList ? "on" : ""}`} onClick={toggleList}>
        {inList
          ? <svg className="chk" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          : <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>}
        <span className="lab">Mi lista</span>
      </button>
      <button className={`act ${watched ? "on" : ""}`} onClick={toggleWatched}>
        {watched
          ? <svg className="chk" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          : <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>}
        <span className="lab">Ya la vi</span>
      </button>
    </>
  );
}
