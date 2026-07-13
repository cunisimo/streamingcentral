"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { user, profile, ready } = useAuth();
  const isLogin = path === "/admin/login";

  useEffect(() => {
    if (!ready || isLogin) return;
    if (!user) { router.replace("/admin/login"); return; }
    if (!profile?.is_admin) { router.replace("/"); }
  }, [ready, isLogin, user, profile, router]);

  if (isLogin) return <>{children}</>;
  if (!ready || !user) return <div className="admin"><p className="loading">Verificando sesión…</p></div>;
  if (!profile?.is_admin) return <div className="admin"><p className="loading">No tenés permisos para esta sección.</p></div>;
  return <>{children}</>;
}
