"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { apiUrl } from "@/lib/api-base";

// La fila "Usuarios bloqueados" de Configuración (E3b). Aparece sólo si las
// reseñas de la comunidad están activas o si la cuenta ya bloqueó a alguien
// (para poder deshacerlo aunque el módulo se apague). Si la consulta falla,
// no se muestra: la página sigue igual que antes de E3b.
export default function FilaBloqueados() {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const { data } = await supabaseBrowser().auth.getSession();
        const t = data.session?.access_token;
        if (!t) return;
        const r = await fetch(apiUrl("/api/comunidad/bloqueos"), {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` }, body: JSON.stringify({ accion: "listar" }),
        });
        const j = r.ok ? ((await r.json()) as { activo?: boolean; bloqueados?: unknown[] }) : null;
        if (vivo && j && (j.activo === true || (j.bloqueados?.length ?? 0) > 0)) setVer(true);
      } catch { /* sin fila */ }
    })();
    return () => { vivo = false; };
  }, []);
  if (!ver) return null;
  return (
    <div className="cfg-row">
      <div className="cfg-info">
        <div className="cfg-lbl">Usuarios bloqueados</div>
        <div className="cfg-sub">Personas cuyas reseñas de la comunidad no ves.</div>
      </div>
      <Link href="/cuenta/bloqueados" className="btn ghost">Ver</Link>
    </div>
  );
}
