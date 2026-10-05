"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import MiListaView from "@/components/MiListaView";
import { useAuth } from "@/components/AuthContext";

export default function MiListaPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => { if (ready && !user) router.replace("/cuenta"); }, [ready, user, router]);
  if (!ready || !user) return (<><TopBar /><main><div className="wrap"><p className="loading">Cargando…</p></div></main><BottomNav /></>);
  return (
    <>
      <TopBar />
      <main><div className="wrap">
        <Link href="/cuenta" className="back"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>Volver</Link>
        <MiListaView userId={user.id} />
      </div></main>
      <BottomNav />
    </>
  );
}
