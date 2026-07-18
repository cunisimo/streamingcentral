"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import UserShelf from "@/components/UserShelf";
import { useAuth } from "@/components/AuthContext";
import { likedRefs } from "@/lib/userdata";

export default function GustaronPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => { if (ready && !user) router.replace("/cuenta"); }, [ready, user, router]);
  if (!ready || !user) return (<><TopBar /><main><div className="wrap"><p className="loading">Cargando…</p></div></main><BottomNav /></>);
  return (
    <>
      <TopBar />
      <main><div className="wrap">
        <Link href="/cuenta" className="back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Volver</Link>
        <UserShelf title="Me gustaron" load={likedRefs} full
          empty={`Todavía no votaste nada como "ta buena" o "petacular".`} />
      </div></main>
      <BottomNav />
    </>
  );
}
