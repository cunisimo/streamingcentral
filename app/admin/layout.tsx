"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { supabaseBrowser } from "@/lib/supabase";
import { useAdminSesion } from "@/components/admin/useAdminSesion";

// 🔴 ESTE GUARD ES SÓLO EXPERIENCIA DE USUARIO, y conviene tenerlo claro antes
// de confiar en él. La sesión vive en `localStorage`, no en cookies, así que el
// servidor no sabe quién pide esta página: un `curl` nunca ve este componente.
//
// Quien rechaza de verdad son las otras dos capas, y las dos comprueban lo
// mismo: `adminDeToken` en cada API administrativa e `is_admin_mfa()` en las
// policies de RLS. Ver `lib/admin-auth.ts` y la migración 007.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { user, profile, ready } = useAuth();
  const { estado } = useAdminSesion();
  const isLogin = path === "/admin/login";
  const isMfa = path === "/admin/mfa";

  useEffect(() => {
    if (!ready || isLogin) return;
    if (!user) { router.replace("/admin/login"); return; }
    if (!profile?.is_admin) { router.replace("/"); return; }
    // Sin segundo factor no se dibuja el dashboard: se manda a registrarlo. No
    // es una barrera de seguridad (ver arriba), es no mostrar botones que la
    // API va a rechazar igual.
    if (!isMfa && estado !== "cargando" && estado !== "listo") router.replace("/admin/mfa");
  }, [ready, isLogin, isMfa, user, profile, estado, router]);

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.push("/admin/login");
  }

  if (isLogin) return <>{children}</>;
  if (!ready || !user) return <div className="admin"><p className="loading">Verificando sesión…</p></div>;
  if (!profile?.is_admin) return <div className="admin"><p className="loading">No tenés permisos para esta sección.</p></div>;
  if (estado === "cargando") return <div className="admin"><p className="loading">Verificando el segundo factor…</p></div>;

  return (
    <>
      <nav className="admin-nav" aria-label="Secciones del panel">
        <Link href="/admin/top" aria-current={path.startsWith("/admin/top") ? "page" : undefined}>
          Top semanal
        </Link>
        <Link href="/admin" aria-current={path === "/admin" ? "page" : undefined}>
          Reseñas editoriales
        </Link>
        <button type="button" onClick={logout}>Salir</button>
      </nav>
      {children}
    </>
  );
}
