"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { supabaseBrowser } from "@/lib/supabase";
import { useAdminSesion } from "@/components/admin/useAdminSesion";
import { decidirAccesoAdmin } from "@/lib/admin-acceso";

// 🔴 ESTE GUARD ES SÓLO EXPERIENCIA DE USUARIO, y conviene tenerlo claro antes
// de confiar en él. La sesión vive en `localStorage`, no en cookies, así que el
// servidor no sabe quién pide esta página: un `curl` nunca ve este componente.
//
// Quien rechaza de verdad son las otras dos capas, y las dos comprueban lo
// mismo: `adminDeToken` en cada API administrativa e `is_admin_mfa()` en las
// policies de RLS. Ver `lib/admin-auth.ts` y la migración 007.
//
// La decisión vive en `decidirAccesoAdmin` (lib/admin-acceso.ts). Con el perfil
// todavía en camino ESPERA y con un error de lectura lo MUESTRA para reintentar:
// antes los dos casos se leían como "no es administrador" y mandaban a `/`, que
// es el "termino en el Yump público" que informó el dueño el 17/10.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { user, profile, ready, estadoPerfil, reintentarPerfil } = useAuth();
  const { estado } = useAdminSesion();
  const isLogin = path === "/admin/login";
  const acceso = decidirAccesoAdmin({
    ready, usuario: !!user, estadoPerfil, esAdmin: !!profile?.is_admin, mfa: estado, ruta: path,
  });
  const destino = acceso.tipo === "ir" ? acceso.a : null;

  useEffect(() => {
    // Sin sesión → login; sin segundo factor completo → MFA. Las dos conservan
    // la sección pedida en `?destino=`. Nunca a `/`: un perfil pendiente espera,
    // un error se muestra y una cuenta sin permisos ve su mensaje.
    if (destino) router.replace(destino);
  }, [destino, router]);

  // Cierra SÓLO esta sesión (sin scope, auth-js revoca todas las de la cuenta).
  async function logout() {
    await supabaseBrowser().auth.signOut({ scope: "local" });
    router.push("/admin/login");
  }

  if (isLogin) return <>{children}</>;
  if (acceso.tipo === "esperar") {
    const texto = acceso.motivo === "mfa" ? "Verificando el segundo factor…"
      : acceso.motivo === "perfil" ? "Verificando permisos…" : "Verificando sesión…";
    return <div className="admin"><p className="loading">{texto}</p></div>;
  }
  if (acceso.tipo === "ir") return <div className="admin"><p className="loading">Redirigiendo…</p></div>;
  if (acceso.tipo === "error-perfil") {
    return (
      <div className="admin">
        <p className="admin-error" role="alert">No pudimos verificar tus permisos. Revisá la conexión e intentá de nuevo.</p>
        <button type="button" onClick={() => void reintentarPerfil()}>Reintentar</button>
      </div>
    );
  }
  if (acceso.tipo === "sin-permisos") {
    return (
      <div className="admin">
        <p className="loading">No tenés permisos para esta sección.</p>
        <p><Link href="/">Ir a Yump</Link> · <button type="button" onClick={logout}>Salir</button></p>
      </div>
    );
  }

  return (
    <>
      <nav className="admin-nav" aria-label="Secciones del panel">
        <Link href="/admin/top" aria-current={path.startsWith("/admin/top") ? "page" : undefined}>
          Top semanal
        </Link>
        <Link href="/admin/moderacion" aria-current={path.startsWith("/admin/moderacion") ? "page" : undefined}>
          Moderación
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
