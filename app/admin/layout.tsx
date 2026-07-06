"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (path === "/admin/login") { setChecked(true); return; }
    supabaseBrowser().auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/admin/login");
      else setChecked(true);
    });
  }, [path, router]);

  if (!checked) return <div className="admin"><p className="loading">Verificando sesión…</p></div>;
  return <>{children}</>;
}
